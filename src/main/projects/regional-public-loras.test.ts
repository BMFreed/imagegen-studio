import type { ProjectGenerateOptions } from '../../shared/projects/project-generation-actions.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import type { PromptEmbeddingRef } from '../../shared/projects/prompt-embeddings.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { isDeepStrictEqual } from 'node:util'

import type { FrozenGenerationLora, FrozenLoraStack } from './illustrious-generation-loras.js'
import type { RegionalWorkerInput } from './regional-worker-request.js'
import type { RegionalProjectFixture } from './test-fixtures/regional-project.js'

import { openAppDatabase } from '../db/database.js'
import { ProjectGenerationActionController } from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { provenanceFromVerifiedRasterCandidate } from './project-generation-provenance.js'
import { ProjectRegionalGenerationCoordinator } from './project-regional-generation-coordinator.js'
import { parseAcceptedGenerationBaseV1 } from './regional-queued-generation.js'
import {
  captureRegionalWorkerInput,
  prepareRegionalWorkerRequest,
} from './regional-worker-request.js'
import {
  createRegionalProjectFixture,
  regionalProjectDeferred,
  regionalProjectDigest,
} from './test-fixtures/regional-project.js'

type ResourceKey = 'A' | 'B' | 'C' | 'Missing' | 'TwinA' | 'Z'
type Resource = { bytes: Buffer; descriptor: FrozenGenerationLora }
type ActionRuntime = ConstructorParameters<typeof ProjectGenerationActionController>[0]['runtime']
type WorkerRuntime = ConstructorParameters<typeof GenerationDispatchCoordinator>[0]
type Fixture = Awaited<ReturnType<typeof loraFixture>>
type Loaded = Awaited<ReturnType<Fixture['queue']['loadVerifiedRegionalInput']>>
type Bundle = Pick<RegionalWorkerInput, 'recipe' | 'request'>

/**
 * Real Service/capture/coordinator/planner/SQLite/files/receipt/provenance owners; fake model
 * qualification, compositor and native RGB computation are explicit fixture substitutes. These tiny
 * byte files establish Main ownership only, not ML safetensors or numerical LoRA behavior. InvokeAI
 * a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd consulted directly: generation/core/graph.ts,
 * generation/graph.ts, canvas/{compileCanvasGraph,addRegionalGuidance}.ts,
 * app/invocations/model.py, app/invocations/text_encoder/compel.py and
 * app/invocations/sd/denoise_latents.py. The ordered SDXL LoRA collection feeds both CLIPs and
 * UNet; regional conditioning shares those sources.
 */
async function loraFixture() {
  const f = await createRegionalProjectFixture()
  const resources = {} as Record<ResourceKey, Resource>
  for (const [index, key] of (['A', 'B', 'C', 'Z', 'Missing'] as const).entries()) {
    const bytes = Buffer.from(`Explicit Main-only exact LoRA substitute ${key}`)
    const managedPath = path.join(f.root, `regional-lora-${key}.safetensors`)
    if (key !== 'Missing') {
      await writeFile(managedPath, bytes, { mode: 0o600 })
    }
    resources[key] = {
      bytes,
      descriptor: {
        byteSize: bytes.length,
        managedPath,
        reference: {
          ...f.reference,
          civitaiFileId: 8300 + index,
          civitaiModelId: 8100 + index,
          civitaiVersionId: 8200 + index,
          displayName: `Exact LoRA ${key}`,
          fileSha256: regionalProjectDigest(bytes),
          kind: 'lora',
          localModelId: randomUUID(),
          localVersionId: randomUUID(),
          predictionType: null,
          versionName: `Saved ${key}`,
        },
        weight: key === 'A' ? 0.7 : key === 'B' ? -0.5 : 0,
      },
    }
  }
  // A different exact version of the same model is a later library Default, never a selector.
  resources.C.descriptor.reference.localModelId = resources.A.descriptor.reference.localModelId
  resources.C.descriptor.reference.civitaiModelId = resources.A.descriptor.reference.civitaiModelId
  resources.Missing.descriptor.reference.baseModelFamily = null
  resources.TwinA = {
    bytes: resources.A.bytes,
    descriptor: {
      ...resources.A.descriptor,
      reference: {
        ...resources.A.descriptor.reference,
        civitaiFileId: 8402,
        civitaiModelId: 8400,
        civitaiVersionId: 8401,
        localModelId: randomUUID(),
        localVersionId: randomUUID(),
      },
    },
  }
  const regionalTiBytes = Buffer.from('Explicit separate regional TI binding with the same literal')
  const regionalTiPath = path.join(f.root, 'regional-lora-local-ti.safetensors')
  await writeFile(regionalTiPath, regionalTiBytes, { mode: 0o600 })
  const regionalTi: PromptEmbeddingRef = {
    resource: {
      ...f.embedding.resource,
      civitaiFileId: 8502,
      civitaiModelId: 8500,
      civitaiVersionId: 8501,
      fileSha256: regionalProjectDigest(regionalTiBytes),
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
    },
    token: f.embedding.token,
  }
  const controls: {
    beforeWorker?: () => Promise<void>
    failSeeds: Set<number>
    libraryDefault: ResourceKey
    ready: ReturnType<RegionalProjectFixture['input']>['ready']
    resolve?: (key: ResourceKey) => Promise<void>
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
      ],
    },
  }
  const resolved: ResourceKey[] = []
  f.models.resolveVerifiedGenerationLoraForPlan = async (saved) => {
    const key = (Object.keys(resources) as ResourceKey[]).find((name) =>
      isDeepStrictEqual(resources[name].descriptor.reference, saved),
    )
    assert.ok(key, 'Only the full exact saved LoRA identity may resolve.')
    resolved.push(key)
    await controls.resolve?.(key)
    const resource = resources[key]
    let bytes: Buffer
    try {
      bytes = await readFile(resource.descriptor.managedPath)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw Object.assign(new Error('The exact Main-only LoRA file is missing.'), {
          code: 'MODEL_FILE_MISSING',
        })
      }
      throw error
    }
    if (!bytes.equals(resource.bytes)) {
      throw Object.assign(new Error('The exact Main-only LoRA bytes changed.'), {
        code: 'MODEL_FILE_CORRUPT',
      })
    }
    const { weight: _weight, ...descriptor } = resource.descriptor
    return structuredClone(descriptor)
  }
  const resolveGlobalTi = f.models.resolveVerifiedGenerationEmbeddingForPlan.bind(f.models)
  f.models.resolveVerifiedGenerationEmbeddingForPlan = async (saved) => {
    if (!isDeepStrictEqual(saved, regionalTi.resource)) {
      return await resolveGlobalTi(saved)
    }
    assert.ok((await readFile(regionalTiPath)).equals(regionalTiBytes))
    return {
      byteSize: regionalTiBytes.length,
      managedPath: regionalTiPath,
      reference: structuredClone(saved),
    }
  }
  // Construct after installing optional resolvers: the coordinator captures bound methods.
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
              throw new Error('Controlled frozen regional LoRA inference refusal')
            }
            return f.resultFor(input)
          },
          ready: structuredClone(controls.ready),
        }),
        generate: async () => assert.fail('Regional LoRAs cannot enter ordinary inference.'),
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
  return { ...f, actions, consumed, controls, publicCoordinator, regionalTi, resolved, resources }
}

async function withFixture(use: (f: Fixture) => Promise<void>) {
  const f = await loraFixture()
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

function stack(f: Fixture): FrozenLoraStack {
  return (['A', 'Missing', 'B', 'Z'] as const).map((key) => ({
    enabled: key !== 'Missing',
    resource: structuredClone(f.resources[key].descriptor.reference),
    weight: key === 'Missing' ? 0.35 : f.resources[key].descriptor.weight,
  }))
}

async function selectStack(f: Fixture, ti = false) {
  await f.edit((document) => {
    document.generationDraft.loras = stack(f)
    if (ti) {
      const text = `same authored subject ${f.embedding.token}`
      document.generationDraft.positivePrompt = {
        embeddingRefs: [structuredClone(f.embedding)],
        text,
      }
      document.regionalGuidance![0].prompts!.positive = {
        embeddingRefs: [structuredClone(f.regionalTi)],
        text,
      }
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
    assert.fail('The complete public regional LoRA batch must admit.')
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
      const found = stored.find((row) => row.id === id)
      assert.ok(found, 'Every admitted regional LoRA item remains observable.')
      return found
    })
    const state = await f.actions.getState(f.tabId)
    if (
      state.phase === 'idle' &&
      jobs.every((job) => ['canceled', 'completed', 'failed'].includes(job.status))
    ) {
      return jobs
    }
    assert.notEqual(state.phase, 'blocked', state.error?.message ?? 'Recovery must finish.')
    await setImmediate()
  }
  assert.fail('The regional LoRA jobs did not settle before their bounded deadline.')
}

async function review(f: Fixture, iterations = 1) {
  const result = await f.actions.generate(f.tabId, options(f, iterations))
  assert.equal(result.kind, 'confirmation-required')
  if (result.kind !== 'confirmation-required') {
    assert.fail('Expected review of preserved earlier work.')
  }
  return { candidateIds: result.candidateIds, unfinishedJobIds: result.unfinishedJobIds }
}

function expectedWire(f: Fixture) {
  return (['A', 'B', 'Z'] as const).map((key) => {
    const { byteSize, managedPath, reference, weight } = f.resources[key].descriptor
    return { byteSize, path: managedPath, sha256: reference.fileSha256, weight }
  })
}

function assertStack(f: Fixture, loaded: Loaded) {
  assert.deepEqual(loaded.payload.context.loraStack, stack(f))
  assert.deepEqual(
    loaded.payload.context.loras,
    (['A', 'B', 'Z'] as const).map((key) => f.resources[key].descriptor),
  )
  assert.deepEqual(loaded.input.request.job.loras, expectedWire(f))
  assert.deepEqual(loaded.payload.workerJob.loras, expectedWire(f))
  assert.equal('loras' in loaded.input.recipe, false)
  assert.equal('loraStack' in loaded.input.recipe, false)
  assert.equal(f.resolved.includes('Missing'), false)
  assert.equal(f.resolved.includes('C'), false)
}

async function snapshot(f: Fixture) {
  return {
    candidates: await f.staging.listVerifiedCandidates(f.tabId),
    files: await readdir(path.join(f.root, 'generation-inputs')),
    rows: await rows(f),
  }
}

async function assertPreserved(f: Fixture, before: Awaited<ReturnType<typeof snapshot>>) {
  assert.deepEqual(await snapshot(f), before)
}

async function rejectPublication(
  f: Fixture,
  loaded: Loaded,
  change: (input: RegionalWorkerInput, context: Loaded['payload']['context']) => void,
  code: 'INVALID_REQUEST' | 'QUEUE_INPUT_INVALID',
) {
  const before = await snapshot(f)
  const input = structuredClone(loaded.input)
  const context = structuredClone(loaded.payload.context)
  input.request.requestId = randomUUID()
  change(input, context)
  const { request, ...regional } = input
  await assert.rejects(
    f.queue.enqueueInvokeCanvasRegional({
      preflight: async () => assert.fail('Invalid LoRAs must refuse before publication preflight.'),
      prepared: { context, targetPngBytes: Buffer.from(f.targetBytes) },
      projectPath: f.packagePath,
      regional,
      request,
      stagingSessionId: randomUUID(),
    }),
    { code },
  )
  await assertPreserved(f, before)
}

function withoutLoraCapability(f: Fixture) {
  // Keep every mandatory ordinary 0.14 capability, including illustrious-embeddings.
  f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
    (capability) => capability !== 'illustrious-regional-lora-v1',
  )
}

test('public regional empty-LoRA control stays compatible', async () => {
  await withFixture(async (f) => {
    withoutLoraCapability(f)
    const result = await queued(f)
    assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    assert.deepEqual(loaded.payload.context.loraStack, [])
    assert.deepEqual(loaded.payload.context.loras, [])
    assert.deepEqual(loaded.input.request.job.loras, [])
    assert.equal(f.resolved.length, 0)
    assert.equal((await f.actions.getState(f.tabId)).regionalSupported, true)
    assert.equal((await f.actions.getState(f.tabId)).regionalLoraSupported, false)
    assert.equal(
      (await f.queue.getManagerEntry(result.jobIds[0])).details?.requiresRegionalLora,
      undefined,
    )
  })
})

test('public regional disabled missing LoRA needs no new capability or file resolution', async () => {
  await withFixture(async (f) => {
    withoutLoraCapability(f)
    await f.edit((document) => {
      document.generationDraft.loras = [stack(f)[1]]
    })
    const result = await queued(f)
    assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    assert.deepEqual(loaded.payload.context.loraStack, [stack(f)[1]])
    assert.deepEqual(loaded.input.request.job.loras, [])
    assert.equal(f.resolved.length, 0)
  })
})

test('private regional submission and private command keep nonempty LoRAs refused', async () => {
  await withFixture(async (f) => {
    await selectStack(f)
    await assert.rejects(f.coordinator.submit(f.tabId, f.input()), { code: 'UNSUPPORTED' })
    assert.equal(f.calls.compose.length, 0)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const input = structuredClone((await f.queue.loadVerifiedRegionalInput(result.jobIds[0])).input)
    delete input.compositionProfile
    assert.throws(() => captureRegionalWorkerInput(input), { code: 'INVALID_REQUEST' })
  })
})

test('public regional LoRA batch freezes full configured stack and separate same-literal TI bindings', async () => {
  await withFixture(async (f) => {
    await selectStack(f, true)
    const held = regionalProjectDeferred()
    const release = regionalProjectDeferred()
    f.controls.beforeWorker = async () => {
      held.resolve()
      await release.promise
    }
    try {
      const result = await queued(f, 2)
      await held.promise
      const frozen = await Promise.all(
        result.jobIds.map((id) => f.queue.loadVerifiedRegionalInput(id)),
      )
      f.controls.libraryDefault = 'C'
      await f.edit((document) => {
        document.generationDraft.loras = []
        document.generationDraft.positivePrompt = { embeddingRefs: [], text: 'Later authoring' }
        document.generationDraft.seed.value = 999
        document.regionalGuidance = []
      })
      await f.projects.save(f.tabId)
      const saved = await readFile(f.packagePath)
      const authored = structuredClone(f.document())
      release.resolve()
      assert.deepEqual(
        (await settled(f, result.jobIds)).map((job) => job.status),
        ['completed', 'completed'],
      )
      for (const [index, loaded] of frozen.entries()) {
        assertStack(f, loaded)
        assert.equal(loaded.input.recipe.item.seed, 123 + index)
        assert.equal(loaded.input.recipe.item.iteration, index)
        assert.deepEqual(f.consumed[index].recipe, loaded.input.recipe)
        assert.deepEqual(f.consumed[index].request.job, loaded.input.request.job)
        assert.deepEqual(loaded.input.recipe.globalPrompts.positive.embeddingRefs, [f.embedding])
        assert.deepEqual(loaded.input.recipe.regions[0].positive?.embeddingRefs, [f.regionalTi])
        assert.equal(
          loaded.input.recipe.globalPrompts.positive.text,
          loaded.input.recipe.regions[0].positive?.text,
        )
        assert.notDeepEqual(
          loaded.input.recipe.globalEmbeddings?.positive,
          loaded.input.recipe.regions[0].embeddings?.positive,
        )
      }
      assert.equal(f.calls.compose.length, 1)
      assert.deepEqual(f.document(), authored)
      assert.ok((await readFile(f.packagePath)).equals(saved), 'Completion cannot implicitly Save.')
    } finally {
      release.resolve()
    }
  })
})

test('public regional LoRA wire retains its logical ordered stack for the native application owner', async () => {
  await withFixture(async (f) => {
    await selectStack(f, true)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    const original = structuredClone(loaded.input)
    const lease = await prepareRegionalWorkerRequest(loaded.input, f.scratch)
    try {
      const bytes = await readFile(lease.wire.bundle.path)
      assert.equal(regionalProjectDigest(bytes), lease.wire.bundle.sha256)
      const bundle = JSON.parse(bytes.toString('utf8')) as Bundle
      assert.deepEqual(lease.request.job.loras, expectedWire(f))
      assert.deepEqual(bundle.request.job.loras, expectedWire(f))
      assert.equal(bundle.request.job.embeddings, undefined)
      assert.deepEqual(bundle.recipe.globalEmbeddings, original.recipe.globalEmbeddings)
      assert.equal('loras' in bundle.recipe, false)
      assert.deepEqual(loaded.input, original)
    } finally {
      await lease.dispose()
    }
  })
})

test('public regional LoRA projection detaches command, recipe and alpha before filesystem awaits', async () => {
  await withFixture(async (f) => {
    await selectStack(f)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const input = (await f.queue.loadVerifiedRegionalInput(result.jobIds[0])).input
    const original = structuredClone(input)
    const pending = prepareRegionalWorkerRequest(input, f.scratch)
    input.request.job.loras![0].weight = -9
    input.request.job.loras![2].sha256 = 'f'.repeat(64)
    input.recipe.regions[0].coverage.alpha.fill(0)
    const lease = await pending
    try {
      const bundle = JSON.parse(await readFile(lease.wire.bundle.path, 'utf8')) as Bundle
      assert.deepEqual(lease.request.job.loras, original.request.job.loras)
      assert.deepEqual(bundle.request.job.loras, original.request.job.loras)
      const coverage = bundle.recipe.regions[0].coverage as unknown as {
        alpha: { $alpha8: { path: string } }
      }
      assert.ok(
        (await readFile(coverage.alpha.$alpha8.path)).equals(
          Buffer.from(original.recipe.regions[0].coverage.alpha),
        ),
      )
      assert.equal(input.request.job.loras![0].weight, -9, 'Do not repair caller-owned state.')
    } finally {
      await lease.dispose()
    }
  })
})

test('public regional LoRA capability refusal precedes composition', async () => {
  await withFixture(async (f) => {
    const old = await queued(f)
    await settled(f, old.jobIds)
    await f.edit((document) => {
      document.generationDraft.loras = [stack(f)[3]] // Enabled zero still requires qualification.
    })
    const confirmation = await review(f, 2)
    const before = await snapshot(f)
    const compose = f.calls.compose.length
    const resolutions = f.resolved.length
    withoutLoraCapability(f)
    await assert.rejects(f.actions.generate(f.tabId, { ...options(f, 2), confirmation }), {
      code: 'GENERATION_RUNTIME_UNAVAILABLE',
    })
    assert.equal(f.calls.compose.length, compose)
    assert.equal(f.resolved.length, resolutions)
    await assertPreserved(f, before)
    assert.equal((await f.actions.getState(f.tabId)).regionalLoraSupported, false)
  })
})

test('public regional queue LoRA requirement comes from frozen enabled zero after current stack edits', async () => {
  await withFixture(async (f) => {
    await f.edit((document) => {
      document.generationDraft.loras = [stack(f)[3]]
    })
    const result = await queued(f)
    await settled(f, result.jobIds)
    assert.ok(f.resolved.includes('Z'), 'Enabled zero must resolve and verify its file.')
    await f.edit((document) => {
      document.generationDraft.loras = []
    })
    const job = await f.queue.getManagerEntry(result.jobIds[0])
    assert.equal(job.details?.requiresRegionalLora, true)
    assert.deepEqual((await f.queue.loadVerifiedRegionalInput(job.id)).payload.context.loras, [
      f.resources.Z.descriptor,
    ])
  })
})

for (const fault of [
  'order',
  'weight',
  'path',
  'omitted-zero',
  'same-byte-full-reference',
] as const) {
  test(`public regional LoRA ${fault} disagreement refuses before publication`, async () => {
    await withFixture(async (f) => {
      await selectStack(f)
      const result = await queued(f)
      await settled(f, result.jobIds)
      const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      await rejectPublication(
        f,
        loaded,
        (input, context) => {
          switch (fault) {
            case 'omitted-zero': {
              input.request.job.loras!.pop()

              break
            }
            case 'order': {
              input.request.job.loras!.reverse()

              break
            }
            case 'path': {
              input.request.job.loras![0].path = f.resources.C.descriptor.managedPath

              break
            }
            case 'weight': {
              input.request.job.loras![1].weight = 0.5

              break
            }
            default: {
              assert.equal(
                f.resources.TwinA.descriptor.managedPath,
                f.resources.A.descriptor.managedPath,
              )
              assert.equal(
                f.resources.TwinA.descriptor.reference.fileSha256,
                f.resources.A.descriptor.reference.fileSha256,
              )
              context.loras![0].reference = structuredClone(f.resources.TwinA.descriptor.reference)
            }
          }
        },
        'QUEUE_INPUT_INVALID',
      )
    })
  })
}

test('public regional LoRA aggregate cap refuses before publication preflight', async () => {
  await withFixture(async (f) => {
    await selectStack(f)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    await rejectPublication(
      f,
      loaded,
      (input, context) => {
        const remaining = input.request.job
          .loras!.slice(1)
          .reduce((total, entry) => total + entry.byteSize, 0)
        input.request.job.loras![0].byteSize = 512 * 1024 * 1024 - remaining + 1
        context.loras![0].byteSize = input.request.job.loras![0].byteSize
      },
      'INVALID_REQUEST',
    )
  })
})

test('public regional LoRA 512 MiB descriptor budget is independent of TI descriptors', async () => {
  await withFixture(async (f) => {
    await selectStack(f, true)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const input = structuredClone((await f.queue.loadVerifiedRegionalInput(result.jobIds[0])).input)
    const remaining = input.request.job
      .loras!.slice(1)
      .reduce((total, entry) => total + entry.byteSize, 0)
    input.request.job.loras![0].byteSize = 512 * 1024 * 1024 - remaining
    // Descriptor admission only: no large fake file or native 64 MiB TI payload is allocated.
    input.recipe.globalEmbeddings!.positive[0].byteSize = 64 * 1024 * 1024
    input.request.job.embeddings!.positive[0].byteSize = 64 * 1024 * 1024
    const captured = captureRegionalWorkerInput(input)
    assert.equal(
      captured.request.job.loras!.reduce((total, entry) => total + entry.byteSize, 0),
      512 * 1024 * 1024,
    )
    assert.equal(captured.recipe.globalEmbeddings!.positive[0].byteSize, 64 * 1024 * 1024)
  })
})

test('public regional LoRA command admits more than sixteen distinct bounded descriptors', async () => {
  await withFixture(async (f) => {
    const result = await queued(f)
    await settled(f, result.jobIds)
    const input = structuredClone((await f.queue.loadVerifiedRegionalInput(result.jobIds[0])).input)
    input.request.job.loras = Array.from({ length: 17 }, (_, index) => ({
      byteSize: 1,
      path: path.join(f.root, `descriptor-only-${index}.safetensors`),
      sha256: f.resources.A.descriptor.reference.fileSha256,
      weight: index === 16 ? 0 : -0.5,
    }))
    assert.equal(captureRegionalWorkerInput(input).request.job.loras!.length, 17)
  })
})

test('public regional later LoRA failure preserves the whole reviewed replacement batch', async () => {
  await withFixture(async (f) => {
    const old = await queued(f)
    await settled(f, old.jobIds)
    await selectStack(f)
    const confirmation = await review(f, 2)
    const before = await snapshot(f)
    const saved = await readFile(f.packagePath)
    let earlierVerified = false
    let laterResolutions = 0
    f.controls.resolve = async (key) => {
      if (key === 'A') {
        earlierVerified = true
      }
      if (key === 'B') {
        assert.equal(earlierVerified, true)
        laterResolutions++
        if (laterResolutions === 2) {
          await writeFile(f.resources.B.descriptor.managedPath, Buffer.from('Changed later LoRA'))
        }
      }
    }
    await assert.rejects(f.actions.generate(f.tabId, { ...options(f, 2), confirmation }), {
      code: 'MODEL_FILE_CORRUPT',
    })
    await assertPreserved(f, before)
    assert.equal(
      laterResolutions,
      2,
      'Preparation must succeed before later reverification refuses.',
    )
    assert.equal(f.consumed.length, 1)
    assert.ok((await readFile(f.packagePath)).equals(saved))
  })
})

test('public regional frozen LoRA Retry ignores saved stack, TI and library Default changes', async () => {
  await withFixture(async (f) => {
    await selectStack(f, true)
    f.controls.failSeeds.add(124)
    const result = await queued(f, 2)
    assert.deepEqual(
      (await settled(f, result.jobIds)).map((job) => job.status),
      ['completed', 'failed'],
    )
    const source = await f.queue.loadVerifiedRegionalInput(result.jobIds[1])
    f.controls.libraryDefault = 'C'
    await f.edit((document) => {
      document.generationDraft.loras = [
        {
          enabled: true,
          resource: structuredClone(f.resources.C.descriptor.reference),
          weight: -1,
        },
      ]
      document.generationDraft.positivePrompt = { embeddingRefs: [], text: 'New saved subject' }
      document.generationDraft.seed.value = 999
      document.regionalGuidance = []
    })
    await f.projects.save(f.tabId)
    const authored = structuredClone(f.document())
    const saved = await readFile(f.packagePath)
    const before = await snapshot(f)
    const capable = structuredClone(f.controls.ready)
    withoutLoraCapability(f)
    await assert.rejects(
      f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence }),
      { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
    )
    await assertPreserved(f, before)
    f.controls.ready = capable
    f.controls.failSeeds.clear()
    await f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence })
    const retry = (await rows(f)).find((row) => !result.jobIds.includes(row.id))
    assert.ok(retry)
    assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
    const loaded = await f.queue.loadVerifiedRegionalInput(retry.id)
    assert.deepEqual(loaded.payload, source.payload)
    assertStack(f, loaded)
    assert.deepEqual(f.consumed[2].recipe, source.input.recipe)
    assert.deepEqual(f.consumed[2].request.job.loras, expectedWire(f))
    assert.notEqual(f.consumed[2].request.requestId, f.consumed[1].request.requestId)
    assert.equal(f.calls.compose.length, 1)
    assert.deepEqual(f.document(), authored)
    assert.ok((await readFile(f.packagePath)).equals(saved))
  })
})

for (const key of ['A', 'Z'] as const) {
  for (const fault of ['missing', 'changed'] as const) {
    const name =
      key === 'A' && fault === 'missing'
        ? 'public regional LoRA missing frozen file refuses Retry before SQL'
        : `public regional LoRA ${fault} frozen ${key === 'Z' ? 'zero' : 'active'} file refuses Retry before SQL`
    test(name, async () => {
      await withFixture(async (f) => {
        await selectStack(f)
        f.controls.failSeeds.add(123)
        const result = await queued(f)
        assert.equal((await settled(f, result.jobIds))[0].status, 'failed')
        const source = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
        const before = await snapshot(f)
        const resource = f.resources[key]
        await (fault === 'missing'
          ? rm(resource.descriptor.managedPath)
          : writeFile(resource.descriptor.managedPath, Buffer.from('Changed frozen LoRA bytes')))
        await assert.rejects(
          f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence }),
          {
            code: fault === 'missing' ? 'MODEL_FILE_MISSING' : 'MODEL_FILE_CORRUPT',
          },
        )
        await assertPreserved(f, before)
        assert.equal(f.consumed.length, 1)
        await writeFile(resource.descriptor.managedPath, resource.bytes, { mode: 0o600 })
        f.controls.failSeeds.clear()
        await f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence })
        const retry = (await rows(f)).find((row) => row.id !== source.item.id)
        assert.ok(retry)
        assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
        const loaded = await f.queue.loadVerifiedRegionalInput(retry.id)
        assert.deepEqual(loaded.payload, source.payload)
        assertStack(f, loaded)
        assert.notEqual(loaded.item.batchId, source.item.batchId)
        assert.notEqual(loaded.item.stagingSessionId, source.item.stagingSessionId)
        assert.equal(f.calls.compose.length, 1)
        assert.equal(f.consumed.length, 2)
      })
    })
  }
}

test('public regional LoRA bootstrap recovery retains exact stacks without automatic dispatch', async () => {
  await withFixture(async (f) => {
    await selectStack(f, true)
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
      for (const [index, item] of admitted.entries()) {
        const loaded = await recovered.loadVerifiedRegionalInput(item.id)
        assert.equal(loaded.item.status, 'canceled')
        assertStack(f, loaded)
        assert.equal(loaded.input.recipe.item.seed, 123 + index)
      }
      f.controls.libraryDefault = 'C'
      await f.edit((document) => {
        document.generationDraft.loras = []
        document.generationDraft.positivePrompt = { embeddingRefs: [], text: 'New saved authoring' }
        document.regionalGuidance = []
      })
      await f.projects.save(f.tabId)
      const terminal = await recovered.getManagerEntry(admitted[1].id)
      await f.actions.retryJob({ id: terminal.id, statusSequence: terminal.statusSequence })
      const retry = (await rows(f)).find((row) => !admitted.some((item) => item.id === row.id))
      assert.ok(retry)
      assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
      assert.deepEqual(
        (await recovered.loadVerifiedRegionalInput(retry.id)).payload,
        original.payload,
      )
      assert.equal(f.consumed.length, 1, 'Recovery alone must never dispatch either original job.')
      assert.equal(f.calls.compose.length, 1)
    } finally {
      await connection.close()
    }
  })
})

test('public regional LoRA portable provenance retains full original configured stack and only global TI', async () => {
  await withFixture(async (f) => {
    await selectStack(f, true)
    const authored: IgsProjectDocumentV1 = structuredClone(f.document())
    const result = await queued(f)
    await settled(f, result.jobIds)
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    assertStack(f, loaded)
    const candidate = (await f.staging.listVerifiedCandidates(f.tabId))[0]
    const base = parseAcceptedGenerationBaseV1(candidate.frozenPayloadJson)
    assert.equal(base.kind, 'illustrious-txt2img')
    if (base.kind !== 'illustrious-txt2img') {
      assert.fail('Regional candidates must retain their ordinary portable base.')
    }
    assert.deepEqual(base.context.loraStack, authored.generationDraft.loras)
    const provenance = provenanceFromVerifiedRasterCandidate({
      acceptedAt: candidate.completedAt,
      candidate,
      imagePngBytes: Buffer.from(f.outputBytes),
    })
    assert.equal(provenance.kind, 'illustrious-txt2img')
    assert.deepEqual(provenance.generationConfiguration.loras, authored.generationDraft.loras)
    assert.deepEqual(provenance.generationConfiguration.positivePrompt.embeddingRefs, [f.embedding])
    const serialized = JSON.stringify(provenance)
    assert.equal(serialized.includes(f.resources.Missing.descriptor.reference.localVersionId), true)
    assert.equal(serialized.includes(f.regionalTi.resource.localVersionId), false)
    for (const field of [
      'regionalGuidance',
      'compositionProfile',
      'initializationProfile',
      'managedPath',
    ]) {
      assert.equal(serialized.includes(`"${field}"`), false)
    }
    assert.deepEqual(f.document(), authored, 'Temporary completion cannot edit the authored stack.')
  })
})
