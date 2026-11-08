import type { ProjectGenerateOptions } from '../../shared/projects/project-generation-actions.js'
import type { PromptEmbeddingRef } from '../../shared/projects/prompt-embeddings.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { isDeepStrictEqual } from 'node:util'

import type { FrozenGenerationEmbedding } from './illustrious-generation-embeddings.js'
import type { RegionalWorkerInput } from './regional-worker-request.js'
import type { RegionalProjectFixture } from './test-fixtures/regional-project.js'

import { openAppDatabase } from '../db/database.js'
import { ProjectGenerationActionController } from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { provenanceFromVerifiedRasterCandidate } from './project-generation-provenance.js'
import { encodeProjectMaskPng } from './project-mask.js'
import { ProjectRegionalGenerationCoordinator } from './project-regional-generation-coordinator.js'
import {
  loadRegionalQueuedInput,
  parseAcceptedGenerationBaseV1,
} from './regional-queued-generation.js'
import {
  captureRegionalWorkerInput,
  prepareRegionalWorkerRequest,
} from './regional-worker-request.js'
import {
  createRegionalProjectFixture,
  regionalProjectDeferred,
  regionalProjectDigest,
} from './test-fixtures/regional-project.js'

type ResourceKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'TwinA'
type Resource = {
  bytes: Buffer
  descriptor: FrozenGenerationEmbedding
  ref: PromptEmbeddingRef
}
type ActionRuntime = ConstructorParameters<typeof ProjectGenerationActionController>[0]['runtime']
type WorkerRuntime = ConstructorParameters<typeof GenerationDispatchCoordinator>[0]
type Fixture = Awaited<ReturnType<typeof globalFixture>>
type Bundle = {
  recipe: RegionalWorkerInput['recipe']
  request: RegionalWorkerInput['request']
}

/**
 * Actual Main capture/planner/queue/files/receipt/provenance owners. Model qualification,
 * compositor and native PNG computation are the existing explicit fixture substitutes. The authored
 * TI files below are fake byte fixtures for Main ownership, NOT paired ML safetensors. InvokeAI
 * a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd was consulted directly: text_encoder/compel.py,
 * util/ti_utils.py, backend/model_patcher.py and addRegionalGuidance.ts.
 */
async function globalFixture() {
  const f = await createRegionalProjectFixture()
  const resources = {} as Record<ResourceKey, Resource>
  for (const [index, key] of (['A', 'B', 'C', 'D', 'E'] as const).entries()) {
    const bytes = Buffer.from(`Explicit Main-only exact TI substitute ${key}`)
    const managedPath = path.join(f.root, `global-ti-${key}.safetensors`)
    // A dormant, unavailable ref must neither resolve nor consume active-resource budgets.
    if (key !== 'E') {
      await writeFile(managedPath, bytes, { mode: 0o600 })
    }
    const resource: PromptEmbeddingRef['resource'] = {
      ...f.embedding.resource,
      civitaiFileId: 9300 + index,
      civitaiModelId: 9100 + index,
      civitaiVersionId: 9200 + index,
      displayName: `Exact TI ${key}`,
      fileSha256: regionalProjectDigest(bytes),
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      versionName: `Saved ${key}`,
    }
    const ref = { resource, token: key === 'E' ? '<unused>' : '<shared>' }
    resources[key] = {
      bytes,
      descriptor: { byteSize: bytes.length, managedPath, reference: resource, token: ref.token },
      ref,
    }
  }
  const twinReference = {
    ...resources.A.ref.resource,
    civitaiFileId: 9402,
    civitaiModelId: 9400,
    civitaiVersionId: 9401,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
  }
  resources.TwinA = {
    bytes: resources.A.bytes,
    descriptor: { ...resources.A.descriptor, reference: twinReference },
    ref: { resource: twinReference, token: '<shared>' },
  }
  const controls: {
    beforeWorker?: () => Promise<void>
    failSeeds: Set<number>
    libraryDefault: ResourceKey
    ready: ReturnType<RegionalProjectFixture['input']>['ready']
  } = {
    failSeeds: new Set(),
    libraryDefault: 'A',
    ready: {
      ...f.input().ready,
      capabilities: [
        ...f.input().ready.capabilities,
        'illustrious-regional-invoke-v1',
        'illustrious-regional-invoke-init-v1',
      ],
    },
  }
  const resolved: ResourceKey[] = []
  f.models.resolveVerifiedGenerationEmbeddingForPlan = async (saved) => {
    f.calls.embedding++
    const key = (Object.keys(resources) as ResourceKey[]).find((name) =>
      isDeepStrictEqual(resources[name].ref.resource, saved),
    )
    assert.ok(key, 'Only an exact saved resource identity can resolve.')
    assert.notEqual(key, 'E', 'An unavailable dormant ref must never resolve.')
    const entry = resources[key]
    assert.ok(
      (await readFile(entry.descriptor.managedPath)).equals(entry.bytes),
      'The exact Main-only TI bytes changed.',
    )
    resolved.push(key)
    // The mutable library Default is intentionally not a saved-binding selector.
    return structuredClone({
      byteSize: entry.descriptor.byteSize,
      managedPath: entry.descriptor.managedPath,
      reference: saved,
    })
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
            assert.ok(input.compositionProfile !== 'invoke-krea2-global-support-v1')
            consumed.push(structuredClone(input))
            if (controls.failSeeds.has(input.request.job.sampling.seed)) {
              throw new Error('Controlled frozen global-TI inference refusal')
            }
            return f.resultFor(input)
          },
          ready: structuredClone(controls.ready),
        }),
        generate: async () => assert.fail('Regional TI cannot enter ordinary inference.'),
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
  const f = await globalFixture()
  try {
    await use(f)
  } finally {
    f.controls.beforeWorker = undefined
    await f.actions.shutdown()
    await f.publicCoordinator.shutdown()
    await f.close()
  }
}

async function selectBindings(f: Fixture, options: { dormant?: boolean; eulerA?: boolean } = {}) {
  const owner = f.projects.getOpenDocumentForAcceptance(f.tabId)!
  const next = structuredClone(f.document())
  const text = 'same authored subject <shared>'
  next.generationDraft.positivePrompt = {
    embeddingRefs: [f.resources.A.ref, ...(options.dormant ? [f.resources.E.ref] : [])].map((ref) =>
      structuredClone(ref),
    ),
    text,
  }
  next.generationDraft.negativePrompt = {
    embeddingRefs: [structuredClone(f.resources.B.ref)],
    text: '<shared>',
  }
  if (options.eulerA) {
    next.generationDraft.sampling.sampler = 'Euler a'
  }
  const first = next.regionalGuidance![0]
  first.prompts = {
    negative: null,
    positive: { embeddingRefs: [structuredClone(f.resources.C.ref)], text },
    useGlobalNegativePrompt: true,
  }
  const second = structuredClone(first)
  second.id = randomUUID()
  second.name = 'Independent local negative owner'
  second.mask.id = randomUUID()
  const bytes = encodeProjectMaskPng(
    Uint8Array.from(f.alpha, (value) => 255 - value),
    64,
    64,
  )
  const hash = regionalProjectDigest(bytes)
  const asset = {
    bytes: bytes.length,
    height: 64,
    path: `assets/masks/${second.mask.id}/${hash}.png`,
    sha256: hash,
    width: 64,
  }
  second.mask.asset = asset
  second.prompts = {
    negative: { embeddingRefs: [structuredClone(f.resources.D.ref)], text: '<shared>' },
    positive: { embeddingRefs: [], text: 'plain neighboring subject' },
    useGlobalNegativePrompt: false,
  }
  next.regionalGuidance = [first, second]
  await owner.applyDocument(next, { [asset.path]: { bytes } })
  await f.projects.save(f.tabId)
  return structuredClone(f.document())
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
    assert.fail('The complete public global-TI batch must admit.')
  }
  assert.equal(result.jobIds.length, iterations)
  assert.equal(result.truncated, false)
  return result
}

async function rows(f: Fixture) {
  return await f.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .orderBy('created_at')
    .orderBy('id')
    .execute()
}

async function settled(f: Fixture, ids: readonly string[]) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const stored = await rows(f)
    const jobs = ids.map((id) => {
      const found = stored.find((row) => row.id === id)
      assert.ok(found, 'Every admitted global-TI item remains observable.')
      return found
    })
    const state = await f.actions.getState(f.tabId)
    if (
      state.phase === 'idle' &&
      jobs.every((job) => ['canceled', 'completed', 'failed'].includes(job.status))
    ) {
      return jobs
    }
    if (state.phase === 'blocked') {
      assert.fail(`Unexpected blocked global-TI operation: ${state.error?.message}`)
    }
    await setImmediate()
  }
  assert.fail('The exact global-TI jobs did not settle before their bounded deadline.')
}

function expectedWire(f: Fixture) {
  const project = (key: ResourceKey) => ({
    byteSize: f.resources[key].bytes.length,
    path: f.resources[key].descriptor.managedPath,
    sha256: f.resources[key].ref.resource.fileSha256,
    token: '<shared>',
  })
  return { negative: [project('B')], positive: [project('A')] }
}

function assertBindings(f: Fixture, input: RegionalWorkerInput) {
  assert.deepEqual(input.request.job.embeddings, expectedWire(f))
  assert.deepEqual(input.recipe.globalEmbeddings, {
    negative: [f.resources.B.descriptor],
    positive: [f.resources.A.descriptor],
  })
  assert.equal(input.recipe.globalPrompts.positive.text, input.recipe.regions[0].positive?.text)
  assert.deepEqual(input.recipe.globalPrompts.positive.embeddingRefs, [f.resources.A.ref])
  assert.deepEqual(input.recipe.globalPrompts.negative.embeddingRefs, [f.resources.B.ref])
  assert.deepEqual(input.recipe.regions[0].embeddings, {
    negative: [f.resources.B.descriptor],
    positive: [f.resources.C.descriptor],
  })
  assert.equal(input.recipe.regions[0].negative.source, 'current-canvas')
  assert.deepEqual(input.recipe.regions[0].negative.prompt.embeddingRefs, [f.resources.B.ref])
  assert.deepEqual(input.recipe.regions[1].embeddings, {
    negative: [f.resources.D.descriptor],
    positive: [],
  })
  assert.equal(input.recipe.regions[1].negative.source, 'regional')
  assert.deepEqual(input.recipe.regions[1].negative.prompt.embeddingRefs, [f.resources.D.ref])
}

async function review(f: Fixture, iterations = 1) {
  const result = await f.actions.generate(f.tabId, options(f, iterations))
  assert.equal(result.kind, 'confirmation-required')
  if (result.kind !== 'confirmation-required') {
    assert.fail('Expected prior-work review.')
  }
  return { candidateIds: result.candidateIds, unfinishedJobIds: result.unfinishedJobIds }
}

function isAssociationRefusal(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'QUEUE_INPUT_INVALID' ||
      error.code === 'INPUT_INVALID' ||
      error.code === 'INVALID_REQUEST')
  )
}

test('public global TI preserves exact full resource agreement', async () => {
  await withFixture(async (f) => {
    await selectBindings(f)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const original = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    const input = structuredClone(original.input)
    input.request.requestId = randomUUID()
    input.recipe.globalPrompts.positive.embeddingRefs[0].resource = structuredClone(
      f.resources.TwinA.ref.resource,
    )
    input.recipe.globalEmbeddings!.positive[0].reference = structuredClone(
      f.resources.TwinA.ref.resource,
    )
    assert.equal(f.resources.TwinA.descriptor.managedPath, f.resources.A.descriptor.managedPath)
    assert.equal(f.resources.TwinA.ref.resource.fileSha256, f.resources.A.ref.resource.fileSha256)
    const before = await rows(f)
    const files = await readdir(path.join(f.root, 'generation-inputs'))
    const candidates = await f.staging.listVerifiedCandidates(f.tabId)
    const { request, ...regional } = input
    await assert.rejects(
      f.queue.enqueueInvokeCanvasRegional({
        preflight: async () =>
          assert.fail('Full identity must refuse before publication preflight.'),
        prepared: {
          context: structuredClone(original.payload.context),
          targetPngBytes: Buffer.from(f.targetBytes),
        },
        projectPath: f.packagePath,
        regional,
        request,
        stagingSessionId: randomUUID(),
      }),
      isAssociationRefusal,
    )
    assert.deepEqual(await rows(f), before)
    assert.deepEqual(await readdir(path.join(f.root, 'generation-inputs')), files)
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), candidates)
  })
})

test('public global TI serializes one recipe loading owner', async () => {
  await withFixture(async (f) => {
    await selectBindings(f)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    const input = loaded.input
    const original = structuredClone(input)
    const lease = await prepareRegionalWorkerRequest(input, f.scratch)
    try {
      const bytes = await readFile(lease.wire.bundle.path)
      assert.equal(regionalProjectDigest(bytes), lease.wire.bundle.sha256)
      const bundle = JSON.parse(bytes.toString('utf8')) as Bundle
      assert.deepEqual(input, original)
      assert.deepEqual(lease.request.job.embeddings, expectedWire(f))
      assert.equal(bundle.request.job.embeddings?.positive.length ?? 0, 0)
      assert.equal(bundle.request.job.embeddings?.negative.length ?? 0, 0)
      assert.deepEqual(bundle.recipe.globalEmbeddings, original.recipe.globalEmbeddings)
      assert.deepEqual(
        bundle.recipe.regions.map((region) => region.embeddings),
        original.recipe.regions.map((region) => region.embeddings),
      )
      assert.deepEqual(bundle.request.job.prompts, original.request.job.prompts)
      assert.equal(bundle.request.requestId, lease.request.requestId)
      assertBindings(f, input)
    } finally {
      await lease.dispose()
    }
  })
})

test('public global TI refuses missing, signed, path, size and text disagreements before publication', async () => {
  await withFixture(async (f) => {
    await selectBindings(f)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const original = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    const before = await rows(f)
    const files = await readdir(path.join(f.root, 'generation-inputs'))
    const candidates = await f.staging.listVerifiedCandidates(f.tabId)
    const cases: { change: (input: RegionalWorkerInput) => void; name: string }[] = [
      {
        change: (input) => {
          input.recipe.globalEmbeddings!.positive = []
        },
        name: 'missing positive descriptor',
      },
      {
        change: (input) => {
          const globals = input.recipe.globalEmbeddings!
          globals.positive[0].byteSize++
          input.request.job.embeddings!.positive[0].byteSize++
        },
        name: 'different size with matching logical and recipe projection',
      },
      {
        change: (input) => {
          input.recipe.globalEmbeddings!.positive[0].managedPath =
            f.resources.C.descriptor.managedPath
          input.request.job.embeddings!.positive[0].path = f.resources.C.descriptor.managedPath
        },
        name: 'different path with matching logical and recipe projection',
      },
      {
        change: (input) => {
          input.recipe.globalPrompts.positive.text += ' additional authored words'
          input.request.job.prompts.positive = input.recipe.globalPrompts.positive.text
        },
        name: 'different global text with matching logical and recipe projection',
      },
      {
        change: (input) => {
          const prompts = input.recipe.globalPrompts
          ;[prompts.positive, prompts.negative] = [prompts.negative, prompts.positive]
          const descriptors = input.recipe.globalEmbeddings!
          ;[descriptors.positive, descriptors.negative] = [
            descriptors.negative,
            descriptors.positive,
          ]
          const wire = input.request.job.embeddings!
          ;[wire.positive, wire.negative] = [wire.negative, wire.positive]
          input.request.job.prompts = {
            negative: prompts.negative.text,
            positive: prompts.positive.text,
          }
          input.recipe.regions[0].negative.prompt = structuredClone(prompts.negative)
          input.recipe.regions[0].embeddings!.negative = structuredClone(descriptors.negative)
        },
        name: 'opposite signed bindings with matching logical and recipe projection',
      },
    ]
    for (const item of cases) {
      const input = structuredClone(original.input)
      input.request.requestId = randomUUID()
      item.change(input)
      const { request, ...regional } = input
      await assert.rejects(
        f.queue.enqueueInvokeCanvasRegional({
          preflight: async () => assert.fail(`Unexpected publication preflight for ${item.name}.`),
          prepared: {
            context: structuredClone(original.payload.context),
            targetPngBytes: Buffer.from(f.targetBytes),
          },
          projectPath: f.packagePath,
          regional,
          request,
          stagingSessionId: randomUUID(),
        }),
        isAssociationRefusal,
        item.name,
      )
      assert.deepEqual(await rows(f), before, item.name)
      assert.deepEqual(await readdir(path.join(f.root, 'generation-inputs')), files, item.name)
      assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), candidates, item.name)
    }
  })
})

test('public empty-global regional control remains compatible', async () => {
  await withFixture(async (f) => {
    const result = await queued(f)
    assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    assert.equal(f.calls.embedding, 0)
    assert.deepEqual(loaded.input.recipe.globalEmbeddings, { negative: [], positive: [] })
    const lease = await prepareRegionalWorkerRequest(loaded.input, f.scratch)
    try {
      const bundle = JSON.parse(await readFile(lease.wire.bundle.path, 'utf8')) as Bundle
      assert.deepEqual(bundle.request, lease.request)
      assert.equal(bundle.request.job.embeddings, undefined)
      assert.equal((await f.actions.getState(f.tabId)).embeddingsSupported, true)
    } finally {
      await lease.dispose()
    }
  })
})

test('public dormant-global refs require no exact-file resolution', async () => {
  await withFixture(async (f) => {
    await f.edit((document) => {
      document.generationDraft.positivePrompt = {
        embeddingRefs: [structuredClone(f.resources.E.ref)],
        text: 'ordinary subject with no active embedding token',
      }
    })
    await f.projects.save(f.tabId)
    const result = await queued(f)
    assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    assert.equal(f.calls.embedding, 0)
    assert.deepEqual(loaded.payload.context.embeddingRefs?.positive, [f.resources.E.ref])
    assert.deepEqual(loaded.input.recipe.globalPrompts.positive.embeddingRefs, [])
    assert.deepEqual(loaded.input.recipe.globalEmbeddings, { negative: [], positive: [] })
    assert.equal(loaded.input.request.job.embeddings, undefined)
    assert.equal((await f.actions.getState(f.tabId)).embeddingsSupported, true)
  })
})

test('public global TI freezes distinct signed stream bindings for every planned job', async () => {
  await withFixture(async (f) => {
    await selectBindings(f, { eulerA: true })
    const held = regionalProjectDeferred()
    const release = regionalProjectDeferred()
    f.controls.beforeWorker = async () => {
      held.resolve()
      await release.promise
    }
    try {
      const result = await queued(f, 2)
      await held.promise
      const inputs = await Promise.all(
        result.jobIds.map((id) => f.queue.loadVerifiedRegionalInput(id)),
      )
      for (const [index, loaded] of inputs.entries()) {
        assertBindings(f, loaded.input)
        assert.equal(loaded.input.recipe.item.seed, 123 + index)
        assert.equal(loaded.input.recipe.item.iteration, index)
        assert.deepEqual(loaded.payload.context.embeddings, loaded.input.recipe.globalEmbeddings)
      }
      f.controls.libraryDefault = 'C'
      await f.edit((document) => {
        document.generationDraft.positivePrompt = { embeddingRefs: [], text: 'Later plain text' }
        document.generationDraft.negativePrompt = { embeddingRefs: [], text: '' }
        document.generationDraft.sampling.sampler = 'Euler'
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
      assert.equal(f.consumed.length, 2)
      assert.deepEqual(
        f.consumed.map((input) => input.request.job.sampling.seed),
        [123, 124],
      )
      for (const [index, input] of f.consumed.entries()) {
        assertBindings(f, input)
        assert.deepEqual(input.recipe, inputs[index].input.recipe)
        assert.equal(input.initializationProfile, 'invoke-cpu-f32-add-noise-v1')
      }
      assert.equal(f.calls.compose.length, 1)
      assert.equal(f.resolved.includes('E'), false)
      assert.deepEqual(f.document(), authored)
      assert.ok((await readFile(f.packagePath)).equals(saved), 'Completion cannot implicitly Save.')
    } finally {
      release.resolve()
    }
  })
})

test('public global TI keeps dormant authored refs but projects only used globals into portable base provenance', async () => {
  await withFixture(async (f) => {
    await selectBindings(f, { dormant: true })
    const result = await queued(f)
    await settled(f, result.jobIds)
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    assertBindings(f, loaded.input)
    const candidate = (await f.staging.listVerifiedCandidates(f.tabId))[0]
    const base = parseAcceptedGenerationBaseV1(candidate.frozenPayloadJson)
    assert.equal(base.kind, 'illustrious-txt2img')
    if (base.kind !== 'illustrious-txt2img') {
      assert.fail('Public regional candidate base must preserve ordinary Illustrious globals.')
    }
    assert.deepEqual(base.context.embeddingRefs?.positive, [f.resources.A.ref, f.resources.E.ref])
    assert.deepEqual(base.context.embeddingRefs?.negative, [f.resources.B.ref])
    assert.deepEqual(base.context.embeddings, {
      negative: [f.resources.B.descriptor],
      positive: [f.resources.A.descriptor],
    })
    const provenance = provenanceFromVerifiedRasterCandidate({
      acceptedAt: candidate.completedAt,
      candidate,
      imagePngBytes: Buffer.from(f.outputBytes),
    })
    assert.equal(provenance.kind, 'illustrious-txt2img')
    assert.deepEqual(provenance.generationConfiguration.positivePrompt.embeddingRefs, [
      f.resources.A.ref,
    ])
    assert.deepEqual(provenance.generationConfiguration.negativePrompt.embeddingRefs, [
      f.resources.B.ref,
    ])
    const serialized = JSON.stringify(provenance)
    for (const key of ['C', 'D', 'E'] as const) {
      assert.equal(serialized.includes(f.resources[key].ref.resource.localVersionId), false)
    }
    for (const key of [
      'regionalGuidance',
      'compositionProfile',
      'initializationProfile',
      'managedPath',
    ]) {
      assert.equal(serialized.includes(`"${key}"`), false)
    }
    assert.equal(f.resolved.includes('E'), false)
  })
})

test('public global TI capability refusal precedes composition and preserves reviewed old work', async () => {
  await withFixture(async (f) => {
    const first = await queued(f)
    await settled(f, first.jobIds)
    const candidates = await f.staging.listVerifiedCandidates(f.tabId)
    await selectBindings(f)
    const confirmation = await review(f, 2)
    const before = await rows(f)
    const compose = f.calls.compose.length
    const resolutions = f.calls.embedding
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (capability) => capability !== 'illustrious-embeddings',
    )
    await assert.rejects(f.actions.generate(f.tabId, { ...options(f, 2), confirmation }), {
      code: 'GENERATION_RUNTIME_UNAVAILABLE',
    })
    assert.equal(f.calls.compose.length, compose)
    assert.equal(f.calls.embedding, resolutions)
    assert.deepEqual(await rows(f), before)
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), candidates)
    const state = await f.actions.getState(f.tabId)
    assert.equal(state.regionalSupported, false)
    assert.equal(state.embeddingsSupported, false)
  })
})

for (const fault of ['missing-global', 'changed-global', 'changed-later-region'] as const) {
  test(`public global TI ${fault} refuses the whole replacement batch before new publication`, async () => {
    await withFixture(async (f) => {
      const first = await queued(f)
      await settled(f, first.jobIds)
      const candidates = await f.staging.listVerifiedCandidates(f.tabId)
      await selectBindings(f)
      const confirmation = await review(f, 2)
      const before = await rows(f)
      const files = await readdir(path.join(f.root, 'generation-inputs'))
      const resource = fault === 'changed-later-region' ? f.resources.D : f.resources.A
      await (fault === 'missing-global'
        ? rm(resource.descriptor.managedPath)
        : writeFile(resource.descriptor.managedPath, Buffer.from('Different exact TI bytes')))
      await assert.rejects(
        f.actions.generate(f.tabId, { ...options(f, 2), confirmation }),
        fault === 'missing-global'
          ? { code: 'ENOENT' }
          : { message: 'The exact Main-only TI bytes changed.' },
      )
      assert.deepEqual(await rows(f), before)
      assert.deepEqual(await readdir(path.join(f.root, 'generation-inputs')), files)
      assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), candidates)
      assert.equal(f.consumed.length, 1)
    })
  })
}

test('public global TI Retry ignores saved draft and Default changes while checking frozen capability first', async () => {
  await withFixture(async (f) => {
    await selectBindings(f, { eulerA: true })
    f.controls.failSeeds.add(124)
    const result = await queued(f, 2)
    assert.deepEqual(
      (await settled(f, result.jobIds)).map((job) => job.status),
      ['completed', 'failed'],
    )
    const source = await f.queue.loadVerifiedRegionalInput(result.jobIds[1])
    const candidates = await f.staging.listVerifiedCandidates(f.tabId)
    f.controls.libraryDefault = 'C'
    await f.edit((document) => {
      document.generationDraft.positivePrompt = {
        embeddingRefs: [structuredClone(f.resources.C.ref)],
        text: 'Changed current subject <shared>',
      }
      document.generationDraft.negativePrompt = {
        embeddingRefs: [structuredClone(f.resources.D.ref)],
        text: '<shared>',
      }
      document.generationDraft.sampling.sampler = 'Euler'
      document.generationDraft.seed.value = 999
      document.regionalGuidance = []
    })
    await f.projects.save(f.tabId)
    const authored = structuredClone(f.document())
    const saved = await readFile(f.packagePath)
    const before = await rows(f)
    const capable = structuredClone(f.controls.ready)
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (capability) => capability !== 'illustrious-embeddings',
    )
    await assert.rejects(
      f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence }),
      { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
    )
    assert.deepEqual(await rows(f), before)
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), candidates)
    f.controls.ready = capable
    f.controls.failSeeds.clear()
    await f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence })
    const retry = (await rows(f)).find((row) => !result.jobIds.includes(row.id))
    assert.ok(retry)
    assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
    const loaded = await f.queue.loadVerifiedRegionalInput(retry.id)
    assert.deepEqual(loaded.payload, source.payload)
    assertBindings(f, loaded.input)
    assertBindings(f, f.consumed[2])
    assert.equal(f.consumed[2].request.job.sampling.seed, 124)
    assert.notEqual(f.consumed[2].request.requestId, f.consumed[1].request.requestId)
    assert.equal(f.calls.compose.length, 1)
    assert.deepEqual(f.document(), authored)
    assert.ok((await readFile(f.packagePath)).equals(saved))
  })
})

for (const fault of ['missing', 'changed'] as const) {
  test(`public global TI Retry refuses ${fault} frozen global bytes before SQL and recovers after restoration`, async () => {
    await withFixture(async (f) => {
      await selectBindings(f)
      f.controls.failSeeds.add(123)
      const result = await queued(f)
      assert.equal((await settled(f, result.jobIds))[0].status, 'failed')
      const source = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      const before = await rows(f)
      const files = await readdir(path.join(f.root, 'generation-inputs'))
      const resource = f.resources.A
      await (fault === 'missing'
        ? rm(resource.descriptor.managedPath)
        : writeFile(resource.descriptor.managedPath, Buffer.from('Changed frozen global bytes')))
      await assert.rejects(
        f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence }),
        fault === 'missing'
          ? { code: 'ENOENT' }
          : { message: 'The exact Main-only TI bytes changed.' },
      )
      assert.deepEqual(await rows(f), before)
      assert.deepEqual(await readdir(path.join(f.root, 'generation-inputs')), files)
      assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [])
      assert.equal(f.consumed.length, 1)
      assert.equal(f.calls.compose.length, 1)
      await writeFile(resource.descriptor.managedPath, resource.bytes, { mode: 0o600 })
      f.controls.failSeeds.clear()
      await f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence })
      const retry = (await rows(f)).find((row) => row.id !== source.item.id)
      assert.ok(retry)
      assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
      const loaded = await f.queue.loadVerifiedRegionalInput(retry.id)
      assert.deepEqual(loaded.payload, source.payload)
      assertBindings(f, loaded.input)
      assert.notEqual(loaded.item.batchId, source.item.batchId)
      assert.notEqual(loaded.item.stagingSessionId, source.item.stagingSessionId)
      assert.equal(f.consumed.length, 2)
    })
  })
}

test('public global TI bootstrap recovery preserves each frozen full resource pair without automatic dispatch', async () => {
  await withFixture(async (f) => {
    await selectBindings(f)
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
        assertBindings(f, loaded.input)
        assert.equal(loaded.input.recipe.item.seed, 123 + index)
      }
      f.controls.libraryDefault = 'C'
      await f.edit((document) => {
        document.generationDraft.positivePrompt = { embeddingRefs: [], text: 'New plain authoring' }
        document.generationDraft.negativePrompt = { embeddingRefs: [], text: '' }
        document.regionalGuidance = []
      })
      const terminal = await recovered.getManagerEntry(admitted[1].id)
      const retry = await recovered.retryInvokeCanvasRegionalTerminal(
        terminal.id,
        terminal.statusSequence,
      )
      assert.deepEqual(
        (await recovered.loadVerifiedRegionalInput(retry.id)).payload,
        original.payload,
      )
      assert.equal(f.consumed.length, 0)
    } finally {
      await connection.close()
    }
  })
})

test('public global TI reload refuses a rehashed same-byte catalog identity substitution', async () => {
  await withFixture(async (f) => {
    await selectBindings(f)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    const root = path.dirname(loaded.targetPath)
    const file = path.join(root, 'regional.json')
    const original = await readFile(file)
    const metadata = JSON.parse(original.toString('utf8')) as {
      recipe: RegionalWorkerInput['recipe']
    }
    metadata.recipe.globalPrompts.positive.embeddingRefs[0].resource = structuredClone(
      f.resources.TwinA.ref.resource,
    )
    metadata.recipe.globalEmbeddings!.positive[0].reference = structuredClone(
      f.resources.TwinA.ref.resource,
    )
    const bytes = Buffer.from(JSON.stringify(metadata))
    const payload = structuredClone(loaded.payload)
    payload.regional = { byteSize: bytes.length, sha256: regionalProjectDigest(bytes) }
    try {
      await writeFile(file, bytes)
      await assert.rejects(
        loadRegionalQueuedInput(root, payload, loaded.input.request),
        isAssociationRefusal,
      )
    } finally {
      await writeFile(file, original)
    }
    assertBindings(f, (await f.queue.loadVerifiedRegionalInput(result.jobIds[0])).input)
  })
})

test('public global TI projection eagerly owns logical descriptors and regional alpha before filesystem awaits', async () => {
  await withFixture(async (f) => {
    await selectBindings(f)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const input = (await f.queue.loadVerifiedRegionalInput(result.jobIds[0])).input
    const expected = structuredClone(input)
    const pending = prepareRegionalWorkerRequest(input, f.scratch)
    input.request.job.embeddings!.positive[0].sha256 = 'f'.repeat(64)
    input.request.job.embeddings!.negative.splice(0)
    input.recipe.globalEmbeddings!.positive[0].reference.localVersionId = randomUUID()
    input.recipe.regions[0].coverage.alpha.fill(0)
    const lease = await pending
    try {
      assert.deepEqual(lease.request.job.embeddings, expected.request.job.embeddings)
      const bundle = JSON.parse(await readFile(lease.wire.bundle.path, 'utf8')) as Bundle
      assert.equal(bundle.request.job.embeddings?.positive.length ?? 0, 0)
      assert.equal(bundle.request.job.embeddings?.negative.length ?? 0, 0)
      assert.deepEqual(bundle.recipe.globalEmbeddings, expected.recipe.globalEmbeddings)
      const coverage = bundle.recipe.regions[0].coverage as unknown as {
        alpha: { $alpha8: { path: string } }
      }
      assert.ok(
        (await readFile(coverage.alpha.$alpha8.path)).equals(
          Buffer.from(expected.recipe.regions[0].coverage.alpha),
        ),
      )
      assert.equal(
        input.request.job.embeddings!.positive[0].sha256,
        'f'.repeat(64),
        'The owner cannot repair caller state.',
      )
    } finally {
      await lease.dispose()
    }
  })
})

test('private recipe-owned global TI keeps its empty-command contract while private Main submission stays refused', async () => {
  await withFixture(async (f) => {
    await selectBindings(f)
    await assert.rejects(f.coordinator.submit(f.tabId, f.input()), { code: 'UNSUPPORTED' })
    assert.equal(f.calls.compose.length, 0)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const input = structuredClone((await f.queue.loadVerifiedRegionalInput(result.jobIds[0])).input)
    delete input.compositionProfile
    delete input.request.job.embeddings
    const captured = captureRegionalWorkerInput(input)
    assert.deepEqual(captured.recipe.globalEmbeddings, input.recipe.globalEmbeddings)
    const lease = await prepareRegionalWorkerRequest(input, f.scratch)
    try {
      const bundle = JSON.parse(await readFile(lease.wire.bundle.path, 'utf8')) as Bundle
      assert.equal(bundle.request.job.embeddings, undefined)
      assert.deepEqual(bundle.recipe.globalEmbeddings, input.recipe.globalEmbeddings)
    } finally {
      await lease.dispose()
    }
  })
})
