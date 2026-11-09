import { supportsInferenceRegionalDpm } from '../../shared/projects/inference-worker-capabilities.js'
import type { ProjectGenerateOptions } from '../../shared/projects/project-generation-actions.js'
import { isProjectGenerationActionState } from '../../shared/projects/project-generation-actions.js'
import type { PromptEmbeddingRef } from '../../shared/projects/prompt-embeddings.js'
import { getInvokeRegionalGenerationUnavailableReason } from '../../shared/projects/regional-invoke-generation.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { isDeepStrictEqual } from 'node:util'

import type { FrozenGenerationEmbedding } from './illustrious-generation-embeddings.js'
import type { FrozenGenerationLora } from './illustrious-generation-loras.js'
import type { FrozenGenerationVae } from './illustrious-generation-vae.js'
import type { RegionalWorkerInput } from './regional-worker-request.js'
import type { RegionalProjectFixture } from './test-fixtures/regional-project.js'
import type { RegionalQueueFixture } from './test-fixtures/regional-queue.js'

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

type Key = 'A' | 'B' | 'Dormant' | 'Negative' | 'Prefix' | 'Regional'
type Resource = { bytes: Buffer; descriptor: FrozenGenerationEmbedding; ref: PromptEmbeddingRef }
type ActionRuntime = ConstructorParameters<typeof ProjectGenerationActionController>[0]['runtime']
type WorkerRuntime = ConstructorParameters<typeof GenerationDispatchCoordinator>[0]
type Fixture = Awaited<ReturnType<typeof dpmFixture>>
type SeedBehavior = 'per-iteration' | 'per-prompt'

/**
 * Genuine Service save/reopen/capture, existing planner, public action/coordinator, atomic queue,
 * SQLite/files, dispatch, candidate receipt and portable provenance. Catalog/structural model
 * qualification, target composition and numerical inference are explicit controlled substitutes;
 * authored tiny resources are identity fixtures, not native model/TI/LoRA/VAE qualification.
 *
 * Current InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd sources consulted directly:
 * backend/stable_diffusion/schedulers/schedulers.py maps dpmpp_2m[_k] to native multistep order2;
 * app/invocations/sd/denoise_latents.py selects the scheduler independently of regional
 * conditioning, initializes its schedule and forwards the separate seed-xor generator; frontend
 * generation/core/ graph.ts passes the authored scheduler into that same regional denoiser.
 * Existing Studio frozen transport, capture, resource, seed, atomic admission and acceptance owners
 * remain authoritative.
 */
async function dpmFixture(predictionType: 'epsilon' | 'v_prediction' = 'epsilon') {
  const f = await createRegionalProjectFixture()
  if (predictionType === 'v_prediction') {
    const resolve = f.models.resolveVerifiedGenerationCheckpointForPlan.bind(f.models)
    f.models.resolveVerifiedGenerationCheckpointForPlan = async (reference) => {
      const exact = await resolve({ ...reference, predictionType: 'epsilon' })
      return { ...exact, reference: { ...exact.reference, predictionType: 'v_prediction' } }
    }
  }
  const resources = {} as Record<Key, Resource>
  for (const [index, key] of (
    ['A', 'B', 'Negative', 'Regional', 'Prefix', 'Dormant'] as const
  ).entries()) {
    const bytes = Buffer.from(`Explicit Main-only DPM TI identity ${key}`)
    const managedPath = path.join(f.root, `dpm-ti-${key}.safetensors`)
    if (key !== 'Dormant') {
      await writeFile(managedPath, bytes, { mode: 0o600 })
    }
    const reference: PromptEmbeddingRef['resource'] = {
      ...f.embedding.resource,
      civitaiFileId: 13_300 + index,
      civitaiModelId: 13_100 + index,
      civitaiVersionId: 13_200 + index,
      displayName: `Saved DPM TI ${key}`,
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
      const managedPath = path.join(f.root, `dpm-${kind}-${name}.safetensors`)
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
        'illustrious-regional-dpmpp-2m-v1',
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
            assert.ok(input.compositionProfile !== 'invoke-krea2-global-support-v1')
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

async function withFixture(
  use: (f: Fixture) => Promise<void>,
  predictionType: 'epsilon' | 'v_prediction' = 'epsilon',
) {
  const f = await dpmFixture(predictionType)
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
    sampler?: 'DPM++ 2M' | 'Euler' | 'Euler a'
    scheduler?: 'Karras' | 'Normal'
    seed?: number
    seedBehavior?: SeedBehavior
  } = {},
) {
  await f.edit((document) => {
    const refs: Key[] = input.positiveRefs ?? (input.resources ? ['A', 'B', 'Dormant'] : [])
    document.generationDraft.positivePrompt = {
      embeddingRefs: refs.map((key) => structuredClone(f.resources[key].ref)),
      text: input.positive ?? (input.resources ? '{first <a>|second <b>}' : 'DPM plain subject'),
    }
    document.generationDraft.negativePrompt = input.resources
      ? { embeddingRefs: [structuredClone(f.resources.Negative.ref)], text: '<signed>' }
      : { embeddingRefs: [], text: 'static negative' }
    document.generationDraft.dynamicPrompt = {
      maxPrompts: input.maxPrompts ?? 2,
      seedBehavior: input.seedBehavior ?? 'per-iteration',
    }
    document.generationDraft.seed = { policy: 'fixed', value: input.seed ?? 123 }
    document.generationDraft.sampling.sampler = input.sampler ?? 'DPM++ 2M'
    document.generationDraft.sampling.scheduler = input.scheduler ?? 'Karras'
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

const DPM_CAPABILITY = 'illustrious-regional-dpmpp-2m-v1'
const INITIALIZATION = 'invoke-cpu-f32-add-noise-v1' as const
const INIT_CAPABILITY = 'illustrious-regional-invoke-init-v1'
type DpmKey = 'dpmpp_2m_k' | 'dpmpp_2m'

function disableDpm(f: Fixture) {
  f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
    (cap) => cap !== DPM_CAPABILITY,
  )
}

function assertDpm(input: RegionalWorkerInput, key: DpmKey) {
  assert.equal(input.compositionProfile, 'invoke-canvas-v1')
  assert.equal(input.initializationProfile, INITIALIZATION)
  assert.equal(input.request.job.sampling.scheduler, key)
  assert.equal(input.request.job.checkpoint.predictionType, 'epsilon')
  assert.deepEqual(input.request.job.sampling.noiseProfile, {
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: false,
    schemaVersion: 1,
    timestepSpacing: 'leading',
  })
}

async function lowDpm(key: DpmKey = 'dpmpp_2m_k') {
  const f = await createRegionalQueueFixture()
  f.prepared.context.sampling = {
    ...f.prepared.context.sampling,
    invokeScheduler: key,
    sampler: 'DPM++ 2M',
    scheduler: key === 'dpmpp_2m_k' ? 'Karras' : 'Normal',
  }
  f.request.job.sampling.scheduler = key
  const input: RegionalWorkerInput = {
    ...f.regional,
    compositionProfile: 'invoke-canvas-v1',
    initializationProfile: INITIALIZATION,
    request: f.request,
  }
  return { ...f, input }
}

async function saveOtherSettings(f: Fixture, sampler: 'DPM++ 2M' | 'Euler' = 'Euler') {
  f.controls.libraryDefault = 'B'
  await f.edit((document) => {
    document.generationDraft.sampling = {
      ...document.generationDraft.sampling,
      sampler,
      scheduler: sampler === 'Euler' ? 'Normal' : 'Karras',
      steps: 7,
    }
    document.generationDraft.positivePrompt = { embeddingRefs: [], text: '{edited|template}' }
    document.generationDraft.negativePrompt = { embeddingRefs: [], text: 'edited negative' }
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
  await f.projects.close(f.tabId)
  assert.equal((await f.projects.open(f.tabId)).kind, 'opened')
  return structuredClone(f.document())
}

function advisory(f: Fixture, dpmSupported: boolean | null | undefined) {
  return getInvokeRegionalGenerationUnavailableReason({
    document: f.document(),
    dpmSupported,
    embeddingsSupported: true,
    initializationSupported: true,
    iterations: 1,
    loraSupported: true,
    runtimeSupported: true,
    vaeSupported: true,
  })
}

test('public regional DPM capability refuses before composition', async () => {
  await withFixture(async (f) => {
    await select(f)
    disableDpm(f)
    const before = await snapshot(f)
    await assert.rejects(f.actions.generate(f.tabId, options(f)), {
      code: 'GENERATION_RUNTIME_UNAVAILABLE',
    })
    await assertBeforeWork(f, before, 1)
  })
})

test('public regional Euler capability control stays compatible', async () => {
  await withFixture(async (f) => {
    await select(f, { sampler: 'Euler', scheduler: 'Normal' })
    disableDpm(f)
    const result = await queued(f, 1)
    assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
    assert.equal(f.consumed[0].request.job.sampling.scheduler, 'euler')
    assert.equal(Object.hasOwn(f.consumed[0], 'initializationProfile'), false)
  })
})

test('public regional DPM support requires its exact qualified peer and both public owners', async () => {
  await withFixture(async (f) => {
    const ready = structuredClone(f.controls.ready)
    assert.equal(supportsInferenceRegionalDpm(ready), true)
    for (const absent of [DPM_CAPABILITY, INIT_CAPABILITY, 'illustrious-regional-invoke-v1']) {
      assert.equal(
        supportsInferenceRegionalDpm({
          ...ready,
          capabilities: ready.capabilities.filter((cap) => cap !== absent),
        }),
        false,
        absent,
      )
    }
    for (const unsupported of [
      null,
      { ...ready, protocolVersion: '2' },
      { ...ready, runtimeProfile: 'linux-cpu' },
      { ...ready, workerVersion: '0.13.0' },
      { ...ready, workerVersion: '0.15.0' },
    ]) {
      assert.equal(supportsInferenceRegionalDpm(unsupported), false)
    }
  })
})

test('public regional DPM state has one strict optional Boolean with absent peers preserved', async () => {
  await withFixture(async (f) => {
    const state = await f.actions.getState(f.tabId)
    assert.equal(state.regionalDpmSupported, true)
    assert.equal(isProjectGenerationActionState(state), true)
    const { regionalDpmSupported: _dpm, ...oldState } = state
    assert.equal(isProjectGenerationActionState(oldState), true)
    for (const value of [false, true, undefined]) {
      assert.equal(isProjectGenerationActionState({ ...state, regionalDpmSupported: value }), true)
    }
    for (const value of [null, 0, 1, 'true', {}, []]) {
      assert.equal(isProjectGenerationActionState({ ...state, regionalDpmSupported: value }), false)
    }
    disableDpm(f)
    assert.equal((await f.actions.getState(f.tabId)).regionalDpmSupported, false)
    assert.equal((await f.actions.getState(f.tabId)).regionalSupported, true)
  })
})

test('public regional DPM advisory and frozen Retry distinguish old readiness from Euler controls', async () => {
  await withFixture(async (f) => {
    await select(f)
    assert.match(advisory(f, undefined)!, /Checking image engine support.*DPM\+\+ 2M/)
    assert.match(advisory(f, null)!, /Checking image engine support.*DPM\+\+ 2M/)
    assert.match(advisory(f, false)!, /does not support.*DPM\+\+ 2M/)
    assert.equal(advisory(f, true), null)
    for (const regionalDpmSupported of [undefined, false, true]) {
      const state = { regionalDpmSupported, regionalSupported: true }
      assert.equal(
        generationQueueRetryReason('illustrious-regional-txt2img', state, 'DPM++ 2M') === null,
        regionalDpmSupported === true,
      )
      assert.equal(generationQueueRetryReason('illustrious-regional-txt2img', state, 'Euler'), null)
    }
    assert.match(
      generationQueueRetryReason('illustrious-regional-txt2img', null, 'DPM++ 2M')!,
      /Checking image engine support/,
    )
    assert.match(
      generationQueueRetryReason(
        'illustrious-regional-txt2img',
        { regionalDpmSupported: true, regionalSupported: false },
        'DPM++ 2M',
      )!,
      /does not support Regional Guidance/,
    )
  })
})

for (const scheduler of ['Normal', 'Karras'] as const) {
  const key: DpmKey = scheduler === 'Karras' ? 'dpmpp_2m_k' : 'dpmpp_2m'
  test(`public regional DPM ${scheduler} crosses saved Main recipe queue and PNG receipt`, async () => {
    await withFixture(async (f) => {
      const document = await select(f, { scheduler })
      const saved = await readFile(f.packagePath)
      const result = await queued(f, 1)
      assert.equal(result.truncated, false)
      assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
      const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      assertDpm(loaded.input, key)
      assertDpm(f.consumed[0], key)
      assert.deepEqual(loaded.payload.context.sampling, {
        cfgRescale: 0,
        cfgScale: 5,
        invokeScheduler: key,
        noiseProfile: loaded.input.request.job.sampling.noiseProfile,
        requestedSeedPolicy: 'fixed',
        sampler: 'DPM++ 2M',
        scheduler,
        seed: 123,
        steps: 2,
      })
      assert.equal((await f.staging.listVerifiedCandidates(f.tabId)).length, 1)
      assert.equal(f.calls.compose.length, 1)
      // ModelService also re-verifies the exact file at admission and dispatch. The captured
      // preparation owner, rather than that aggregate resolver counter, runs once.
      assert.equal(f.counters.preparation, 1)
      assert.deepEqual(f.document(), document)
      assert.ok((await readFile(f.packagePath)).equals(saved))
    })
  })

  for (const seedBehavior of ['per-iteration', 'per-prompt'] as const) {
    test(`public regional DPM ${scheduler} keeps dynamic 2x2 ${seedBehavior} and exact resources`, async () => {
      await withFixture(async (f) => {
        const authored = await select(f, { extras: true, resources: true, scheduler, seedBehavior })
        const result = await queued(f, 4, 2)
        assert.ok((await settled(f, result.jobIds)).every((job) => job.status === 'completed'))
        const expectedSeeds =
          seedBehavior === 'per-prompt' ? [123, 124, 125, 126] : [123, 124, 123, 124]
        const contexts = []
        for (const [index, id] of result.jobIds.entries()) {
          const loaded = await f.queue.loadVerifiedRegionalInput(id)
          contexts.push(loaded.payload.context)
          assertDpm(loaded.input, key)
          assertItemResources(f, loaded.input, index < 2 ? 'A' : 'B')
          assert.equal(loaded.input.recipe.item.promptPairIndex, Math.floor(index / 2))
          assert.equal(loaded.input.recipe.item.iteration, index % 2)
          assert.equal(loaded.input.request.job.sampling.seed, expectedSeeds[index])
          assert.equal(loaded.payload.context.sampling.seedBehavior, seedBehavior)
          assert.deepEqual(loaded.payload.context.loras, [f.loras[0]])
          assert.deepEqual(loaded.payload.context.loraStack, authored.generationDraft.loras)
          assert.deepEqual(loaded.payload.context.vae, f.vaes[0])
          assert.equal(loaded.payload.context.vaePrecision, 'FP32')
          assert.equal(loaded.input.request.job.loras?.[0].weight, 0.7)
          assert.equal(loaded.input.request.job.vae?.path, f.vaes[0].managedPath)
        }
        assert.equal(
          new Set(contexts.map((context) => context.model.reference.localVersionId)).size,
          1,
        )
        assert.equal(new Set((await rows(f)).map((row) => row.batch_id)).size, 1)
        assert.equal(f.calls.compose.length, 1)
        assert.equal(f.counters.preparation, 1)
        assert.deepEqual(f.document(), authored)
      })
    })
  }

  test(`public regional DPM ${scheduler} coordinator refuses missing capability independently`, async () => {
    await withFixture(async (f) => {
      await select(f, { scheduler })
      disableDpm(f)
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
      await assertBeforeWork(f, before)
    })
  })

  test(`public regional DPM ${scheduler} missing frozen capability cannot follow edited Euler`, async () => {
    await withFixture(async (f) => {
      await select(f, { scheduler })
      f.controls.failTexts.add('DPM plain subject')
      const result = await queued(f, 1)
      assert.equal((await settled(f, result.jobIds))[0].status, 'failed')
      const source = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      await saveOtherSettings(f)
      disableDpm(f)
      const before = await snapshot(f)
      await assert.rejects(
        f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence }),
        { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
      )
      assert.deepEqual(await snapshot(f), before)
      assert.equal(f.consumed.length, 1)
    })
  })
}

for (const fault of ['missing-init', 'old-peer'] as const) {
  test(`public regional DPM ${fault} refuses before composition and preserves old work`, async () => {
    await withFixture(async (f) => {
      await select(f)
      if (fault === 'missing-init') {
        f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
          (cap) => cap !== INIT_CAPABILITY,
        )
      } else {
        f.controls.ready.workerVersion = '0.13.0'
      }
      const before = await snapshot(f)
      await assert.rejects(f.actions.generate(f.tabId, options(f)), {
        code: 'GENERATION_RUNTIME_UNAVAILABLE',
      })
      await assertBeforeWork(f, before, 1)
    })
  })
}

test('public regional DPM frozen Retry retains original scheduler', async () => {
  await withFixture(async (f) => {
    await select(f, { extras: true, resources: true, seedBehavior: 'per-prompt' })
    f.controls.failTexts.add('second <b>')
    const result = await queued(f, 2)
    assert.deepEqual(
      (await settled(f, result.jobIds)).map((job) => job.status),
      ['completed', 'failed'],
    )
    const source = await f.queue.loadVerifiedRegionalInput(result.jobIds[1])
    const authored = await saveOtherSettings(f)
    const saved = await readFile(f.packagePath)
    f.controls.failTexts.clear()
    await f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence })
    const retry = (await rows(f)).find((row) => !result.jobIds.includes(row.id))
    assert.ok(retry)
    assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
    const loaded = await f.queue.loadVerifiedRegionalInput(retry.id)
    assertDpm(loaded.input, 'dpmpp_2m_k')
    assertDpm(f.consumed[2], 'dpmpp_2m_k')
    assert.deepEqual(loaded.payload, source.payload)
    assert.deepEqual(f.consumed[2].recipe, source.input.recipe)
    assertItemResources(f, loaded.input, 'B')
    assert.deepEqual(loaded.payload.context.loras, [f.loras[0]])
    assert.deepEqual(loaded.payload.context.vae, f.vaes[0])
    assert.equal(f.calls.compose.length, 1)
    assert.deepEqual(f.document(), authored)
    assert.ok((await readFile(f.packagePath)).equals(saved))
  })
})

test('public regional Euler frozen Retry control green', async () => {
  await withFixture(async (f) => {
    await select(f, { sampler: 'Euler', scheduler: 'Normal' })
    f.controls.failTexts.add('DPM plain subject')
    const result = await queued(f, 1)
    assert.equal((await settled(f, result.jobIds))[0].status, 'failed')
    const source = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    const authored = await saveOtherSettings(f, 'DPM++ 2M')
    disableDpm(f)
    f.controls.failTexts.clear()
    await f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence })
    const retry = (await rows(f)).find((row) => !result.jobIds.includes(row.id))
    assert.ok(retry)
    assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
    assert.equal(f.consumed[1].request.job.sampling.scheduler, 'euler')
    assert.equal(Object.hasOwn(f.consumed[1], 'initializationProfile'), false)
    assert.deepEqual((await f.queue.loadVerifiedRegionalInput(retry.id)).payload, source.payload)
    assert.deepEqual(f.document(), authored)
  })
})

test('public regional Euler a retains separate initialization and Retry without the DPM capability', async () => {
  await withFixture(async (f) => {
    await select(f, { sampler: 'Euler a', scheduler: 'Normal' })
    disableDpm(f)
    f.controls.failTexts.add('DPM plain subject')
    const result = await queued(f, 1)
    assert.equal((await settled(f, result.jobIds))[0].status, 'failed')
    const source = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    await saveOtherSettings(f)
    f.controls.failTexts.clear()
    await f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence })
    const retry = (await rows(f)).find((row) => !result.jobIds.includes(row.id))
    assert.ok(retry)
    assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
    assert.equal(f.consumed[1].request.job.sampling.scheduler, 'euler_a')
    assert.equal(f.consumed[1].initializationProfile, INITIALIZATION)
    assert.deepEqual((await f.queue.loadVerifiedRegionalInput(retry.id)).payload, source.payload)
  })
})

test('public regional DPM bootstrap keeps original policy without automatic dispatch', async () => {
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
        assertDpm(loaded.input, 'dpmpp_2m_k')
        assertItemResources(f, loaded.input, index < 2 ? 'A' : 'B')
      }
      await saveOtherSettings(f)
      const original = await recovered.getManagerEntry(admitted[3].id)
      const retry = await recovered.retryInvokeCanvasRegionalTerminal(
        original.id,
        original.statusSequence,
      )
      assert.deepEqual(
        (await recovered.loadVerifiedRegionalInput(retry.id)).payload,
        originals[3].payload,
      )
      assert.equal(f.consumed.length, 0)
    } finally {
      await connection.close()
    }
  })
})

test('public regional DPM provenance keeps concrete prompts exact resources and sampler pair', async () => {
  await withFixture(async (f) => {
    const authored = await select(f, { extras: true, resources: true })
    const result = await queued(f, 2)
    await settled(f, result.jobIds)
    const candidates = await f.staging.listVerifiedCandidates(f.tabId)
    for (const [index, id] of result.jobIds.entries()) {
      const candidate = candidates.find((value) => value.queueItemId === id)
      assert.ok(candidate)
      const base = parseAcceptedGenerationBaseV1(candidate.frozenPayloadJson)
      if (base.kind !== 'illustrious-txt2img') {
        assert.fail('Expected ordinary portable base.')
      }
      assert.equal(base.context.sampling.invokeScheduler, 'dpmpp_2m_k')
      const provenance = provenanceFromVerifiedRasterCandidate({
        acceptedAt: candidate.completedAt,
        candidate,
        imagePngBytes: Buffer.from(f.outputBytes),
      })
      assert.equal(provenance.kind, 'illustrious-txt2img')
      assert.equal(provenance.generationConfiguration.sampling.sampler, 'DPM++ 2M')
      assert.equal(provenance.generationConfiguration.sampling.scheduler, 'Karras')
      assert.equal(
        provenance.generationConfiguration.positivePrompt.text,
        index === 0 ? 'first <a>' : 'second <b>',
      )
      assert.deepEqual(provenance.generationConfiguration.positivePrompt.embeddingRefs, [
        f.resources[index === 0 ? 'A' : 'B'].ref,
      ])
      assert.deepEqual(provenance.generationConfiguration.loras, authored.generationDraft.loras)
      assert.deepEqual(provenance.generationConfiguration.vae, authored.generationDraft.vae)
      for (const excluded of [
        'regionalGuidance',
        'compositionProfile',
        'initializationProfile',
        'dynamicPrompt',
        'managedPath',
      ]) {
        assert.equal(JSON.stringify(provenance).includes(`"${excluded}"`), false)
      }
    }
  })
})

test('public regional DPM later selected resource failure publishes no partial batch', async () => {
  await withFixture(async (f) => {
    await select(f, { resources: true })
    await rm(f.resources.B.descriptor.managedPath)
    const before = await snapshot(f)
    await assert.rejects(f.actions.generate(f.tabId, options(f)), { code: 'MODEL_FILE_MISSING' })
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.consumed.length, 0)
  })
})

for (const predictionType of ['v_prediction', 'sample'] as const) {
  test(
    predictionType === 'v_prediction'
      ? 'public regional DPM V legacy peer refuses after actual resolution without publication'
      : `public regional DPM keeps unsupported ${predictionType} refusal before work`,
    async () => {
      await withFixture(
        async (f) => {
          await select(f)
          await f.edit((document) => {
            document.generationDraft.model!.predictionType = predictionType
          })
          const before = await snapshot(f)
          await assert.rejects(f.actions.generate(f.tabId, options(f)), {
            code:
              predictionType === 'v_prediction'
                ? 'INFERENCE_UNAVAILABLE'
                : 'GENERATION_INVALID_REQUEST',
          })
          if (predictionType === 'v_prediction') {
            assert.deepEqual(await snapshot(f), before)
            assert.equal(f.calls.compose.length, 1)
            assert.equal(f.calls.checkpoint, 1)
            assert.equal(f.calls.embedding, 0)
            assert.equal(f.consumed.length, 0)
            assert.deepEqual(await readdir(f.scratch), [])
          } else {
            await assertBeforeWork(f, before)
          }
        },
        predictionType === 'v_prediction' ? 'v_prediction' : 'epsilon',
      )
    },
  )
}

test('public regional DPM support cannot enable the separate SDE method', async () => {
  await withFixture(async (f) => {
    await select(f)
    await f.edit((document) => {
      document.generationDraft.sampling.sampler = 'DPM++ SDE'
    })
    const before = await snapshot(f)
    await assert.rejects(f.actions.generate(f.tabId, options(f)), {
      code: 'GENERATION_INVALID_REQUEST',
    })
    await assertBeforeWork(f, before)
  })
})

for (const mutation of ['missing-init', 'private', 'private-no-init', 'Euler-with-init'] as const) {
  test(`public regional DPM input rejects ${mutation} before filesystem preparation`, async () => {
    const f = await lowDpm()
    try {
      const input = structuredClone(f.input)
      if (mutation === 'missing-init' || mutation === 'private-no-init') {
        delete input.initializationProfile
      }
      if (mutation === 'private' || mutation === 'private-no-init') {
        delete input.compositionProfile
      }
      if (mutation === 'Euler-with-init') {
        input.request.job.sampling.scheduler = 'euler'
      }
      const before = await readdir(f.dataRoot)
      assert.throws(() => captureRegionalWorkerInput(input), { code: 'INVALID_REQUEST' })
      assert.deepEqual(await readdir(f.dataRoot), before)
      assert.deepEqual(await f.db.selectFrom('generation_queue_item').selectAll().execute(), [])
    } finally {
      await f.close()
    }
  })
}

for (const key of ['dpmpp_2m', 'dpmpp_2m_k'] as const) {
  test(`public regional DPM ${key} frozen parser reload requires exact public initialization`, async () => {
    const f = await lowDpm(key)
    try {
      const queuedItem = await f.queue.enqueueInvokeCanvasRegional({
        prepared: f.prepared,
        projectPath: f.projectPath,
        regional: f.input,
        request: f.request,
        stagingSessionId: randomUUID(),
      })
      const loaded = await f.queue.loadVerifiedRegionalInput(queuedItem.id)
      const stored = await f.db
        .selectFrom('generation_queue_item')
        .select('frozen_payload_json')
        .where('id', '=', queuedItem.id)
        .executeTakeFirstOrThrow()
      assertDpm(loaded.input, key)
      assert.deepEqual(
        parseFrozenQueuedRegionalInvokeV1(stored.frozen_payload_json),
        loaded.payload,
      )
      const missing = JSON.parse(stored.frozen_payload_json) as Record<string, unknown>
      delete missing.initializationProfile
      assert.throws(() => parseFrozenQueuedRegionalInvokeV1(JSON.stringify(missing)))
      const privatePayload: Record<string, unknown> = {
        ...JSON.parse(stored.frozen_payload_json),
        kind: 'illustrious-regional',
      }
      delete privatePayload.compositionProfile
      assert.throws(() => parseFrozenQueuedRegionalV1(JSON.stringify(privatePayload)))
      assert.deepEqual(
        (await f.queue.loadVerifiedRegionalInput(queuedItem.id)).payload,
        loaded.payload,
      )
    } finally {
      await f.close()
    }
  })
}

interface Observation {
  bundleHasCommandEmbeddings: boolean
  bundleHasInitialization: boolean
  initializationProfile?: unknown
  recipeGlobalPositiveSha256?: string
  requestId: string
  scheduler: string
  stagingRoot: string
  wireKeys: string[]
}

async function withClient(
  capabilities: string[],
  key: DpmKey,
  run: (value: {
    client: GenerationWorkerClient
    fixture: RegionalQueueFixture
    input: RegionalWorkerInput
    observations: () => Promise<Observation[]>
    received: string
    scratch: string
  }) => Promise<void>,
): Promise<void> {
  const fixture = await createRegionalQueueFixture()
  let client: GenerationWorkerClient | undefined
  try {
    const runtime = path.join(fixture.root, 'runtime')
    const scratch = path.join(fixture.root, 'client-scratch')
    const received = path.join(fixture.root, 'client-received.jsonl')
    await mkdir(runtime)
    await mkdir(scratch, { mode: 0o700 })
    const executable = path.join(runtime, 'python')
    const ready = {
      ...REGIONAL_QUEUE_READY,
      capabilities: [
        ...capabilities,
        ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : []),
      ],
      pythonVersion: '3.12.13',
      type: 'ready',
    }
    // A real OS/JSONL peer with declared fake native computation; it is no ML qualification.
    const script = String.raw`#!${process.execPath}
const fs = require('node:fs'), crypto = require('node:crypto'), path = require('node:path');
const args = process.argv.slice(2);
const validArgs = process.platform === 'linux'
  ? args.length === 7 && JSON.stringify(args.slice(0, 6)) === JSON.stringify(['-I', '-m', 'imagegen_worker.owned_inference', '--parent-pid', String(process.ppid), '--scratch-base']) && path.isAbsolute(args[6])
  : args.join(' ') === '-I -m imagegen_worker.inference_main';
if (!validArgs) process.exit(21);
const received = ${JSON.stringify(received)};
const output = Buffer.from(${JSON.stringify(fixture.outputBytes.toString('base64'))}, 'base64');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
process.stdout.write(JSON.stringify(${JSON.stringify(ready)}) + '\n');
require('node:readline').createInterface({input: process.stdin}).on('line', line => {
  const wire = JSON.parse(line);
  if (wire.type !== 'execute-current-canvas-regional') throw Error('Wrong dispatch owner');
  const bytes = fs.readFileSync(wire.bundle.path);
  if (bytes.length !== wire.bundle.byteSize || sha(bytes) !== wire.bundle.sha256) throw Error('Bundle snapshot differs');
  const bundle = JSON.parse(bytes);
  const target = fs.readFileSync(bundle.request.job.target.path);
  if (sha(target) !== bundle.request.job.target.sha256) throw Error('Target snapshot differs');
  fs.appendFileSync(received, JSON.stringify({
    bundleHasCommandEmbeddings: Object.hasOwn(bundle.request.job, 'embeddings'),
    bundleHasInitialization: Object.hasOwn(bundle, 'initializationProfile'),
    initializationProfile: bundle.initializationProfile,
    requestId: wire.requestId,
    recipeGlobalPositiveSha256: bundle.recipe.globalEmbeddings.positive[0]?.reference.fileSha256,
    scheduler: bundle.request.job.sampling.scheduler,
    stagingRoot: wire.stagingRoot,
    wireKeys: Object.keys(wire).sort(),
  }) + '\n');
  fs.writeFileSync(bundle.request.job.output.pngPath, output, {flag: 'wx'});
  process.stdout.write(JSON.stringify({
    type: 'generation-done', protocolVersion: '1', requestId: wire.requestId,
    outputPath: bundle.request.job.output.pngPath, seed: bundle.request.job.sampling.seed,
  }) + '\n');
});
`
    await writeFile(executable, script)
    await chmod(executable, 0o700)
    client = await GenerationWorkerClient.start(
      { pythonExecutable: executable, runtimeRoot: runtime, scratchBasePath: scratch },
      { requestTimeoutMs: 3000, shutdownWaitMs: 100 },
    )
    const input: RegionalWorkerInput = {
      ...fixture.regional,
      compositionProfile: 'invoke-canvas-v1',
      initializationProfile: INITIALIZATION,
      request: fixture.request,
    }
    input.request.job.sampling.scheduler = key
    await run({
      client,
      fixture,
      input,
      observations: async () =>
        (await readFile(received, 'utf8').catch(() => ''))
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Observation),
      received,
      scratch,
    })
  } finally {
    // Confirmation of the real child's physical exit precedes fixture-directory disposal.
    await client?.close()
    await fixture.close()
  }
}

for (const key of ['dpmpp_2m', 'dpmpp_2m_k'] as const) {
  test(`public regional DPM ${key} reaches the original JSONL child with frozen initialization`, async () => {
    await withClient(
      [
        ...REGIONAL_QUEUE_READY.capabilities,
        'illustrious-regional-invoke-v1',
        INIT_CAPABILITY,
        DPM_CAPABILITY,
      ],
      key,
      async ({ client, fixture, input, observations, scratch }) => {
        const result = await client.executeCurrentCanvasRegional(input)
        assert.ok(result.pngBytes.equals(fixture.outputBytes))
        const actual = await observations()
        assert.equal(actual.length, 1)
        assert.equal(actual[0].scheduler, key)
        assert.equal(actual[0].bundleHasInitialization, true)
        assert.equal(actual[0].initializationProfile, INITIALIZATION)
        assert.deepEqual(await readdir(scratch), [])
      },
    )
  })
}

test('public regional DPM dispatch refuses old capability before files then permits Euler', async () => {
  await withClient(
    [...REGIONAL_QUEUE_READY.capabilities, 'illustrious-regional-invoke-v1', INIT_CAPABILITY],
    'dpmpp_2m_k',
    async ({ client, fixture, input, observations, scratch }) => {
      await assert.rejects(client.executeCurrentCanvasRegional(input), {
        code: 'WORKER_VERSION_MISMATCH',
      })
      assert.deepEqual(await readdir(scratch), [])
      assert.deepEqual(await observations(), [])
      input.request.job.sampling.scheduler = 'euler'
      delete input.initializationProfile
      assert.ok(
        (await client.executeCurrentCanvasRegional(input)).pngBytes.equals(fixture.outputBytes),
      )
      const actual = await observations()
      assert.equal(actual.length, 1)
      assert.equal(actual[0].scheduler, 'euler')
      assert.equal(actual[0].bundleHasInitialization, false)
    },
  )
})
