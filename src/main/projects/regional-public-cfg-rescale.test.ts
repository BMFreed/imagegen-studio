import { supportsInferenceRegionalCFGRescale } from '../../shared/projects/inference-worker-capabilities.js'
import { isProjectGenerationActionState } from '../../shared/projects/project-generation-actions.js'
import type { ProjectGenerateOptions } from '../../shared/projects/project-generation-actions.js'
import { getInvokeRegionalGenerationUnavailableReason } from '../../shared/projects/regional-invoke-generation.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'

import type { RegionalWorkerInput } from './regional-worker-request.js'

import { generationQueueRetryReason } from '../../renderer/components/generation-queue-retry.js'
import { openAppDatabase } from '../db/database.js'
import { ProjectGenerationActionController } from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationWorkerClient } from './generation-worker-client.js'
import { provenanceFromVerifiedRasterCandidate } from './project-generation-provenance.js'
import { ProjectRegionalGenerationCoordinator } from './project-regional-generation-coordinator.js'
import {
  parseAcceptedGenerationBaseV1,
  parseFrozenQueuedRegionalInvokeV1,
  parseFrozenQueuedRegionalV1,
} from './regional-queued-generation.js'
import { captureRegionalWorkerInput } from './regional-worker-request.js'
import {
  createRegionalProjectFixture,
  regionalProjectDigest,
} from './test-fixtures/regional-project.js'
import { createRegionalQueueFixture, REGIONAL_QUEUE_READY } from './test-fixtures/regional-queue.js'

const CAPABILITY = 'illustrious-regional-cfg-rescale-v1'
type Sampler = 'DPM++ 2M' | 'Euler' | 'Euler a'
type Fixture = Awaited<ReturnType<typeof cfgFixture>>

/**
 * Current InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd graph.ts forwards the multiplier;
 * sd/denoise_latents.py installs RescaleCFGExt after CFG combination and before scheduler.step
 * (extensions/rescale_cfg.py and diffusion_backend.py). These tests exercise genuine Service
 * Save/reopen/capture, queue/files/SQLite, dispatch, PNG receipts and accepted provenance.
 * Catalog/target composition and numerical inference are controlled substitutes; no native rescale
 * proof follows.
 */
async function cfgFixture() {
  const f = await createRegionalProjectFixture()
  const controls = {
    fail: false,
    ready: {
      ...f.input().ready,
      capabilities: [
        ...f.input().ready.capabilities,
        'illustrious-regional-invoke-v1',
        'illustrious-regional-invoke-init-v1',
        'illustrious-regional-dpmpp-2m-v1',
        CAPABILITY,
      ],
    },
  }
  const consumed: RegionalWorkerInput[] = []
  const counters = { admission: 0, preparation: 0 }
  const publicCoordinator = new ProjectRegionalGenerationCoordinator({
    compositionProfile: 'invoke-canvas-v1',
    gate: f.gate,
    models: f.models,
    orchestrator: f.orchestrator,
    projects: f.projects,
    scratchBasePath: f.scratch,
  })
  const runtime: ConstructorParameters<typeof GenerationDispatchCoordinator>[0] &
    ConstructorParameters<typeof ProjectGenerationActionController>[0]['runtime'] = {
    getStatus: async () => null,
    readQualifiedInferenceReady: async () => structuredClone(controls.ready),
    retryUnconfirmedGenerationExit: async () => true,
    withGenerationAdmission: async (_scratch, use) => {
      counters.admission++
      return await use(structuredClone(controls.ready))
    },
    withGenerationPreparation: async (_scratch, use) => {
      counters.preparation++
      return await use({
        inferenceReady: structuredClone(controls.ready),
        targetWorker: f.compositionWorker,
      })
    },
    withGenerationWorker: async (_scratch, use) =>
      await use({
        ...f.transport({
          executeCurrentCanvasRegional: async (input) => {
            consumed.push(structuredClone(input))
            if (controls.fail) {
              throw new Error('Controlled regional inference failure')
            }
            return f.resultFor(input)
          },
          ready: structuredClone(controls.ready),
        }),
        generate: async () => assert.fail('Regional input must not enter ordinary dispatch.'),
      }),
  }
  const dispatch = new GenerationDispatchCoordinator(
    runtime,
    f.orchestrator,
    f.processor,
    f.scratch,
    undefined,
    publicCoordinator,
  )
  const actions = new ProjectGenerationActionController({
    dispatch,
    gate: f.gate,
    models: f.models,
    orchestrator: f.orchestrator,
    processor: f.processor,
    projects: f.projects,
    queue: f.queue,
    regional: publicCoordinator,
    runtime,
    scratchBasePath: f.scratch,
    staging: f.staging,
  })
  return { ...f, actions, consumed, controls, counters, publicCoordinator }
}

async function withFixture(use: (fixture: Fixture) => Promise<void>) {
  const f = await cfgFixture()
  try {
    await use(f)
  } finally {
    await f.actions.shutdown()
    await f.publicCoordinator.shutdown()
    await f.close()
  }
}

async function select(
  f: Fixture,
  cfgRescale: number | undefined,
  sampler: Sampler = 'Euler',
  scheduler: 'Karras' | 'Normal' = 'Normal',
  withEmbedding = false,
) {
  await f.edit((document) => {
    if (cfgRescale === undefined) {
      delete document.generationDraft.cfgRescale
    } else {
      document.generationDraft.cfgRescale = cfgRescale
    }
    document.generationDraft.sampling.sampler = sampler
    document.generationDraft.sampling.scheduler = scheduler
    document.generationDraft.sampling.steps = 3
    document.generationDraft.positivePrompt = {
      embeddingRefs: withEmbedding ? [structuredClone(f.embedding)] : [],
      text: withEmbedding ? 'subject <regional-fixture>' : 'rescale subject',
    }
  })
  await f.projects.save(f.tabId)
  await f.projects.close(f.tabId)
  assert.equal((await f.projects.open(f.tabId)).kind, 'opened')
  return structuredClone(f.document())
}

async function rows(f: Fixture) {
  return await f.db.selectFrom('generation_queue_item').selectAll().orderBy('created_at').execute()
}

async function snapshot(f: Fixture) {
  return {
    candidates: await f.staging.listVerifiedCandidates(f.tabId),
    document: structuredClone(f.document()),
    files: await readdir(path.join(f.root, 'generation-inputs')).catch(() => [] as string[]),
    rows: await rows(f),
    saved: regionalProjectDigest(await readFile(f.packagePath)),
  }
}

async function queueOne(f: Fixture) {
  const options: ProjectGenerateOptions = {
    documentId: f.document().documentId,
    iterations: 1,
  }
  const result = await f.actions.generate(f.tabId, options)
  assert.equal(result.kind, 'queued')
  if (result.kind !== 'queued') {
    assert.fail('Expected one regional job.')
  }
  assert.equal(result.jobIds.length, 1)
  return result.jobIds[0]
}

async function settled(f: Fixture, id: string) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const state = await f.actions.getState(f.tabId)
    const item = (await rows(f)).find((row) => row.id === id)
    assert.ok(item)
    if (state.phase === 'idle' && ['canceled', 'completed', 'failed'].includes(item.status)) {
      return item
    }
    assert.notEqual(
      state.phase,
      'blocked',
      state.error?.message ?? 'Regional admission is blocked.',
    )
    await setImmediate()
  }
  assert.fail('Regional fixture did not reach its terminal owner.')
}

function disableRescale(f: Fixture) {
  f.controls.ready.capabilities = f.controls.ready.capabilities.filter((c) => c !== CAPABILITY)
}

test('regional rescale capability is explicit and transient state remains strict', async () => {
  await withFixture(async (f) => {
    assert.equal(supportsInferenceRegionalCFGRescale(f.controls.ready), true)
    const ready = structuredClone(f.controls.ready)
    for (const missing of [
      CAPABILITY,
      'illustrious-regional-invoke-v1',
      'illustrious-cfg-rescale',
    ]) {
      assert.equal(
        supportsInferenceRegionalCFGRescale({
          ...ready,
          capabilities: ready.capabilities.filter((cap) => cap !== missing),
        }),
        false,
      )
    }
    assert.equal(supportsInferenceRegionalCFGRescale({ ...ready, workerVersion: '0.13.0' }), false)
    const state = await f.actions.getState(f.tabId)
    assert.equal(state.regionalCfgRescaleSupported, true)
    for (const value of [undefined, false, true]) {
      assert.equal(
        isProjectGenerationActionState({ ...state, regionalCfgRescaleSupported: value }),
        true,
      )
    }
    for (const value of [null, 0, 'true', {}]) {
      assert.equal(
        isProjectGenerationActionState({ ...state, regionalCfgRescaleSupported: value }),
        false,
      )
    }
    disableRescale(f)
    assert.equal((await f.actions.getState(f.tabId)).cfgRescaleSupported, true)
    assert.equal((await f.actions.getState(f.tabId)).regionalCfgRescaleSupported, false)
  })
})

for (const sampler of ['Euler', 'Euler a', 'DPM++ 2M'] as const) {
  for (const cfgRescale of [0, 0.7, 0.99]) {
    test(`public regional ${sampler} rescale ${cfgRescale} crosses saved Main queue and receipt`, async () => {
      await withFixture(async (f) => {
        const authored = await select(
          f,
          cfgRescale,
          sampler,
          sampler === 'DPM++ 2M' ? 'Karras' : 'Normal',
          true,
        )
        const saved = await readFile(f.packagePath)
        const id = await queueOne(f)
        assert.equal((await settled(f, id)).status, 'completed')
        const frozen = await f.queue.loadVerifiedRegionalInput(id)
        assert.equal(f.consumed.length, 1)
        assert.equal(f.consumed[0].request.job.sampling.cfgRescale, cfgRescale)
        assert.equal(frozen.payload.context.sampling.cfgRescale, cfgRescale)
        assert.equal(frozen.input.request.job.sampling.cfgRescale, cfgRescale)
        assert.equal(frozen.input.recipe.globalPrompts.positive.text, 'subject <regional-fixture>')
        assert.deepEqual(frozen.input.recipe.globalPrompts.positive.embeddingRefs, [f.embedding])
        assert.equal(
          frozen.input.request.job.embeddings?.positive[0].sha256,
          f.embedding.resource.fileSha256,
        )
        assert.deepEqual(f.consumed[0].recipe, frozen.input.recipe)
        const candidate = (await f.staging.listVerifiedCandidates(f.tabId)).find(
          (c) => c.queueItemId === id,
        )
        assert.ok(candidate)
        const base = parseAcceptedGenerationBaseV1(candidate.frozenPayloadJson)
        assert.ok(base.kind === 'illustrious-txt2img')
        assert.equal(base.context.sampling.cfgRescale, cfgRescale)
        const provenance = provenanceFromVerifiedRasterCandidate({
          acceptedAt: candidate.completedAt,
          candidate,
          imagePngBytes: Buffer.from(f.outputBytes),
        })
        assert.equal(provenance.kind, 'illustrious-txt2img')
        assert.equal(provenance.generationConfiguration.cfgRescale, cfgRescale)
        for (const name of ['regionalGuidance', 'compositionProfile', 'initializationProfile']) {
          assert.equal(JSON.stringify(provenance).includes(`"${name}"`), false)
        }
        assert.deepEqual(f.document(), authored)
        assert.ok((await readFile(f.packagePath)).equals(saved))
        assert.equal(f.calls.compose.length, 1)
        assert.equal(f.counters.preparation, 1)
      })
    })
  }
}

test('public regional rescale capability refuses before composition', async () => {
  await withFixture(async (f) => {
    await select(f, 0.7)
    disableRescale(f)
    const before = await snapshot(f)
    await assert.rejects(
      f.actions.generate(f.tabId, { documentId: f.document().documentId, iterations: 1 }),
      { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
    )
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.calls.compose.length, 0)
    assert.equal(f.calls.checkpoint, 0)
    assert.equal(f.consumed.length, 0)
    assert.deepEqual(await readdir(f.scratch), [])
  })
})

for (const cfgRescale of [undefined, 0]) {
  test(`public regional neutral ${String(cfgRescale)} control works without rescale capability`, async () => {
    await withFixture(async (f) => {
      await select(f, cfgRescale)
      disableRescale(f)
      const id = await queueOne(f)
      assert.equal((await settled(f, id)).status, 'completed')
      assert.equal(f.consumed[0].request.job.sampling.cfgRescale, 0)
      assert.equal(
        (await f.queue.loadVerifiedRegionalInput(id)).payload.context.sampling.cfgRescale,
        0,
      )
    })
  })
}

test('public regional rescale coordinator independently refuses before composition', async () => {
  await withFixture(async (f) => {
    await select(f, 0.7)
    disableRescale(f)
    const before = await snapshot(f)
    await assert.rejects(
      f.gate.run(
        f.tabId,
        async () =>
          await f.publicCoordinator.submitInvokeBatchUnderGate(f.tabId, {
            ...f.owner(),
            iterations: 1,
            withPreparation: async (use) =>
              await use({
                inferenceReady: structuredClone(f.controls.ready),
                targetWorker: f.compositionWorker,
              }),
          }),
      ),
      { code: 'INFERENCE_UNAVAILABLE' },
    )
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.calls.compose.length, 0)
    assert.equal(f.calls.checkpoint, 0)
  })
})

test('public regional frozen Retry retains original rescale after saved edits', async () => {
  await withFixture(async (f) => {
    await select(f, 0.7, 'DPM++ 2M', 'Karras', true)
    f.controls.fail = true
    const id = await queueOne(f)
    const item = await settled(f, id)
    assert.equal(item.status, 'failed')
    const source = await f.queue.loadVerifiedRegionalInput(id)
    const authored = await select(f, 0.2, 'Euler')
    const saved = await readFile(f.packagePath)
    f.controls.fail = false
    await f.actions.retryJob({ id, statusSequence: item.status_sequence })
    const retried = (await rows(f)).find((row) => row.id !== id)
    assert.ok(retried)
    assert.equal((await settled(f, retried.id)).status, 'completed')
    assert.equal(f.consumed[1].request.job.sampling.cfgRescale, 0.7)
    assert.equal(f.consumed[1].request.job.sampling.scheduler, 'dpmpp_2m_k')
    assert.deepEqual((await f.queue.loadVerifiedRegionalInput(retried.id)).payload, source.payload)
    assert.deepEqual(f.consumed[1].recipe, source.input.recipe)
    assert.deepEqual(f.document(), authored)
    assert.ok((await readFile(f.packagePath)).equals(saved))
  })
})

test('public regional frozen rescale cannot follow a neutral draft on an old peer', async () => {
  await withFixture(async (f) => {
    await select(f, 0.7)
    f.controls.fail = true
    const id = await queueOne(f)
    const item = await settled(f, id)
    await select(f, 0)
    disableRescale(f)
    const before = await snapshot(f)
    await assert.rejects(f.actions.retryJob({ id, statusSequence: item.status_sequence }), {
      code: 'GENERATION_RUNTIME_UNAVAILABLE',
    })
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.consumed.length, 1)
  })
})

test('neutral frozen Retry control ignores a later nonzero draft without regional rescale support', async () => {
  await withFixture(async (f) => {
    await select(f, 0)
    f.controls.fail = true
    const id = await queueOne(f)
    const item = await settled(f, id)
    await select(f, 0.7)
    disableRescale(f)
    f.controls.fail = false
    await f.actions.retryJob({ id, statusSequence: item.status_sequence })
    const retry = (await rows(f)).find((row) => row.id !== id)
    assert.ok(retry)
    assert.equal((await settled(f, retry.id)).status, 'completed')
    assert.equal(f.consumed[1].request.job.sampling.cfgRescale, 0)
    assert.equal(f.document().generationDraft.cfgRescale, 0.7)
  })
})

test('regional rescale advisory and frozen Retry reasons distinguish ordinary support and neutral history', async () => {
  await withFixture(async (f) => {
    await select(f, 0.7)
    const base = { document: f.document(), iterations: 1, runtimeSupported: true }
    assert.match(
      getInvokeRegionalGenerationUnavailableReason(base)!,
      /Checking image engine support for CFG Rescale/,
    )
    assert.match(
      getInvokeRegionalGenerationUnavailableReason({ ...base, cfgRescaleSupported: false })!,
      /does not support CFG Rescale/,
    )
    assert.equal(
      getInvokeRegionalGenerationUnavailableReason({ ...base, cfgRescaleSupported: true }),
      null,
    )
    for (const regionalCfgRescaleSupported of [undefined, false, true]) {
      const state = { regionalCfgRescaleSupported, regionalSupported: true }
      assert.equal(
        generationQueueRetryReason(
          'illustrious-regional-txt2img',
          state,
          'Euler',
          false,
          false,
          0.7,
        ) === null,
        regionalCfgRescaleSupported === true,
      )
      assert.equal(
        generationQueueRetryReason('illustrious-regional-txt2img', state, 'Euler', false, false, 0),
        null,
      )
    }
    for (const value of [-0.01, 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const document = structuredClone(f.document())
      document.generationDraft.cfgRescale = value
      assert.match(
        getInvokeRegionalGenerationUnavailableReason({
          ...base,
          cfgRescaleSupported: true,
          document,
        })!,
        /from 0 to 0.99/,
      )
    }
  })
})

test('regional frozen nonzero survives database reopen and private history still refuses it', async () => {
  const f = await createRegionalQueueFixture()
  let reopened: Awaited<ReturnType<typeof openAppDatabase>> | undefined
  try {
    f.prepared.context.sampling.cfgRescale = 0.7
    f.request.job.sampling.cfgRescale = 0.7
    const input = {
      ...f.regional,
      compositionProfile: 'invoke-canvas-v1' as const,
      request: f.request,
    }
    const item = await f.queue.enqueueInvokeCanvasRegional({
      prepared: f.prepared,
      projectPath: f.projectPath,
      regional: input,
      request: f.request,
      stagingSessionId: randomUUID(),
    })
    reopened = openAppDatabase(f.dataRoot, path.resolve('src/main/db/migrations'))
    const queue = new GenerationQueueRepository(reopened.db, f.dataRoot)
    await queue.recoverAfterRestart()
    const loaded = await queue.loadVerifiedRegionalInput(item.id)
    assert.equal(loaded.item.status, 'canceled')
    assert.equal(loaded.input.request.job.sampling.cfgRescale, 0.7)
    const raw = JSON.parse(
      (
        await f.db
          .selectFrom('generation_queue_item')
          .select('frozen_payload_json')
          .where('id', '=', item.id)
          .executeTakeFirstOrThrow()
      ).frozen_payload_json,
    ) as Record<string, unknown>
    assert.equal(
      parseFrozenQueuedRegionalInvokeV1(JSON.stringify(raw)).workerJob.sampling.cfgRescale,
      0.7,
    )
    delete raw.compositionProfile
    raw.kind = 'illustrious-regional'
    assert.throws(() => parseFrozenQueuedRegionalV1(JSON.stringify(raw)))
    const privateInput = structuredClone(input)
    delete (privateInput as Partial<RegionalWorkerInput>).compositionProfile
    assert.throws(() => captureRegionalWorkerInput(privateInput), { code: 'INVALID_REQUEST' })
    const before = await f.db.selectFrom('generation_queue_item').selectAll().execute()
    const mismatch = structuredClone(input)
    mismatch.request.job.sampling.cfgRescale = 0.2
    await assert.rejects(
      f.queue.enqueueInvokeCanvasRegional({
        prepared: f.prepared,
        projectPath: f.projectPath,
        regional: mismatch,
        request: mismatch.request,
        stagingSessionId: randomUUID(),
      }),
      { code: 'QUEUE_INPUT_INVALID' },
    )
    assert.deepEqual(await f.db.selectFrom('generation_queue_item').selectAll().execute(), before)
  } finally {
    await reopened?.close()
    await f.close()
  }
})

for (const value of [-0.01, 1, Number.NaN, Number.POSITIVE_INFINITY, true, '0.7', null]) {
  test(`regional rescale malformed ${String(value)} refuses before file preparation`, async () => {
    const f = await createRegionalQueueFixture()
    try {
      const input: RegionalWorkerInput = {
        ...f.regional,
        compositionProfile: 'invoke-canvas-v1',
        request: f.request,
      }
      Reflect.set(input.request.job.sampling, 'cfgRescale', value)
      const before = await readdir(f.dataRoot)
      assert.throws(() => captureRegionalWorkerInput(input), { code: 'INVALID_REQUEST' })
      assert.deepEqual(await readdir(f.dataRoot), before)
      assert.deepEqual(await f.db.selectFrom('generation_queue_item').selectAll().execute(), [])
    } finally {
      await f.close()
    }
  })
}

test('regional rescale reaches original JSONL dispatch and old peer refuses before scratch', async () => {
  const f = await createRegionalQueueFixture()
  let client: GenerationWorkerClient | undefined
  try {
    const runtime = path.join(f.root, 'runtime')
    const scratch = path.join(f.root, 'client-scratch')
    const received = path.join(f.root, 'received.jsonl')
    await mkdir(runtime)
    await mkdir(scratch, { mode: 0o700 })
    const executable = path.join(runtime, 'python')
    const capabilities = [
      ...REGIONAL_QUEUE_READY.capabilities,
      'illustrious-regional-invoke-v1',
      ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : []),
    ]
    const script = (support: boolean) => {
      const ready = {
        ...REGIONAL_QUEUE_READY,
        capabilities: [...capabilities, ...(support ? [CAPABILITY] : [])],
        pythonVersion: '3.12.13',
        type: 'ready',
      }
      return String.raw`#!${process.execPath}
const fs = require('node:fs'), crypto = require('node:crypto');
const args = process.argv.slice(2);
const validArgs = process.platform === 'linux'
  ? args.length === 7 && JSON.stringify(args.slice(0, 6)) === JSON.stringify(['-I', '-m', 'imagegen_worker.owned_inference', '--parent-pid', String(process.ppid), '--scratch-base']) && require('node:path').isAbsolute(args[6])
  : args.join(' ') === '-I -m imagegen_worker.inference_main';
if (!validArgs) process.exit(21);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
process.stdout.write(JSON.stringify(${JSON.stringify(ready)}) + '\n');
require('node:readline').createInterface({input: process.stdin}).on('line', line => {
  const wire = JSON.parse(line);
  if(wire.type !== 'execute-current-canvas-regional') throw Error('Wrong dispatch owner');
  const bytes = fs.readFileSync(wire.bundle.path);
  if(bytes.length !== wire.bundle.byteSize || hash(bytes) !== wire.bundle.sha256) throw Error('Bundle mismatch');
  const bundle = JSON.parse(bytes);
  const target = fs.readFileSync(bundle.request.job.target.path);
  if(hash(target) !== bundle.request.job.target.sha256) throw Error('Target mismatch');
  fs.appendFileSync(${JSON.stringify(received)}, JSON.stringify({cfgRescale: bundle.request.job.sampling.cfgRescale, requestId: wire.requestId, keys: Object.keys(wire).sort()}) + '\n');
  fs.writeFileSync(bundle.request.job.output.pngPath, Buffer.from(${JSON.stringify(f.outputBytes.toString('base64'))}, 'base64'), {flag:'wx'});
  process.stdout.write(JSON.stringify({type:'generation-done',protocolVersion:'1',requestId:wire.requestId,outputPath:bundle.request.job.output.pngPath,seed:bundle.request.job.sampling.seed}) + '\n');
});
`
    }
    const input: RegionalWorkerInput = {
      ...f.regional,
      compositionProfile: 'invoke-canvas-v1',
      request: f.request,
    }
    input.request.job.sampling.cfgRescale = 0.7
    for (const support of [false, true]) {
      await writeFile(executable, script(support))
      await chmod(executable, 0o700)
      client = await GenerationWorkerClient.start(
        { pythonExecutable: executable, runtimeRoot: runtime, scratchBasePath: scratch },
        { requestTimeoutMs: 3000, shutdownWaitMs: 100 },
      )
      if (!support) {
        await assert.rejects(client.executeCurrentCanvasRegional(input), {
          code: 'WORKER_VERSION_MISMATCH',
        })
        assert.deepEqual(await readdir(scratch), [])
        assert.equal(await readFile(received, 'utf8').catch(() => ''), '')
        input.request.job.sampling.cfgRescale = 0
        assert.ok((await client.executeCurrentCanvasRegional(input)).pngBytes.equals(f.outputBytes))
      } else {
        input.request.job.sampling.cfgRescale = 0.7
        assert.ok((await client.executeCurrentCanvasRegional(input)).pngBytes.equals(f.outputBytes))
      }
      await client.close()
      client = undefined
    }
    const observed = (await readFile(received, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { cfgRescale: number; keys: string[] })
    assert.deepEqual(
      observed.map((entry) => entry.cfgRescale),
      [0, 0.7],
    )
    assert.ok(
      observed.every(
        (entry) =>
          JSON.stringify(entry.keys) ===
          JSON.stringify(['bundle', 'protocolVersion', 'requestId', 'stagingRoot', 'type']),
      ),
    )
    assert.deepEqual(await readdir(scratch), [])
  } finally {
    await client?.close()
    await f.close()
  }
})
