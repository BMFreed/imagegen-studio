import type { ProjectGenerateOptions } from '../../shared/projects/project-generation-actions.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { isDeepStrictEqual } from 'node:util'

import type { FrozenGenerationVae } from './illustrious-generation-vae.js'
import type { RegionalWorkerInput } from './regional-worker-request.js'
import type { RegionalProjectFixture } from './test-fixtures/regional-project.js'

import { openAppDatabase } from '../db/database.js'
import { ProjectGenerationActionController } from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { provenanceFromVerifiedRasterCandidate } from './project-generation-provenance.js'
import { ProjectRegionalGenerationCoordinator } from './project-regional-generation-coordinator.js'
import { parseAcceptedGenerationBaseV1 } from './regional-queued-generation.js'
import { prepareRegionalWorkerRequest } from './regional-worker-request.js'
import {
  createRegionalProjectFixture,
  regionalProjectDigest,
} from './test-fixtures/regional-project.js'

type Precision = 'Auto' | 'FP16' | 'FP32'
type ResourceKey = 'A' | 'B' | 'TwinA'
type Resource = { bytes: Buffer; descriptor: FrozenGenerationVae }
type ActionRuntime = ConstructorParameters<typeof ProjectGenerationActionController>[0]['runtime']
type WorkerRuntime = ConstructorParameters<typeof GenerationDispatchCoordinator>[0]
type Fixture = Awaited<ReturnType<typeof vaeFixture>>
type Loaded = Awaited<ReturnType<Fixture['queue']['loadVerifiedRegionalInput']>>

/**
 * Real Service/capture/planner/SQLite/files/receipt/provenance boundaries; model qualification,
 * composition and numerical inference are explicitly controlled substitutes. Tiny files below are
 * Main identity fixtures, never native VAEs. InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd:
 * generation/core/graph.ts chooses the compatible VAE override and l2i.fp32; model.py's
 * VAELoaderInvocation and vae/latents_to_image.py preserve selection and decode precision.
 */
async function vaeFixture() {
  const f = await createRegionalProjectFixture()
  const resources = {} as Record<ResourceKey, Resource>
  const modelId = randomUUID()
  for (const [index, key] of (['A', 'B'] as const).entries()) {
    const bytes = Buffer.from(`Explicit Main-only exact VAE substitute ${key}`)
    const managedPath = path.join(f.root, `regional-vae-${key}.safetensors`)
    await writeFile(managedPath, bytes, { mode: 0o600 })
    resources[key] = {
      bytes,
      descriptor: {
        byteSize: bytes.length,
        managedPath,
        reference: {
          ...f.reference,
          civitaiFileId: 9300 + index,
          civitaiModelId: 9100,
          civitaiVersionId: 9200 + index,
          displayName: 'Exact VAE fixture',
          fileSha256: regionalProjectDigest(bytes),
          kind: 'vae',
          localModelId: modelId,
          localVersionId: randomUUID(),
          predictionType: null,
          versionName: `Saved ${key}`,
        },
      },
    }
  }
  resources.TwinA = {
    bytes: resources.A.bytes,
    descriptor: {
      ...resources.A.descriptor,
      reference: {
        ...resources.A.descriptor.reference,
        civitaiFileId: 9402,
        civitaiModelId: 9400,
        civitaiVersionId: 9401,
        localModelId: randomUUID(),
        localVersionId: randomUUID(),
      },
    },
  }
  const controls: {
    beforeWorker?: () => Promise<void>
    failSeeds: Set<number>
    libraryDefault: ResourceKey
    ready: ReturnType<RegionalProjectFixture['input']>['ready']
    resolve?: (key: ResourceKey) => Promise<void>
    wrongReference: boolean
  } = {
    failSeeds: new Set(),
    libraryDefault: 'A',
    ready: {
      ...f.input().ready,
      capabilities: [
        ...f.input().ready.capabilities,
        'illustrious-regional-invoke-v1',
        'illustrious-regional-invoke-init-v1',
        'illustrious-regional-lora-v1',
        'illustrious-regional-vae-v1',
      ],
    },
    wrongReference: false,
  }
  const resolved: ResourceKey[] = []
  f.models.resolveVerifiedGenerationVaeForPlan = async (saved) => {
    const key = (Object.keys(resources) as ResourceKey[]).find((name) =>
      isDeepStrictEqual(resources[name].descriptor.reference, saved),
    )
    assert.ok(key, 'Resolve the full exact saved VAE identity, never the library Default.')
    resolved.push(key)
    await controls.resolve?.(key)
    const resource = resources[key]
    let bytes: Buffer
    try {
      bytes = await readFile(resource.descriptor.managedPath)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw Object.assign(new Error('The exact Main-only VAE file is missing.'), {
          code: 'MODEL_FILE_MISSING',
        })
      }
      throw error
    }
    if (!bytes.equals(resource.bytes)) {
      throw Object.assign(new Error('The exact Main-only VAE bytes changed.'), {
        code: 'MODEL_FILE_CORRUPT',
      })
    }
    return structuredClone(
      controls.wrongReference ? resources.TwinA.descriptor : resource.descriptor,
    )
  }
  const publicCoordinator = new ProjectRegionalGenerationCoordinator({
    compositionProfile: 'invoke-canvas-v1',
    gate: f.gate,
    models: f.models,
    orchestrator: f.orchestrator,
    projects: f.projects,
    scratchBasePath: f.scratch,
  })
  const consumed: RegionalWorkerInput[] = []
  const runtime: ActionRuntime & WorkerRuntime = {
    getStatus: async () => null,
    readQualifiedInferenceReady: async () => structuredClone(controls.ready),
    retryUnconfirmedGenerationExit: async () => true,
    withGenerationAdmission: async (_scratch, use) => await use(structuredClone(controls.ready)),
    withGenerationPreparation: async (_scratch, use) =>
      await use({
        inferenceReady: structuredClone(controls.ready),
        targetWorker: f.compositionWorker,
      }),
    withGenerationWorker: async (_scratch, use) => {
      await controls.beforeWorker?.()
      return await use({
        ...f.transport({
          executeCurrentCanvasRegional: async (input) => {
            consumed.push(structuredClone(input))
            if (controls.failSeeds.has(input.request.job.sampling.seed)) {
              throw new Error('Controlled frozen regional VAE inference refusal')
            }
            return f.resultFor(input)
          },
          ready: structuredClone(controls.ready),
        }),
        generate: async () => assert.fail('Regional VAE cannot enter ordinary inference.'),
      })
    },
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
  return { ...f, actions, consumed, controls, publicCoordinator, resolved, resources }
}

async function withFixture(use: (f: Fixture) => Promise<void>) {
  const f = await vaeFixture()
  try {
    await use(f)
  } finally {
    f.controls.beforeWorker = undefined
    f.controls.resolve = undefined
    await f.actions.shutdown()
    await f.publicCoordinator.shutdown()
    await f.close()
  }
}

async function select(f: Fixture, external = true, precision: Precision | undefined = 'FP32') {
  await f.edit((document) => {
    document.generationDraft.vae = external
      ? structuredClone(f.resources.A.descriptor.reference)
      : null
    if (precision === undefined) {
      delete document.generationDraft.vaePrecision
    } else {
      document.generationDraft.vaePrecision = precision
    }
  })
  await f.projects.save(f.tabId)
}

function options(f: Fixture, iterations = 1): ProjectGenerateOptions {
  return { documentId: f.document().documentId, iterations }
}

async function queued(
  f: Fixture,
  iterations = 1,
  confirmation?: ProjectGenerateOptions['confirmation'],
) {
  const result = await f.actions.generate(f.tabId, {
    ...options(f, iterations),
    ...(confirmation ? { confirmation } : {}),
  })
  assert.equal(result.kind, 'queued')
  if (result.kind !== 'queued') {
    assert.fail('The complete public regional VAE batch must admit.')
  }
  assert.equal(result.jobIds.length, iterations)
  assert.equal(result.truncated, false)
  return result
}

async function rows(f: Fixture) {
  return await f.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute()
}

async function settled(f: Fixture, ids: readonly string[]) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const stored = await rows(f)
    const jobs = ids.map((id) => {
      const item = stored.find((row) => row.id === id)
      assert.ok(item)
      return item
    })
    const state = await f.actions.getState(f.tabId)
    if (
      state.phase === 'idle' &&
      jobs.every((item) => ['canceled', 'completed', 'failed'].includes(item.status))
    ) {
      return jobs
    }
    assert.notEqual(state.phase, 'blocked', state.error?.message ?? 'Recovery must finish.')
    await setImmediate()
  }
  assert.fail('Regional VAE jobs did not settle before their bounded deadline.')
}

async function snapshot(f: Fixture) {
  return {
    candidates: await f.staging.listVerifiedCandidates(f.tabId),
    files: await readdir(path.join(f.root, 'generation-inputs')),
    rows: await rows(f),
  }
}

function wire(f: Fixture) {
  const { byteSize, managedPath, reference } = f.resources.A.descriptor
  return { byteSize, path: managedPath, sha256: reference.fileSha256 }
}

function withoutCapability(f: Fixture) {
  f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
    (capability) => capability !== 'illustrious-regional-vae-v1',
  )
}

function assertFrozen(f: Fixture, loaded: Loaded, precision: Precision = 'FP32') {
  assert.deepEqual(loaded.payload.context.vae, f.resources.A.descriptor)
  assert.deepEqual(loaded.payload.workerJob.vae, wire(f))
  assert.deepEqual(loaded.input.request.job.vae, wire(f))
  assert.equal(loaded.payload.context.vaePrecision, precision)
  assert.equal(loaded.payload.workerJob.vaePrecision, precision)
  assert.equal(loaded.input.request.job.vaePrecision, precision)
  assert.equal('vae' in loaded.input.recipe, false)
  assert.equal('vaePrecision' in loaded.input.recipe, false)
  assert.equal(f.resolved.includes('B'), false)
  assert.equal(f.resolved.includes('TwinA'), false)
}

for (const external of [false, true]) {
  for (const precision of ['Auto', 'FP16', 'FP32'] as const) {
    test(`public regional ${external ? 'exact external' : 'Embedded'} VAE preserves ${precision}`, async () => {
      await withFixture(async (f) => {
        await select(f, external, precision)
        const result = await queued(f)
        assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
        const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
        if (external) {
          assertFrozen(f, loaded, precision)
        } else {
          assert.equal(loaded.payload.context.vae, null)
          assert.equal(loaded.payload.workerJob.vae, null)
          assert.equal(loaded.input.request.job.vae, null)
          assert.equal(loaded.payload.context.vaePrecision, precision)
          assert.equal(f.resolved.length, 0)
        }
        assert.equal((await f.actions.getState(f.tabId)).regionalVaeSupported, true)
        assert.equal(
          (await f.queue.getManagerEntry(result.jobIds[0])).details?.requiresRegionalVae,
          external || precision !== 'FP16' ? true : undefined,
        )
        assert.deepEqual(f.consumed[0].request.job, loaded.input.request.job)
      })
    })
  }
}

test('public regional Embedded FP16 VAE control stays compatible', async () => {
  await withFixture(async (f) => {
    withoutCapability(f)
    const result = await queued(f)
    assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
    assert.equal(f.resolved.length, 0)
    assert.equal((await f.actions.getState(f.tabId)).regionalVaeSupported, false)
    assert.equal(
      (await f.queue.getManagerEntry(result.jobIds[0])).details?.requiresRegionalVae,
      undefined,
    )
  })
})

test('public regional VAE capability refusal precedes composition', async () => {
  await withFixture(async (f) => {
    await select(f, true, 'FP16')
    withoutCapability(f)
    const before = await snapshot(f)
    await assert.rejects(f.actions.generate(f.tabId, options(f)), {
      code: 'GENERATION_RUNTIME_UNAVAILABLE',
    })
    assert.equal(f.calls.compose.length, 0)
    assert.equal(f.resolved.length, 0)
    assert.deepEqual(await snapshot(f), before)
  })
})

for (const precision of ['Auto', 'FP32'] as const) {
  test(`public regional Embedded ${precision} requires the regional VAE capability`, async () => {
    await withFixture(async (f) => {
      await select(f, false, precision)
      withoutCapability(f)
      const before = await snapshot(f)
      await assert.rejects(f.actions.generate(f.tabId, options(f)), {
        code: 'GENERATION_RUNTIME_UNAVAILABLE',
      })
      assert.equal(f.calls.compose.length, 0)
      assert.equal(f.resolved.length, 0)
      assert.deepEqual(await snapshot(f), before)
    })
  })
}

test('public regional absent VAE precision freezes Auto without rewriting authoring', async () => {
  await withFixture(async (f) => {
    await select(f, false, 'Auto')
    await f.edit((document) => {
      delete document.generationDraft.vaePrecision
    })
    await f.projects.save(f.tabId)
    const before = structuredClone(f.document())
    const saved = await readFile(f.packagePath)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    assert.equal(loaded.payload.context.vaePrecision, 'Auto')
    assert.equal(loaded.input.request.job.vaePrecision, 'Auto')
    assert.deepEqual(f.document(), before)
    assert.ok((await readFile(f.packagePath)).equals(saved))
  })
})

test('private regional VAE and precision refusals remain independent of public support', async () => {
  await withFixture(async (f) => {
    for (const [external, precision] of [
      [true, 'FP16'],
      [false, 'Auto'],
      [false, 'FP32'],
    ] as const) {
      await select(f, external, precision)
      await assert.rejects(f.coordinator.submit(f.tabId, f.input()), { code: 'UNSUPPORTED' })
    }
    assert.equal(f.calls.compose.length, 0)
  })
})

test('public regional VAE native bundle keeps logical exact VAE and precision', async () => {
  await withFixture(async (f) => {
    await select(f)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    const original = structuredClone(loaded.input)
    const lease = await prepareRegionalWorkerRequest(loaded.input, f.scratch)
    try {
      const bundle = JSON.parse(await readFile(lease.wire.bundle.path, 'utf8')) as Pick<
        RegionalWorkerInput,
        'recipe' | 'request'
      >
      assert.deepEqual(bundle.request.job.vae, wire(f))
      assert.equal(bundle.request.job.vaePrecision, 'FP32')
      assert.deepEqual(lease.request.job.vae, wire(f))
      assert.equal('vae' in bundle.recipe, false)
      assert.deepEqual(loaded.input, original)
    } finally {
      await lease.dispose()
    }
  })
})

for (const fault of ['descriptor-omitted', 'precision', 'path', 'size'] as const) {
  test(`public regional VAE ${fault} disagreement refuses before publication`, async () => {
    await withFixture(async (f) => {
      await select(f)
      const result = await queued(f)
      await settled(f, result.jobIds)
      const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      const before = await snapshot(f)
      const input = structuredClone(loaded.input)
      const context = structuredClone(loaded.payload.context)
      input.request.requestId = randomUUID()
      if (fault === 'descriptor-omitted') {
        input.request.job.vae = null
      }
      if (fault === 'precision') {
        input.request.job.vaePrecision = 'FP16'
      }
      if (fault === 'path') {
        input.request.job.vae!.path = f.resources.B.descriptor.managedPath
      }
      if (fault === 'size') {
        input.request.job.vae!.byteSize++
      }
      const { request, ...regional } = input
      await assert.rejects(
        f.queue.enqueueInvokeCanvasRegional({
          preflight: async () =>
            assert.fail('Invalid VAE agreement must refuse before publication.'),
          prepared: { context, targetPngBytes: Buffer.from(f.targetBytes) },
          projectPath: f.packagePath,
          regional,
          request,
          stagingSessionId: randomUUID(),
        }),
        { code: 'QUEUE_INPUT_INVALID' },
      )
      assert.deepEqual(await snapshot(f), before)
    })
  })
}

test('public regional VAE resolver cannot replace saved exact identity with same-byte catalog resource', async () => {
  await withFixture(async (f) => {
    await select(f)
    f.controls.wrongReference = true
    const before = await snapshot(f)
    await assert.rejects(f.actions.generate(f.tabId, options(f)))
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.consumed.length, 0)
  })
})

test('public regional VAE batch and frozen Retry ignore saved VAE precision Default and TI edits', async () => {
  await withFixture(async (f) => {
    await select(f)
    await f.edit((document) => {
      document.generationDraft.positivePrompt = {
        embeddingRefs: [structuredClone(f.embedding)],
        text: `global ${f.embedding.token}`,
      }
    })
    f.controls.failSeeds.add(124)
    const result = await queued(f, 2)
    assert.deepEqual(
      (await settled(f, result.jobIds)).map((job) => job.status),
      ['completed', 'failed'],
    )
    const original = await f.queue.loadVerifiedRegionalInput(result.jobIds[1])
    f.controls.libraryDefault = 'B'
    await f.edit((document) => {
      document.generationDraft.vae = structuredClone(f.resources.B.descriptor.reference)
      document.generationDraft.vaePrecision = 'FP16'
      document.generationDraft.positivePrompt = { embeddingRefs: [], text: 'Saved later subject' }
      document.generationDraft.seed.value = 999
      document.regionalGuidance = []
    })
    await f.projects.save(f.tabId)
    const authored = structuredClone(f.document())
    const saved = await readFile(f.packagePath)
    const before = await snapshot(f)
    assert.equal(
      (await f.queue.getManagerEntry(original.item.id)).details?.requiresRegionalVae,
      true,
    )
    const capable = structuredClone(f.controls.ready)
    withoutCapability(f)
    await assert.rejects(
      f.actions.retryJob({ id: original.item.id, statusSequence: original.item.statusSequence }),
      { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
    )
    assert.deepEqual(await snapshot(f), before)
    f.controls.ready = capable
    f.controls.failSeeds.clear()
    await f.actions.retryJob({ id: original.item.id, statusSequence: original.item.statusSequence })
    const retry = (await rows(f)).find((row) => !result.jobIds.includes(row.id))
    assert.ok(retry)
    assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
    const loaded = await f.queue.loadVerifiedRegionalInput(retry.id)
    assert.deepEqual(loaded.payload, original.payload)
    assertFrozen(f, loaded)
    assert.deepEqual(f.consumed[2].recipe, original.input.recipe)
    assert.equal(f.calls.compose.length, 1)
    assert.deepEqual(f.document(), authored)
    assert.ok((await readFile(f.packagePath)).equals(saved))
  })
})

for (const fault of ['missing', 'changed'] as const) {
  test(`public regional VAE ${fault} frozen file refuses Retry before SQL`, async () => {
    await withFixture(async (f) => {
      await select(f)
      f.controls.failSeeds.add(123)
      const result = await queued(f)
      await settled(f, result.jobIds)
      const source = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      const before = await snapshot(f)
      const resource = f.resources.A
      await (fault === 'missing'
        ? rm(resource.descriptor.managedPath)
        : writeFile(resource.descriptor.managedPath, Buffer.from('Changed exact frozen VAE')))
      await assert.rejects(
        f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence }),
        {
          code: fault === 'missing' ? 'MODEL_FILE_MISSING' : 'MODEL_FILE_CORRUPT',
        },
      )
      assert.deepEqual(await snapshot(f), before)
      assert.equal(f.consumed.length, 1)
      await writeFile(resource.descriptor.managedPath, resource.bytes, { mode: 0o600 })
      f.controls.failSeeds.clear()
      await f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence })
      const retry = (await rows(f)).find((row) => row.id !== source.item.id)
      assert.ok(retry)
      assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
      assert.deepEqual((await f.queue.loadVerifiedRegionalInput(retry.id)).payload, source.payload)
      assertFrozen(f, await f.queue.loadVerifiedRegionalInput(retry.id))
    })
  })
}

test('public regional VAE bootstrap recovery keeps original selection without automatic dispatch', async () => {
  await withFixture(async (f) => {
    await select(f)
    const admitted = await f.gate.run(
      f.tabId,
      async () =>
        await f.publicCoordinator.submitInvokeBatchUnderGate(f.tabId, {
          ...f.owner(),
          iterations: 2,
          withPreparation: async (use) =>
            await use({
              inferenceReady: structuredClone(f.controls.ready),
              targetWorker: f.compositionWorker,
            }),
        }),
    )
    const original = await f.queue.loadVerifiedRegionalInput(admitted[1].id)
    const connection = openAppDatabase(f.root, path.resolve('src/main/db/migrations'))
    try {
      const recovered = new GenerationQueueRepository(connection.db, f.root)
      assert.equal((await recovered.recoverAfterRestart()).canceledCount, 2)
      assert.equal(f.consumed.length, 0)
      for (const item of admitted) {
        assertFrozen(f, await recovered.loadVerifiedRegionalInput(item.id))
      }
      await select(f, false, 'FP16')
      const terminal = await recovered.getManagerEntry(admitted[1].id)
      await f.actions.retryJob({ id: terminal.id, statusSequence: terminal.statusSequence })
      const retry = (await rows(f)).find((row) => !admitted.some((item) => item.id === row.id))
      assert.ok(retry)
      assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
      assert.deepEqual(
        (await recovered.loadVerifiedRegionalInput(retry.id)).payload,
        original.payload,
      )
      assert.equal(f.consumed.length, 1)
    } finally {
      await connection.close()
    }
  })
})

test('public regional VAE accepted provenance preserves original selected VAE and precision with global TI', async () => {
  await withFixture(async (f) => {
    await select(f)
    await f.edit((document) => {
      document.generationDraft.positivePrompt = {
        embeddingRefs: [structuredClone(f.embedding)],
        text: `global ${f.embedding.token}`,
      }
    })
    const authored: IgsProjectDocumentV1 = structuredClone(f.document())
    const result = await queued(f)
    await settled(f, result.jobIds)
    const candidate = (await f.staging.listVerifiedCandidates(f.tabId))[0]
    const base = parseAcceptedGenerationBaseV1(candidate.frozenPayloadJson)
    assert.equal(base.kind, 'illustrious-txt2img')
    if (base.kind !== 'illustrious-txt2img') {
      assert.fail('Retain the ordinary portable base.')
    }
    assert.deepEqual(base.context.vae, f.resources.A.descriptor)
    const provenance = provenanceFromVerifiedRasterCandidate({
      acceptedAt: candidate.completedAt,
      candidate,
      imagePngBytes: Buffer.from(f.outputBytes),
    })
    assert.equal(provenance.kind, 'illustrious-txt2img')
    assert.deepEqual(provenance.generationConfiguration.vae, authored.generationDraft.vae)
    assert.equal(provenance.generationConfiguration.vaePrecision, 'FP32')
    assert.deepEqual(provenance.generationConfiguration.positivePrompt.embeddingRefs, [f.embedding])
    for (const field of [
      'regionalGuidance',
      'compositionProfile',
      'initializationProfile',
      'managedPath',
    ]) {
      assert.equal(JSON.stringify(provenance).includes(`"${field}"`), false)
    }
    assert.deepEqual(f.document(), authored)
  })
})
