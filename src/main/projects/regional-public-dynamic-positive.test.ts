import type { ProjectGenerateOptions } from '../../shared/projects/project-generation-actions.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import type { PromptEmbeddingRef } from '../../shared/projects/prompt-embeddings.js'
import { getInvokeRegionalGenerationUnavailableReason } from '../../shared/projects/regional-invoke-generation.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { isDeepStrictEqual } from 'node:util'

import type { FrozenGenerationEmbedding } from './illustrious-generation-embeddings.js'
import type { FrozenGenerationLora } from './illustrious-generation-loras.js'
import type { FrozenGenerationVae } from './illustrious-generation-vae.js'
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
  captureRegionalQueuedMaterial,
  parseAcceptedGenerationBaseV1,
} from './regional-queued-generation.js'
import {
  createRegionalProjectFixture,
  regionalProjectDeferred,
  regionalProjectDigest,
} from './test-fixtures/regional-project.js'

type Key = 'A' | 'B' | 'Dormant' | 'Negative' | 'Prefix' | 'Regional'
type Resource = { bytes: Buffer; descriptor: FrozenGenerationEmbedding; ref: PromptEmbeddingRef }
type ActionRuntime = ConstructorParameters<typeof ProjectGenerationActionController>[0]['runtime']
type WorkerRuntime = ConstructorParameters<typeof GenerationDispatchCoordinator>[0]
type Fixture = Awaited<ReturnType<typeof dynamicFixture>>
type SeedBehavior = 'per-iteration' | 'per-prompt'
type Document = IgsProjectDocumentV1

/**
 * Actual public action, saved/reopened Service capture, concrete planner, atomic SQL/files, worker
 * dispatch, candidate receipt and portable provenance owners. Model qualification/catalog, target
 * composition and numerical PNG inference are explicit controlled substitutes. Tiny resource files
 * are Main identity fixtures, not native safetensors or native TI/LoRA/VAE qualification.
 *
 * InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd consulted directly:
 * workbench/invocationSubmit.ts resolves only merged global positive; queue/data/submissionApi.ts
 * carries expanded positives and one static negative; queue/core/promptBatch.ts consumes concrete
 * prompts/seeds; generation/core/canvas/addRegionalGuidance.ts consumes static regional strings.
 * Studio retains its existing planner order, seed policies and all-or-none 32-job admission.
 */
async function dynamicFixture() {
  const f = await createRegionalProjectFixture()
  const resources = {} as Record<Key, Resource>
  for (const [index, key] of (
    ['A', 'B', 'Negative', 'Regional', 'Prefix', 'Dormant'] as const
  ).entries()) {
    const bytes = Buffer.from(`Explicit Main-only dynamic TI identity ${key}`)
    const managedPath = path.join(f.root, `dynamic-ti-${key}.safetensors`)
    if (key !== 'Dormant') {
      await writeFile(managedPath, bytes, { mode: 0o600 })
    }
    const reference: PromptEmbeddingRef['resource'] = {
      ...f.embedding.resource,
      civitaiFileId: 13_300 + index,
      civitaiModelId: 13_100 + index,
      civitaiVersionId: 13_200 + index,
      displayName: `Saved dynamic TI ${key}`,
      fileSha256: regionalProjectDigest(bytes),
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      versionName: `Exact ${key}`,
    }
    const token = {
      A: '<a>',
      B: '<b>',
      Dormant: '<unused>',
      Negative: '<signed>',
      Prefix: 'prefix',
      Regional: '<signed>',
    }[key]
    resources[key] = {
      bytes,
      descriptor: { byteSize: bytes.length, managedPath, reference, token },
      ref: { resource: reference, token },
    }
  }
  const loras: FrozenGenerationLora[] = []
  const vaes: FrozenGenerationVae[] = []
  for (const [index, name] of ['A', 'B'].entries()) {
    for (const kind of ['lora', 'vae'] as const) {
      const bytes = Buffer.from(`Explicit Main-only dynamic ${kind} ${name}`)
      const managedPath = path.join(f.root, `dynamic-${kind}-${name}.safetensors`)
      await writeFile(managedPath, bytes, { mode: 0o600 })
      const reference = {
        ...f.reference,
        civitaiFileId: 14_300 + index + (kind === 'vae' ? 10 : 0),
        civitaiModelId: 14_100 + index + (kind === 'vae' ? 10 : 0),
        civitaiVersionId: 14_200 + index + (kind === 'vae' ? 10 : 0),
        displayName: `Saved ${kind} ${name}`,
        fileSha256: regionalProjectDigest(bytes),
        kind,
        localModelId: randomUUID(),
        localVersionId: randomUUID(),
        predictionType: null,
        versionName: `Exact ${name}`,
      }
      const descriptor = { byteSize: bytes.length, managedPath, reference }
      if (kind === 'lora') {
        loras.push({ ...descriptor, weight: index === 0 ? 0.7 : -0.25 })
      } else {
        vaes.push(descriptor)
      }
    }
  }
  const controls: {
    beforeWorker?: () => Promise<void>
    failTexts: Set<string>
    libraryDefault: 'A' | 'B'
    ready: ReturnType<RegionalProjectFixture['input']>['ready']
    unboundText?: string
  } = {
    failTexts: new Set(),
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
  }
  const resolved: Key[] = []
  const checked: { negative: string; positive: string }[] = []
  const selectedExtras = { loras: [] as string[], vaes: [] as string[] }
  f.models.assertNoUnboundGenerationEmbeddings = async (input) => {
    checked.push({ negative: input.negativePrompt.text, positive: input.positivePrompt.text })
    // Controlled catalog observation: the named literal exists but has no saved binding.
    // This checks *which concrete stream* Main asks ModelService to validate, not token parsing.
    if (input.positivePrompt.text === controls.unboundText) {
      throw Object.assign(new Error('Selected concrete prompt has an unbound installed token.'), {
        code: 'MODEL_EMBEDDING_UNBOUND',
      })
    }
  }
  f.models.resolveVerifiedGenerationEmbeddingForPlan = async (saved) => {
    f.calls.embedding++
    const key = (Object.keys(resources) as Key[]).find((name) =>
      isDeepStrictEqual(resources[name].ref.resource, saved),
    )
    assert.ok(key, 'Resolve the complete saved TI identity, never current library Default.')
    resolved.push(key)
    const entry = resources[key]
    let bytes: Buffer
    try {
      bytes = await readFile(entry.descriptor.managedPath)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw Object.assign(new Error(`Selected exact TI ${key} is missing.`), {
          code: 'MODEL_FILE_MISSING',
        })
      }
      throw error
    }
    if (!bytes.equals(entry.bytes)) {
      throw Object.assign(new Error(`Selected exact TI ${key} bytes changed.`), {
        code: 'MODEL_FILE_CORRUPT',
      })
    }
    return structuredClone({
      byteSize: entry.descriptor.byteSize,
      managedPath: entry.descriptor.managedPath,
      reference: saved,
    })
  }
  f.models.resolveVerifiedGenerationLoraForPlan = async (saved) => {
    const entry = loras.find((item) => isDeepStrictEqual(item.reference, saved))
    assert.ok(entry, 'LoRA resolution retains saved exact identity.')
    selectedExtras.loras.push(saved.localVersionId)
    const { weight: _weight, ...descriptor } = entry
    return structuredClone(descriptor)
  }
  f.models.resolveVerifiedGenerationVaeForPlan = async (saved) => {
    const entry = vaes.find((item) => isDeepStrictEqual(item.reference, saved))
    assert.ok(entry, 'VAE resolution retains saved exact identity.')
    selectedExtras.vaes.push(saved.localVersionId)
    return structuredClone(entry)
  }
  const publicCoordinator = new ProjectRegionalGenerationCoordinator({
    compositionProfile: 'invoke-canvas-v1',
    gate: f.gate,
    models: f.models,
    orchestrator: f.orchestrator,
    projects: f.projects,
    scratchBasePath: f.scratch,
  })
  const counters = { admission: 0, preparation: 0, worker: 0 }
  const consumed: RegionalWorkerInput[] = []
  const runtime: ActionRuntime & WorkerRuntime = {
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
    withGenerationWorker: async (_scratch, use) => {
      counters.worker++
      await controls.beforeWorker?.()
      return await use({
        ...f.transport({
          executeCurrentCanvasRegional: async (input) => {
            consumed.push(structuredClone(input))
            if (controls.failTexts.has(input.request.job.prompts.positive)) {
              throw new Error('Controlled frozen concrete item inference refusal')
            }
            return f.resultFor(input)
          },
          ready: structuredClone(controls.ready),
        }),
        generate: async () => assert.fail('Regional dynamics cannot enter ordinary inference.'),
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
  return {
    ...f,
    actions,
    checked,
    consumed,
    controls,
    counters,
    loras,
    publicCoordinator,
    resolved,
    resources,
    selectedExtras,
    vaes,
  }
}

async function withFixture(use: (f: Fixture) => Promise<void>) {
  const f = await dynamicFixture()
  try {
    await use(f)
  } finally {
    f.controls.beforeWorker = undefined
    await f.actions.shutdown()
    await f.publicCoordinator.shutdown()
    await f.close()
  }
}

async function select(
  f: Fixture,
  input: {
    extras?: boolean
    maxPrompts?: number
    positive?: string
    positiveRefs?: Key[]
    resources?: boolean
    seed?: number
    seedBehavior?: SeedBehavior
  } = {},
) {
  await f.edit((document) => {
    const refs: Key[] = input.positiveRefs ?? (input.resources ? ['A', 'B', 'Dormant'] : [])
    document.generationDraft.positivePrompt = {
      embeddingRefs: refs.map((key) => structuredClone(f.resources[key].ref)),
      text:
        input.positive ??
        (input.resources ? '{first <a>|second <b>}' : '{red subject|blue subject}'),
    }
    document.generationDraft.negativePrompt = input.resources
      ? { embeddingRefs: [structuredClone(f.resources.Negative.ref)], text: '<signed>' }
      : { embeddingRefs: [], text: 'static negative' }
    document.generationDraft.dynamicPrompt = {
      maxPrompts: input.maxPrompts ?? 2,
      seedBehavior: input.seedBehavior ?? 'per-iteration',
    }
    document.generationDraft.seed = { policy: 'fixed', value: input.seed ?? 123 }
    document.regionalGuidance![0].prompts = {
      negative: null,
      positive: input.resources
        ? { embeddingRefs: [structuredClone(f.resources.Regional.ref)], text: '<signed>' }
        : { embeddingRefs: [], text: 'static regional subject' },
      useGlobalNegativePrompt: true,
    }
    if (input.extras) {
      document.generationDraft.loras = f.loras.map((entry, index) => ({
        enabled: index === 0,
        resource: structuredClone(entry.reference),
        weight: entry.weight,
      }))
      document.generationDraft.vae = structuredClone(f.vaes[0].reference)
      document.generationDraft.vaePrecision = 'FP32'
    }
  })
  await f.projects.save(f.tabId)
  await f.projects.close(f.tabId)
  assert.equal((await f.projects.open(f.tabId)).kind, 'opened')
  return structuredClone(f.document())
}

function options(f: Fixture, iterations = 1): ProjectGenerateOptions {
  return { documentId: f.document().documentId, iterations }
}

async function queued(
  f: Fixture,
  count: number,
  iterations = 1,
  confirmation?: ProjectGenerateOptions['confirmation'],
) {
  const result = await f.actions.generate(f.tabId, {
    ...options(f, iterations),
    ...(confirmation ? { confirmation } : {}),
  })
  assert.equal(result.kind, 'queued')
  if (result.kind !== 'queued') {
    assert.fail('Expected the complete concrete positive batch.')
  }
  assert.equal(result.jobIds.length, count)
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
      assert.ok(found, 'Every admitted concrete item has one durable row.')
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
      assert.fail(`Unexpected blocked dynamic batch: ${state.error?.message}`)
    }
    await setImmediate()
  }
  assert.fail('The exact concrete batch did not settle before its bounded fixture deadline.')
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

async function assertBeforeWork(
  f: Fixture,
  before: Awaited<ReturnType<typeof snapshot>>,
  expectedPreparation = 0,
) {
  assert.deepEqual(await snapshot(f), before)
  assert.equal(f.calls.compose.length, 0)
  assert.equal(f.calls.checkpoint, 0)
  assert.equal(f.calls.embedding, 0)
  assert.equal(f.counters.preparation, expectedPreparation)
  assert.equal(f.consumed.length, 0)
  assert.deepEqual(await readdir(f.scratch), [])
}

function wire(f: Fixture, key: Key) {
  const entry = f.resources[key].descriptor
  return {
    byteSize: entry.byteSize,
    path: entry.managedPath,
    sha256: entry.reference.fileSha256,
    token: entry.token,
  }
}

function assertItemResources(f: Fixture, input: RegionalWorkerInput, key: 'A' | 'B') {
  const positive = f.resources[key]
  assert.deepEqual(input.request.job.embeddings, {
    negative: [wire(f, 'Negative')],
    positive: [wire(f, key)],
  })
  assert.deepEqual(input.recipe.globalEmbeddings, {
    negative: [f.resources.Negative.descriptor],
    positive: [positive.descriptor],
  })
  assert.deepEqual(input.recipe.globalPrompts.positive.embeddingRefs, [positive.ref])
  assert.equal(input.recipe.globalPrompts.positive.text, input.request.job.prompts.positive)
  assert.equal(input.recipe.globalPrompts.negative.text, '<signed>')
  assert.deepEqual(input.recipe.globalPrompts.negative.embeddingRefs, [f.resources.Negative.ref])
  assert.equal(input.recipe.regions[0].positive?.text, '<signed>')
  assert.deepEqual(input.recipe.regions[0].embeddings, {
    negative: [f.resources.Negative.descriptor],
    positive: [f.resources.Regional.descriptor],
  })
  assert.equal(input.recipe.regions[0].negative.source, 'current-canvas')
  assert.deepEqual(input.recipe.regions[0].negative.prompt.embeddingRefs, [
    f.resources.Negative.ref,
  ])
  assert.ok(Buffer.from(input.recipe.regions[0].coverage.alpha).equals(Buffer.from(f.alpha)))
}

for (const seedBehavior of ['per-iteration', 'per-prompt'] as const) {
  for (const baseSeed of [123, 0xff_ff_ff_ff]) {
    test(`dynamic positive keeps prompt-major 2x2 ${seedBehavior} seed ${baseSeed}`, async () => {
      await withFixture(async (f) => {
        const authored = await select(f, { resources: true, seed: baseSeed, seedBehavior })
        const saved = await readFile(f.packagePath)
        const result = await queued(f, 4, 2)
        assert.equal(result.truncated, false)
        assert.ok((await settled(f, result.jobIds)).every((job) => job.status === 'completed'))
        const offsets = seedBehavior === 'per-iteration' ? [0, 1, 0, 1] : [0, 1, 2, 3]
        const expectedSeeds = offsets.map((offset) => (baseSeed + offset) % 2 ** 32)
        assert.deepEqual(
          f.consumed.map((input) => input.request.job.prompts.positive),
          ['first <a>', 'first <a>', 'second <b>', 'second <b>'],
        )
        assert.deepEqual(
          f.consumed.map((input) => input.recipe.item.seed),
          expectedSeeds,
        )
        assert.deepEqual(
          f.consumed.map((input) => input.recipe.item.iteration),
          [0, 1, 0, 1],
        )
        assert.deepEqual(
          f.consumed.map((input) => input.recipe.item.promptPairIndex),
          [0, 0, 1, 1],
        )
        assert.equal(new Set(f.consumed.map((input) => input.request.requestId)).size, 4)
        for (const [index, id] of result.jobIds.entries()) {
          const loaded = await f.queue.loadVerifiedRegionalInput(id)
          assert.deepEqual(loaded.input.recipe, f.consumed[index].recipe)
          assert.equal(loaded.payload.context.sampling.seed, expectedSeeds[index])
          assert.equal(loaded.payload.context.sampling.seedBehavior, seedBehavior)
          assert.deepEqual(loaded.payload.context.prompts, f.consumed[index].request.job.prompts)
          assert.deepEqual(
            loaded.payload.context.embeddingRefs?.positive,
            authored.generationDraft.positivePrompt.embeddingRefs,
          )
          assertItemResources(f, loaded.input, index < 2 ? 'A' : 'B')
          assert.ok((await readFile(loaded.targetPath)).equals(f.targetBytes))
        }
        assert.equal(new Set((await rows(f)).map((row) => row.batch_id)).size, 1)
        assert.equal(f.calls.compose.length, 1)
        assert.equal(f.counters.preparation, 1)
        assert.equal(f.resolved.includes('Dormant'), false)
        assert.deepEqual(f.document(), authored)
        assert.ok((await readFile(f.packagePath)).equals(saved))
      })
    })
  }
}

test('dynamic positive later recipe and resource mutation target red', async () => {
  await withFixture(async (f) => {
    await select(f, { resources: true })
    const result = await queued(f, 2)
    assert.ok((await settled(f, result.jobIds)).every((job) => job.status === 'completed'))
    assertItemResources(f, f.consumed[0], 'A')
    assertItemResources(f, f.consumed[1], 'B')
    assert.equal(f.consumed[1].recipe.globalPrompts.positive.text, 'second <b>')
    assert.equal(f.consumed[1].recipe.item.promptPairIndex, 1)
    assert.notDeepEqual(
      f.consumed[1].recipe.globalEmbeddings,
      f.consumed[0].recipe.globalEmbeddings,
    )
  })
})

test('dynamic positive single selected resource control green', async () => {
  await withFixture(async (f) => {
    await select(f, { maxPrompts: 1, resources: true })
    const result = await queued(f, 1)
    assert.equal(result.truncated, true)
    assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
    assertItemResources(f, f.consumed[0], 'A')
    assert.equal(f.resolved.includes('B'), false)
  })
})

for (const grammar of [
  {
    expected: ['a red cup', 'a red vase', 'a blue cup', 'a blue vase'],
    source: 'a {red|blue} {cup|vase}',
  },
  { expected: ['red', 'blue'], source: '{ red | blue }' },
  { expected: ['prefix', 'preother'], source: 'pre{fix|other}' },
  { expected: ['a plain subject'], source: 'a plain subject' },
]) {
  test(`dynamic positive uses existing finite grammar ${grammar.source}`, async () => {
    await withFixture(async (f) => {
      await select(f, { maxPrompts: 8, positive: grammar.source })
      const result = await queued(f, grammar.expected.length)
      await settled(f, result.jobIds)
      assert.equal(result.truncated, false)
      assert.deepEqual(
        f.consumed.map((input) => input.request.job.prompts.positive),
        grammar.expected,
      )
      assert.ok(
        f.consumed.every((input) => input.request.job.prompts.negative === 'static negative'),
      )
      assert.ok(
        f.consumed.every(
          (input) => input.recipe.regions[0].positive?.text === 'static regional subject',
        ),
      )
    })
  })
}

for (const source of ['{a|}', '{a|b', 'a}', '{a|{b|c}}', '{a|b} then {c|}']) {
  test(`dynamic positive validates complete grammar before work ${source}`, async () => {
    await withFixture(async (f) => {
      await select(f, { maxPrompts: 1, positive: source })
      const before = await snapshot(f)
      await assert.rejects(f.actions.generate(f.tabId, options(f)), {
        code: 'GENERATION_INVALID_REQUEST',
      })
      await assertBeforeWork(f, before)
    })
  })
}

for (const branch of [
  'negative',
  'regional-positive',
  'regional-negative',
  'escaped-positive',
] as const) {
  test(`dynamic positive retains static refusal for ${branch}`, async () => {
    await withFixture(async (f) => {
      await select(f)
      await f.edit((document) => {
        switch (branch) {
          case 'escaped-positive': {
            document.generationDraft.positivePrompt.text = String.raw`a \{literal\} subject`

            break
          }
          case 'negative': {
            document.generationDraft.negativePrompt.text = '{bad|worse}'

            break
          }
          case 'regional-positive': {
            document.regionalGuidance![0].prompts!.positive!.text = '{red|blue}'

            break
          }
          default: {
            document.regionalGuidance![0].prompts!.useGlobalNegativePrompt = false
            document.regionalGuidance![0].prompts!.negative = {
              embeddingRefs: [],
              text: '{bad|worse}',
            }
          }
        }
      })
      const before = await snapshot(f)
      await assert.rejects(f.actions.generate(f.tabId, options(f)), {
        code: 'GENERATION_INVALID_REQUEST',
      })
      await assertBeforeWork(f, before)
    })
  })
}

test('dynamic positive ignores disabled regional and inherited-away local syntax', async () => {
  await withFixture(async (f) => {
    await select(f)
    const next = structuredClone(f.document())
    const active = next.regionalGuidance![0]
    active.prompts!.negative = {
      embeddingRefs: [f.resources.Dormant.ref],
      text: '{unused|broken}',
    }
    const dormant = structuredClone(active)
    dormant.id = randomUUID()
    dormant.enabled = false
    dormant.prompts!.positive!.text = '{broken'
    const bytes = encodeProjectMaskPng(f.alpha, 64, 64)
    dormant.mask.id = randomUUID()
    dormant.mask.asset = {
      bytes: bytes.length,
      height: 64,
      path: `assets/masks/${dormant.mask.id}/${regionalProjectDigest(bytes)}.png`,
      sha256: regionalProjectDigest(bytes),
      width: 64,
    }
    next.regionalGuidance!.push(dormant)
    await f.projects.getOpenDocumentForAcceptance(f.tabId)!.applyDocument(next, {
      [dormant.mask.asset.path]: { bytes },
    })
    const authored = structuredClone(f.document())
    const result = await queued(f, 2)
    await settled(f, result.jobIds)
    assert.ok(f.consumed.every((input) => input.recipe.regions.length === 1))
    assert.ok(
      f.consumed.every(
        (input) => input.recipe.regions[0].negative.prompt.text === 'static negative',
      ),
    )
    assert.equal(f.resolved.includes('Dormant'), false)
    assert.deepEqual(f.document(), authored)
  })
})

test('dynamic positive admits exactly 32 planned concrete jobs', async () => {
  await withFixture(async (f) => {
    await select(f)
    const result = await queued(f, 32, 16)
    assert.equal(result.truncated, false)
    assert.ok((await settled(f, result.jobIds)).every((job) => job.status === 'completed'))
    assert.equal((await rows(f)).length, 32)
    assert.deepEqual(
      f.consumed.map((input) => input.recipe.item.promptPairIndex),
      [...Array.from({ length: 16 }).fill(0), ...Array.from({ length: 16 }).fill(1)],
    )
    assert.equal(f.calls.compose.length, 1)
  })
})

test('dynamic positive aggregate 33 refuses before composition or model access', async () => {
  await withFixture(async (f) => {
    await select(f, { maxPrompts: 3, positive: '{first|second|third}' })
    const before = await snapshot(f)
    await assert.rejects(f.actions.generate(f.tabId, options(f, 11)), {
      code: 'GENERATION_INVALID_REQUEST',
    })
    await assertBeforeWork(f, before)
  })
})

test('dynamic positive later selected resource validation mutation target red', async () => {
  await withFixture(async (f) => {
    await select(f, { resources: true })
    await rm(f.resources.B.descriptor.managedPath)
    const before = await snapshot(f)
    await assert.rejects(f.actions.generate(f.tabId, options(f)), { code: 'MODEL_FILE_MISSING' })
    assert.ok(f.resolved.includes('A'))
    assert.ok(f.resolved.includes('B'))
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.consumed.length, 0)
    assert.deepEqual(await readdir(f.scratch), [])
  })
})

test('dynamic positive discarded missing resource prefix control green', async () => {
  await withFixture(async (f) => {
    await select(f, { maxPrompts: 1, resources: true })
    await rm(f.resources.B.descriptor.managedPath)
    const result = await queued(f, 1)
    assert.equal(result.truncated, true)
    assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
    assertItemResources(f, f.consumed[0], 'A')
    assert.equal(f.resolved.includes('B'), false)
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    assert.deepEqual(loaded.payload.context.embeddingRefs?.positive, [
      f.resources.A.ref,
      f.resources.B.ref,
      f.resources.Dormant.ref,
    ])
  })
})

test('dynamic positive late unbound concrete branch preserves reviewed old work without partial replacement', async () => {
  await withFixture(async (f) => {
    await select(f, { positive: 'healthy existing result' })
    const first = await queued(f, 1)
    await settled(f, first.jobIds)
    await select(f, { positive: '{healthy first|later <unbound>}' })
    f.controls.unboundText = 'later <unbound>'
    const review = await f.actions.generate(f.tabId, options(f))
    assert.equal(review.kind, 'confirmation-required')
    if (review.kind !== 'confirmation-required') {
      assert.fail('Prior completed work must be reviewed before replacement.')
    }
    const before = await snapshot(f)
    await assert.rejects(
      f.actions.generate(f.tabId, {
        ...options(f),
        confirmation: {
          candidateIds: review.candidateIds,
          unfinishedJobIds: review.unfinishedJobIds,
        },
      }),
      { code: 'MODEL_EMBEDDING_UNBOUND' },
    )
    assert.ok(f.checked.some((entry) => entry.positive === 'later <unbound>'))
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.consumed.length, 1)
  })
})

test('dynamic positive expansion-created literal requires capability before composition', async () => {
  await withFixture(async (f) => {
    await select(f, { positive: 'pre{fix|other}', positiveRefs: ['Prefix'] })
    assert.match(
      getInvokeRegionalGenerationUnavailableReason({
        document: f.document(),
        embeddingsSupported: false,
        initializationSupported: true,
        iterations: 1,
        loraSupported: true,
        runtimeSupported: true,
        vaeSupported: true,
      })!,
      /does not support global embeddings/,
    )
    // Qualified 0.9 genuinely lacks TI support; refuse before its narrower sampler gate.
    f.controls.ready.workerVersion = '0.9.0'
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (cap) => cap !== 'illustrious-embeddings',
    )
    const before = await snapshot(f)
    await assert.rejects(f.actions.generate(f.tabId, options(f)), {
      code: 'GENERATION_RUNTIME_UNAVAILABLE',
    })
    await assertBeforeWork(f, before, 1)
  })
})

test('dynamic positive expansion-created literal selects exact descriptor only on its concrete item', async () => {
  await withFixture(async (f) => {
    await select(f, { positive: 'pre{fix|other}', positiveRefs: ['Prefix', 'Dormant'] })
    const result = await queued(f, 2)
    await settled(f, result.jobIds)
    const first = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    const second = await f.queue.loadVerifiedRegionalInput(result.jobIds[1])
    assert.equal(first.input.request.job.prompts.positive, 'prefix')
    assert.deepEqual(first.input.recipe.globalEmbeddings?.positive, [f.resources.Prefix.descriptor])
    assert.deepEqual(first.input.request.job.embeddings?.positive, [wire(f, 'Prefix')])
    assert.equal(second.input.request.job.prompts.positive, 'preother')
    assert.deepEqual(second.input.recipe.globalEmbeddings?.positive, [])
    assert.equal(second.input.request.job.embeddings, undefined)
    assert.deepEqual(second.payload.context.embeddingRefs?.positive, [
      f.resources.Prefix.ref,
      f.resources.Dormant.ref,
    ])
    assert.equal(f.resolved.includes('Dormant'), false)
  })
})

test('dynamic positive discarded and dormant refs require neither embedding capability nor resolution', async () => {
  await withFixture(async (f) => {
    await select(f, {
      maxPrompts: 1,
      positive: '{plain chosen|later <b>}',
      positiveRefs: ['B', 'Dormant'],
    })
    await rm(f.resources.B.descriptor.managedPath)
    assert.equal(
      getInvokeRegionalGenerationUnavailableReason({
        document: f.document(),
        embeddingsSupported: false,
        initializationSupported: true,
        iterations: 1,
        loraSupported: true,
        runtimeSupported: true,
        vaeSupported: true,
      }),
      null,
    )
    const result = await queued(f, 1)
    assert.equal(result.truncated, true)
    await settled(f, result.jobIds)
    assert.deepEqual(f.resolved, [])
    assert.equal(f.consumed[0].request.job.embeddings, undefined)
    assert.deepEqual(f.consumed[0].recipe.globalEmbeddings, { negative: [], positive: [] })
  })
})

test('dynamic positive response reports actual prefix and records configured single-item seed behavior', async () => {
  await withFixture(async (f) => {
    await select(f, { maxPrompts: 1, seedBehavior: 'per-prompt' })
    const result = await queued(f, 1)
    assert.equal(result.truncated, true)
    await settled(f, result.jobIds)
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    assert.equal(loaded.payload.context.sampling.seedBehavior, 'per-prompt')
    assert.equal(loaded.payload.context.sampling.seed, 123)
    assert.equal(loaded.input.recipe.item.promptPairIndex, 0)
  })
})

test('dynamic positive Random resolves one actual base seed for the full concrete plan', async () => {
  await withFixture(async (f) => {
    await select(f, { seedBehavior: 'per-prompt' })
    await f.edit((document) => {
      document.generationDraft.seed = { policy: 'random', value: null }
    })
    const result = await queued(f, 4, 2)
    await settled(f, result.jobIds)
    const base = f.consumed[0].recipe.item.seed
    assert.ok(Number.isSafeInteger(base) && base >= 0 && base <= 0xff_ff_ff_ff)
    assert.deepEqual(
      f.consumed.map((input) => input.request.job.sampling.seed),
      [0, 1, 2, 3].map((offset) => (base + offset) % 2 ** 32),
    )
    for (const id of result.jobIds) {
      const loaded = await f.queue.loadVerifiedRegionalInput(id)
      assert.equal(loaded.payload.context.sampling.requestedSeedPolicy, 'random')
    }
    assert.equal(f.counters.preparation, 1)
    assert.equal(f.calls.compose.length, 1)
  })
})

test('dynamic positive Reuse without completed actual seed refuses before work', async () => {
  await withFixture(async (f) => {
    await select(f)
    await f.edit((document) => {
      document.generationDraft.seed = { policy: 'reuse', value: null }
    })
    const before = await snapshot(f)
    await assert.rejects(f.actions.generate(f.tabId, options(f)), {
      code: 'GENERATION_SEED_UNAVAILABLE',
    })
    await assertBeforeWork(f, before, 1)
  })
})

test('dynamic positive Reuse consumes completed actual seed once and retains prefix semantics', async () => {
  await withFixture(async (f) => {
    await select(f, { positive: 'first completed seed', seed: 777 })
    const first = await queued(f, 1)
    await settled(f, first.jobIds)
    await select(f, { seedBehavior: 'per-prompt' })
    await f.edit((document) => {
      document.generationDraft.seed = { policy: 'reuse', value: null }
    })
    const review = await f.actions.generate(f.tabId, options(f, 2))
    assert.equal(review.kind, 'confirmation-required')
    if (review.kind !== 'confirmation-required') {
      assert.fail('Completed work requires reviewed replacement.')
    }
    const result = await queued(f, 4, 2, {
      candidateIds: review.candidateIds,
      unfinishedJobIds: review.unfinishedJobIds,
    })
    await settled(f, result.jobIds)
    assert.deepEqual(
      f.consumed.slice(1).map((input) => input.recipe.item.seed),
      [777, 778, 779, 780],
    )
    assert.equal(f.calls.compose.length, 2)
    assert.equal(f.counters.preparation, 2)
  })
})

test('dynamic positive portable provenance contains concrete text and only that item active global refs', async () => {
  await withFixture(async (f) => {
    const authored = await select(f, { extras: true, resources: true })
    const result = await queued(f, 2)
    await settled(f, result.jobIds)
    const candidates = await f.staging.listVerifiedCandidates(f.tabId)
    for (const [index, id] of result.jobIds.entries()) {
      const candidate = candidates.find((item) => item.queueItemId === id)
      assert.ok(candidate)
      const base = parseAcceptedGenerationBaseV1(candidate.frozenPayloadJson)
      assert.equal(base.kind, 'illustrious-txt2img')
      if (base.kind !== 'illustrious-txt2img') {
        assert.fail('Public regional candidates retain the existing portable ordinary base.')
      }
      const key = index === 0 ? 'A' : 'B'
      assert.deepEqual(
        base.context.embeddingRefs?.positive,
        authored.generationDraft.positivePrompt.embeddingRefs,
      )
      assert.deepEqual(base.context.embeddings?.positive, [f.resources[key].descriptor])
      const provenance = provenanceFromVerifiedRasterCandidate({
        acceptedAt: candidate.completedAt,
        candidate,
        imagePngBytes: Buffer.from(f.outputBytes),
      })
      assert.equal(provenance.kind, 'illustrious-txt2img')
      assert.equal(
        provenance.generationConfiguration.positivePrompt.text,
        index === 0 ? 'first <a>' : 'second <b>',
      )
      assert.deepEqual(provenance.generationConfiguration.positivePrompt.embeddingRefs, [
        f.resources[key].ref,
      ])
      assert.deepEqual(provenance.generationConfiguration.negativePrompt.embeddingRefs, [
        f.resources.Negative.ref,
      ])
      assert.deepEqual(provenance.generationConfiguration.loras, authored.generationDraft.loras)
      assert.deepEqual(provenance.generationConfiguration.vae, authored.generationDraft.vae)
      const serialized = JSON.stringify(provenance)
      for (const omitted of [
        'regionalGuidance',
        'compositionProfile',
        'managedPath',
        'dynamicPrompt',
      ]) {
        assert.equal(serialized.includes(`"${omitted}"`), false)
      }
      for (const omitted of ['Dormant', 'Regional', index === 0 ? 'B' : 'A'] as const) {
        assert.equal(serialized.includes(f.resources[omitted].ref.resource.localVersionId), false)
      }
      assert.equal(serialized.includes(authored.generationDraft.positivePrompt.text), false)
    }
    assert.deepEqual(f.document(), authored)
  })
})

test('dynamic positive preserves exact selected LoRA VAE and precision on every concrete item', async () => {
  await withFixture(async (f) => {
    const authored = await select(f, { extras: true, resources: true })
    const result = await queued(f, 4, 2)
    await settled(f, result.jobIds)
    for (const id of result.jobIds) {
      const loaded = await f.queue.loadVerifiedRegionalInput(id)
      assert.deepEqual(loaded.payload.context.loraStack, authored.generationDraft.loras)
      assert.deepEqual(loaded.payload.context.loras, [f.loras[0]])
      assert.deepEqual(loaded.payload.context.vae, f.vaes[0])
      assert.equal(loaded.input.request.job.vaePrecision, 'FP32')
      assert.deepEqual(loaded.input.request.job.vae, {
        byteSize: f.vaes[0].byteSize,
        path: f.vaes[0].managedPath,
        sha256: f.vaes[0].reference.fileSha256,
      })
      assert.deepEqual(loaded.input.request.job.loras, [
        {
          byteSize: f.loras[0].byteSize,
          path: f.loras[0].managedPath,
          sha256: f.loras[0].reference.fileSha256,
          weight: f.loras[0].weight,
        },
      ])
    }
    assert.ok(f.selectedExtras.loras.every((id) => id === f.loras[0].reference.localVersionId))
    assert.ok(f.selectedExtras.vaes.every((id) => id === f.vaes[0].reference.localVersionId))
  })
})

async function oppositeSavedEdits(f: Fixture) {
  f.controls.libraryDefault = 'B'
  await f.edit((document) => {
    document.generationDraft.positivePrompt = { embeddingRefs: [], text: '{later|template}' }
    document.generationDraft.negativePrompt = { embeddingRefs: [], text: 'later negative' }
    document.generationDraft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
    document.generationDraft.seed = { policy: 'fixed', value: 999 }
    document.generationDraft.loras = [
      { enabled: true, resource: f.loras[1].reference, weight: -0.25 },
    ]
    document.generationDraft.vae = structuredClone(f.vaes[1].reference)
    document.generationDraft.vaePrecision = 'FP16'
    document.regionalGuidance = []
  })
  await f.projects.save(f.tabId)
  return structuredClone(f.document())
}

test('dynamic positive frozen Retry consumes failed later branch after saved template TI LoRA VAE Default edits', async () => {
  await withFixture(async (f) => {
    await select(f, { extras: true, resources: true, seedBehavior: 'per-prompt' })
    f.controls.failTexts.add('second <b>')
    const result = await queued(f, 2)
    assert.deepEqual(
      (await settled(f, result.jobIds)).map((job) => job.status),
      ['completed', 'failed'],
    )
    const source = await f.queue.loadVerifiedRegionalInput(result.jobIds[1])
    const authored = await oppositeSavedEdits(f)
    const saved = await readFile(f.packagePath)
    f.controls.failTexts.clear()
    await f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence })
    const retry = (await rows(f)).find((row) => !result.jobIds.includes(row.id))
    assert.ok(retry)
    assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
    const loaded = await f.queue.loadVerifiedRegionalInput(retry.id)
    assert.deepEqual(loaded.payload, source.payload)
    assert.deepEqual(f.consumed[2].recipe, source.input.recipe)
    assert.equal(f.consumed[2].request.job.prompts.positive, 'second <b>')
    assert.equal(f.consumed[2].request.job.sampling.seed, 124)
    assertItemResources(f, loaded.input, 'B')
    assert.deepEqual(loaded.payload.context.loras, [f.loras[0]])
    assert.deepEqual(loaded.payload.context.vae, f.vaes[0])
    assert.equal(f.calls.compose.length, 1)
    assert.deepEqual(f.document(), authored)
    assert.ok((await readFile(f.packagePath)).equals(saved))
  })
})

test('dynamic positive bootstrap recovery retains each original recipe without automatic dispatch', async () => {
  await withFixture(async (f) => {
    await select(f, { extras: true, resources: true, seedBehavior: 'per-prompt' })
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
    assert.equal(admitted.length, 4)
    const originals = await Promise.all(
      admitted.map(async (item) => await f.queue.loadVerifiedRegionalInput(item.id)),
    )
    const connection = openAppDatabase(f.root, path.resolve('src/main/db/migrations'))
    try {
      const recovered = new GenerationQueueRepository(connection.db, f.root)
      assert.equal((await recovered.recoverAfterRestart()).canceledCount, 4)
      for (const [index, item] of admitted.entries()) {
        const loaded = await recovered.loadVerifiedRegionalInput(item.id)
        assert.equal(loaded.item.status, 'canceled')
        assert.deepEqual(loaded.payload, originals[index].payload)
        assertItemResources(f, loaded.input, index < 2 ? 'A' : 'B')
        assert.equal(loaded.input.recipe.item.seed, 123 + index)
      }
      const authored = await oppositeSavedEdits(f)
      const terminal = await recovered.getManagerEntry(admitted[3].id)
      const retry = await recovered.retryInvokeCanvasRegionalTerminal(
        terminal.id,
        terminal.statusSequence,
      )
      assert.deepEqual(
        (await recovered.loadVerifiedRegionalInput(retry.id)).payload,
        originals[3].payload,
      )
      assert.deepEqual(f.document(), authored)
      assert.equal(f.consumed.length, 0)
    } finally {
      await connection.close()
    }
  })
})

test('dynamic positive keeps private regional all-static refusal', async () => {
  await withFixture(async (f) => {
    await select(f)
    const before = await snapshot(f)
    await assert.rejects(f.coordinator.submit(f.tabId, f.input()), {
      code: 'UNSUPPORTED',
    })
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.calls.compose.length, 0)
    assert.equal(f.consumed.length, 0)
  })
})

for (const drift of [
  'global-negative',
  'regional-positive',
  'regional-mask',
  'negative-resource',
] as const) {
  test(`dynamic positive atomic queue refuses individually valid mixed ${drift}`, async () => {
    await withFixture(async (f) => {
      await select(f, { resources: true })
      const result = await queued(f, 2)
      await settled(f, result.jobIds)
      const originals = await Promise.all(
        result.jobIds.map(async (id) => await f.queue.loadVerifiedRegionalInput(id)),
      )
      const items = originals.map((original) => {
        const { request, ...regional } = structuredClone(original.input)
        request.requestId = randomUUID()
        return {
          prepared: {
            context: structuredClone(original.payload.context),
            targetPngBytes: Buffer.from(f.targetBytes),
          },
          regional,
          request,
        }
      })
      const second = items[1]
      switch (drift) {
        case 'global-negative': {
          second.prepared.context.prompts.negative = 'changed static <signed>'
          second.request.job.prompts.negative = 'changed static <signed>'
          second.regional.recipe.globalPrompts.negative.text = 'changed static <signed>'
          second.regional.recipe.item = {
            ...second.regional.recipe.item,
            prompts: {
              ...second.regional.recipe.item.prompts,
              negative: 'changed static <signed>',
            },
          }
          second.regional.recipe.regions[0].negative.prompt.text = 'changed static <signed>'
          break
        }
        case 'negative-resource': {
          const replacement = f.resources.Regional
          second.prepared.context.embeddingRefs!.negative = [structuredClone(replacement.ref)]
          second.prepared.context.embeddings!.negative = [structuredClone(replacement.descriptor)]
          second.request.job.embeddings!.negative = [wire(f, 'Regional')]
          second.regional.recipe.globalPrompts.negative.embeddingRefs = [
            structuredClone(replacement.ref),
          ]
          second.regional.recipe.globalEmbeddings!.negative = [
            structuredClone(replacement.descriptor),
          ]
          second.regional.recipe.regions[0].negative.prompt.embeddingRefs = [
            structuredClone(replacement.ref),
          ]
          second.regional.recipe.regions[0].embeddings!.negative = [
            structuredClone(replacement.descriptor),
          ]
          break
        }
        case 'regional-mask': {
          const alpha = second.regional.recipe.regions[0].coverage.alpha
          alpha[0] = alpha[0] === 255 ? 0 : 255
          break
        }
        case 'regional-positive': {
          second.regional.recipe.regions[0].positive!.text = 'changed regional <signed>'
          const authored = second.regional.recipe.regions[0].authoredPrompts
          if (authored?.positive) {
            authored.positive.text = 'changed regional <signed>'
          }
          break
        }
      }
      // Each item passes the real recipe/context/resource association owner on its own.
      // The refusal must discriminate the shared batch invariant rather than malformed material.
      for (const item of items) {
        assert.doesNotThrow(() =>
          captureRegionalQueuedMaterial(
            { ...item.regional, request: item.request },
            item.prepared.context,
          ),
        )
      }
      const before = await snapshot(f)
      await assert.rejects(
        f.queue.enqueueInvokeCanvasRegionalBatch({
          items,
          preflight: async () =>
            assert.fail('Mixed batch must refuse before publication preflight.'),
          projectPath: f.packagePath,
          stagingSessionId: randomUUID(),
        }),
        { code: 'QUEUE_INPUT_INVALID' },
      )
      assert.deepEqual(await snapshot(f), before)
      assert.equal(f.consumed.length, 2)
    })
  })
}

test('dynamic positive captures original template once while dispatch remains frozen after edits', async () => {
  await withFixture(async (f) => {
    await select(f, { resources: true, seedBehavior: 'per-prompt' })
    const release = regionalProjectDeferred()
    const capture = f.projects.withCapturedCurrentCanvasRegionalGenerationInput.bind(f.projects)
    const seen: string[] = []
    f.projects.withCapturedCurrentCanvasRegionalGenerationInput = async (...args) => {
      seen.push(f.document().generationDraft.positivePrompt.text)
      return await capture(...args)
    }
    f.controls.beforeWorker = async () => await release.promise
    try {
      const result = await queued(f, 2)
      await f.edit((document) => {
        document.generationDraft.positivePrompt = { embeddingRefs: [], text: '{new|draft}' }
        document.generationDraft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
      })
      const authored = structuredClone(f.document())
      release.resolve()
      await settled(f, result.jobIds)
      assert.deepEqual(seen, ['{first <a>|second <b>}'])
      assert.deepEqual(
        f.consumed.map((input) => input.request.job.prompts.positive),
        ['first <a>', 'second <b>'],
      )
      assertItemResources(f, f.consumed[0], 'A')
      assertItemResources(f, f.consumed[1], 'B')
      assert.deepEqual(f.document(), authored)
    } finally {
      release.resolve()
      f.projects.withCapturedCurrentCanvasRegionalGenerationInput = capture
    }
  })
})
