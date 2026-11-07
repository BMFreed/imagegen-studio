import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type { GenerationProgressSnapshot } from '../../shared/projects/generation-progress.js'
import {
  supportsInferenceRegionalImg2Img,
  supportsInferenceRegionalImg2ImgCFGRescale,
  supportsInferenceRegionalImg2ImgDpmpp2m,
  supportsInferenceRegionalImg2ImgEulerAncestral,
} from '../../shared/projects/inference-worker-capabilities.js'
import { isProjectGenerationActionState } from '../../shared/projects/project-generation-actions.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

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
import { parseAcceptedGenerationBaseV1 } from './regional-queued-generation.js'
import {
  captureRegionalWorkerInput,
  prepareRegionalWorkerRequest,
} from './regional-worker-request.js'
import { classifyTargetPngAlpha } from './target-png-mode.js'
import {
  createRegionalProjectFixture,
  regionalProjectDigest,
} from './test-fixtures/regional-project.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'

const CAPABILITY = 'illustrious-regional-img2img-v1'
const RESCALE_CAPABILITY = 'illustrious-regional-img2img-cfg-rescale-v1'
const ANCESTRAL_CAPABILITY = 'illustrious-regional-img2img-euler-a-v1'
const DPM_IMG_CAPABILITY = 'illustrious-regional-img2img-dpmpp-2m-v1'
const OPERATION = 'illustrious-regional-img2img'
type Mode = 'img2img' | 'outpaint' | 'txt2img'
type Fixture = Awaited<ReturnType<typeof imageFixture>>

/**
 * InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd: compileCanvasGraph.ts grafts image_to_latents
 * and regional guidance into the same denoiser; strength selects the training-timestep window.
 * session_queue_default.py retries a freshly cloned frozen graph.
 *
 * These tests use real Service/save/reopen/capture, Main preparation, queue/files/SQLite, dispatch,
 * receipt and accepted-base provenance. The catalog, CPU compositor and inference result are
 * explicit controlled substitutes. No native model, pixel causality, installed worker, visual
 * acceptance or .igs acceptance transaction is claimed by this file.
 */
async function imageFixture() {
  const f = await createRegionalProjectFixture()
  const controls = {
    claimedMode: null as Mode | null,
    fail: false,
    marker: 0,
    mode: 'img2img' as Mode,
    progress: false,
    ready: {
      ...f.input().ready,
      capabilities: [
        ...f.input().ready.capabilities,
        'illustrious-regional-invoke-v1',
        'illustrious-regional-invoke-init-v1',
        'illustrious-regional-dpmpp-2m-v1',
        'illustrious-regional-cfg-rescale-v1',
        'illustrious-regional-lora-v1',
        'illustrious-regional-vae-v1',
        'illustrious-regional-progress-v1',
        CAPABILITY,
        RESCALE_CAPABILITY,
        ANCESTRAL_CAPABILITY,
        DPM_IMG_CAPABILITY,
      ],
    },
  }
  const sourceBytes = () => {
    const alpha = controls.mode === 'img2img' ? 255 : controls.mode === 'txt2img' ? 0 : 127
    return literalSmartPatchColorPng(
      64,
      64,
      Array.from({ length: 4096 }, (_, index) => [
        (index * 13 + controls.marker * 37) % 256,
        (index * 3 + controls.marker * 79) % 256,
        (index * 7 + controls.marker * 11) % 256,
        alpha,
      ]).flat(),
      4,
    )
  }
  // A controlled CPU-compositor substitute, not a claim that the empty Raster
  // stack below naturally composes opaque. Main still verifies actual PNG bytes.
  f.compositionWorker.composeTarget = async (input) => {
    f.calls.compose.push(structuredClone(input))
    await f.hooks.compose?.()
    assert.deepEqual(input.bbox, f.bbox)
    assert.equal(input.layers.length, 0)
    const bytes = sourceBytes()
    await writeFile(input.targetPngPath, bytes, { flag: 'wx', mode: 0o600 })
    return {
      composite: {
        byteSize: bytes.length,
        colorSpace: 'srgb',
        height: 64,
        iccSha256: IGS_SRGB_ICC_SHA256,
        path: input.targetPngPath,
        sha256: regionalProjectDigest(bytes),
        width: 64,
      },
      mode: controls.claimedMode ?? controls.mode,
      rect: { ...f.bbox },
    }
  }
  const consumed: RegionalWorkerInput[] = []
  const consumedTargets: Buffer[] = []
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
          executeCurrentCanvasRegional: async (input, onProgress) => {
            consumed.push(structuredClone(input))
            const bytes = await readFile(input.request.job.target.path)
            consumedTargets.push(bytes)
            assert.equal(regionalProjectDigest(bytes), input.request.job.target.sha256)
            assert.equal(
              classifyTargetPngAlpha(
                bytes,
                input.request.job.target.width,
                input.request.job.target.height,
              ),
              input.request.type === 'generate-illustrious-img2img' ? 'img2img' : 'txt2img',
            )
            if (controls.fail) {
              throw new Error('Controlled opaque regional inference failure')
            }
            if (controls.progress && input.request.type === 'generate-illustrious-img2img') {
              const steps = input.request.job.sampling.steps
              const cutoff = roundStrength(input.request.job.sampling.denoisingStrength)
              const selected = Array.from(
                { length: steps },
                (_, index) => 1 + (steps - 1 - index) * Math.floor(1000 / steps),
              ).filter((timestep) => timestep < cutoff)
              for (let index = 0; index < selected.length; index++) {
                onProgress?.({ step: index + 1, totalSteps: selected.length })
              }
            }
            return f.resultFor(input)
          },
          ready: structuredClone(controls.ready),
        }),
        generate: async () => assert.fail('Regional images must not enter ordinary dispatch.'),
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
  return {
    ...f,
    actions,
    consumed,
    consumedTargets,
    controls,
    counters,
    publicCoordinator,
    sourceBytes,
  }
}

const roundStrength = (strength: number) => Math.round(1000 * strength)

async function withFixture(use: (f: Fixture) => Promise<void>) {
  const f = await imageFixture()
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
  strength: number | null = 0.5,
  change?: (document: IgsProjectDocumentV1) => void,
) {
  await f.edit((document) => {
    document.generationDraft.sampling.denoisingStrength = strength
    document.generationDraft.sampling.steps = 3
    document.generationDraft.sampling.sampler = 'Euler'
    document.generationDraft.sampling.scheduler = 'Normal'
    document.generationDraft.vae = null
    document.generationDraft.vaePrecision = 'FP16'
    document.generationDraft.cfgRescale = 0
    change?.(document)
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
  const result = await f.actions.generate(f.tabId, {
    documentId: f.document().documentId,
    iterations: 1,
  })
  if (result.kind !== 'queued') {
    assert.fail('Expected one opaque regional job.')
  }
  assert.equal(result.jobIds.length, 1)
  return result.jobIds[0]
}

async function settled(f: Fixture, id: string) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const state = await f.actions.getState(f.tabId)
    const row = (await rows(f)).find((item) => item.id === id)
    assert.ok(row)
    if (state.phase === 'idle' && ['canceled', 'completed', 'failed'].includes(row.status)) {
      return row
    }
    assert.notEqual(state.phase, 'blocked', state.error?.message ?? 'Image admission blocked.')
    await setImmediate()
  }
  assert.fail('The opaque regional attempt did not settle.')
}

function disableImg(f: Fixture) {
  f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
    (value) => value !== CAPABILITY,
  )
}

function supportedRefusal(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    [
      'GENERATION_INVALID_REQUEST',
      'GENERATION_PARAMETER_UNSUPPORTED',
      'GENERATION_RUNTIME_UNAVAILABLE',
      'GENERATION_SAMPLING_REQUIRED',
      'GENERATION_SAMPLING_UNSUPPORTED',
      'GENERATION_TARGET_UNSUPPORTED',
      'INFERENCE_UNAVAILABLE',
      'UNSUPPORTED',
    ].includes(String(error.code))
  )
}

function imgRequest(input: RegionalWorkerInput) {
  if (input.request.type !== 'generate-illustrious-img2img') {
    assert.fail('Expected the exact ordinary image request in regional transport.')
  }
  return input.request
}

for (const strength of [0, 0.5, 1]) {
  test(`public opaque regional strength ${strength} preserves Main pixels and accepted image base`, async () => {
    await withFixture(async (f) => {
      const authored = await select(f, strength)
      const saved = await readFile(f.packagePath)
      const target = f.sourceBytes()
      const id = await queueOne(f)
      assert.equal((await settled(f, id)).status, 'completed')
      const frozen = await f.queue.loadVerifiedRegionalInput(id)
      assert.equal(frozen.payload.kind, OPERATION)
      if (frozen.payload.kind !== OPERATION) {
        assert.fail('Expected the image-specific frozen operation.')
      }
      assert.equal(frozen.payload.context.kind, 'normal-img2img-preparation')
      assert.equal(imgRequest(frozen.input).job.sampling.denoisingStrength, strength)
      assert.equal(imgRequest(f.consumed[0]).job.sampling.denoisingStrength, strength)
      assert.equal(frozen.payload.context.sampling.denoisingStrength, strength)
      assert.equal(frozen.payload.initializationProfile, undefined)
      assert.ok((await readFile(frozen.targetPath)).equals(target), 'Frozen source bytes changed')
      assert.ok(f.consumedTargets[0].equals(target), 'Dispatch consumed other source pixels')
      assert.deepEqual(f.consumed[0].recipe, frozen.input.recipe)
      const entry = await f.queue.getManagerEntry(id)
      assert.equal(entry.operation, OPERATION)
      assert.equal(entry.details?.sampling.denoisingStrength, strength)
      const candidate = (await f.staging.listVerifiedCandidates(f.tabId)).find(
        (item) => item.queueItemId === id,
      )
      assert.ok(candidate)
      const base = parseAcceptedGenerationBaseV1(candidate.frozenPayloadJson)
      assert.equal(base.kind, 'illustrious-img2img')
      if (base.kind !== 'illustrious-img2img') {
        assert.fail('Expected the ordinary accepted image base.')
      }
      assert.equal(base.context.kind, 'normal-img2img-preparation')
      assert.equal(base.context.sampling.denoisingStrength, strength)
      const provenance = provenanceFromVerifiedRasterCandidate({
        acceptedAt: candidate.completedAt,
        candidate,
        imagePngBytes: Buffer.from(f.outputBytes),
      })
      assert.equal(provenance.kind, 'illustrious-img2img')
      assert.equal(provenance.generationConfiguration.mode, 'img2img')
      assert.equal(provenance.generationConfiguration.sampling.denoisingStrength, strength)
      for (const key of ['regionalGuidance', 'compositionProfile', 'initializationProfile']) {
        assert.equal(JSON.stringify(provenance).includes(`"${key}"`), false)
      }
      assert.deepEqual(f.document(), authored)
      assert.ok((await readFile(f.packagePath)).equals(saved))
      assert.equal(f.calls.compose.length, 1)
      assert.equal(f.counters.preparation, 1)
    })
  })
}

test('regional image capability is independent and transient responses stay strict', async () => {
  await withFixture(async (f) => {
    assert.equal(supportsInferenceRegionalImg2Img(f.controls.ready), true)
    for (const capability of [
      CAPABILITY,
      'illustrious-regional-invoke-v1',
      'illustrious-img2img',
    ]) {
      assert.equal(
        supportsInferenceRegionalImg2Img({
          ...f.controls.ready,
          capabilities: f.controls.ready.capabilities.filter((value) => value !== capability),
        }),
        false,
      )
    }
    assert.equal(
      supportsInferenceRegionalImg2Img({ ...f.controls.ready, workerVersion: '0.13.0' }),
      false,
    )
    const state = await f.actions.getState(f.tabId)
    assert.equal(state.regionalImg2ImgSupported, true)
    for (const value of [undefined, false, true]) {
      assert.equal(
        isProjectGenerationActionState({ ...state, regionalImg2ImgSupported: value }),
        true,
      )
    }
    for (const value of [null, 0, 'true', {}]) {
      assert.equal(
        isProjectGenerationActionState({ ...state, regionalImg2ImgSupported: value }),
        false,
      )
    }
    disableImg(f)
    const old = await f.actions.getState(f.tabId)
    assert.equal(old.img2imgSupported, true)
    assert.equal(old.regionalImg2ImgSupported, false)
  })
})

for (const missing of [CAPABILITY, 'illustrious-regional-invoke-v1', 'illustrious-img2img']) {
  test(`opaque regional Generate refuses missing ${missing} before model and queue publication`, async () => {
    await withFixture(async (f) => {
      await select(f)
      f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
        (value) => value !== missing,
      )
      const before = await snapshot(f)
      await assert.rejects(
        f.actions.generate(f.tabId, { documentId: f.document().documentId, iterations: 1 }),
        supportedRefusal,
      )
      assert.deepEqual(await snapshot(f), before)
      assert.equal(f.calls.checkpoint, 0)
      assert.equal(f.consumed.length, 0)
      assert.deepEqual(await readdir(f.scratch), [])
    })
  })
}

test('test_regional_img_capability_mutation_red', async () => {
  await withFixture(async (f) => {
    await select(f)
    disableImg(f)
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
    assert.equal(f.calls.compose.length, 1, 'Actual alpha must classify the image before mode gate')
    assert.equal(f.calls.checkpoint, 0)
    assert.equal(f.consumed.length, 0)
    assert.deepEqual(await readdir(f.scratch), [])
  })
})

test('test_regional_txt_capability_control_green', async () => {
  await withFixture(async (f) => {
    f.controls.mode = 'txt2img'
    const authored = await select(f, 0.75)
    disableImg(f)
    const id = await queueOne(f)
    assert.equal((await settled(f, id)).status, 'completed')
    const frozen = await f.queue.loadVerifiedRegionalInput(id)
    assert.equal(frozen.payload.kind, 'illustrious-regional-txt2img')
    assert.equal(frozen.payload.context.kind, 'normal-txt2img-preparation')
    assert.equal(frozen.input.request.type, 'generate-illustrious-txt2img')
    assert.equal('denoisingStrength' in frozen.input.request.job.sampling, false)
    assert.equal('denoisingStrength' in frozen.payload.context.sampling, false)
    assert.deepEqual(f.document(), authored)
  })
})

test('opaque regional frozen Retry preserves source strength recipe and seed after saved edits', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5)
    const originalTarget = f.sourceBytes()
    f.controls.fail = true
    const id = await queueOne(f)
    const first = await settled(f, id)
    assert.equal(first.status, 'failed')
    const source = await f.queue.loadVerifiedRegionalInput(id)
    f.controls.marker = 1
    const authored = await select(f, 0.9, (document) => {
      document.generationDraft.positivePrompt.text = 'later image prompt'
      document.generationDraft.seed = { policy: 'fixed', value: 999 }
      document.regionalGuidance![0].prompts!.positive!.text = 'later regional prompt'
      document.regionalGuidance![0].mask.revision++
    })
    const saved = await readFile(f.packagePath)
    f.controls.fail = false
    await f.actions.retryJob({ id, statusSequence: first.status_sequence })
    const retry = (await rows(f)).find((row) => row.id !== id)
    assert.ok(retry)
    assert.equal((await settled(f, retry.id)).status, 'completed')
    const loaded = await f.queue.loadVerifiedRegionalInput(retry.id)
    assert.deepEqual(loaded.payload, source.payload)
    assert.deepEqual(f.consumed[1].recipe, source.input.recipe)
    assert.equal(imgRequest(f.consumed[1]).job.sampling.denoisingStrength, 0.5)
    assert.equal(f.consumed[1].request.job.sampling.seed, 123)
    assert.ok(f.consumedTargets[0].equals(originalTarget))
    assert.ok(f.consumedTargets[1].equals(originalTarget))
    assert.equal(f.calls.compose.length, 1, 'Retry must not compose the changed draft')
    assert.deepEqual(f.document(), authored)
    assert.ok((await readFile(f.packagePath)).equals(saved))
  })
})

for (const strength of [0, 0.5]) {
  test(`opaque frozen Retry ${strength} refuses an old peer despite a transparent current draft`, async () => {
    await withFixture(async (f) => {
      await select(f, strength)
      f.controls.fail = true
      const id = await queueOne(f)
      const first = await settled(f, id)
      f.controls.mode = 'txt2img'
      await select(f, null)
      disableImg(f)
      const before = await snapshot(f)
      await assert.rejects(f.actions.retryJob({ id, statusSequence: first.status_sequence }), {
        code: 'GENERATION_RUNTIME_UNAVAILABLE',
      })
      assert.deepEqual(await snapshot(f), before)
      assert.equal(f.consumed.length, 1)
      assert.equal(f.calls.compose.length, 1)
    })
  })
}

test('transparent frozen Retry ignores later opaque settings and absent regional image capability', async () => {
  await withFixture(async (f) => {
    f.controls.mode = 'txt2img'
    await select(f, null)
    f.controls.fail = true
    const id = await queueOne(f)
    const first = await settled(f, id)
    f.controls.mode = 'img2img'
    await select(f, 0.8)
    disableImg(f)
    f.controls.fail = false
    await f.actions.retryJob({ id, statusSequence: first.status_sequence })
    const retry = (await rows(f)).find((row) => row.id !== id)
    assert.ok(retry)
    assert.equal((await settled(f, retry.id)).status, 'completed')
    assert.equal(f.consumed[1].request.type, 'generate-illustrious-txt2img')
    assert.equal('denoisingStrength' in f.consumed[1].request.job.sampling, false)
    assert.equal(f.calls.compose.length, 1)
  })
})

test('opaque dynamic batch freezes one source with distinct concrete seeds and prompts', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.positivePrompt.text = '{red|blue} subject'
      document.generationDraft.dynamicPrompt = { maxPrompts: 2, seedBehavior: 'per-prompt' }
    })
    const source = f.sourceBytes()
    const result = await f.actions.generate(f.tabId, {
      documentId: f.document().documentId,
      iterations: 1,
    })
    if (result.kind !== 'queued') {
      assert.fail('Expected frozen two-item image batch')
    }
    assert.equal(result.jobIds.length, 2)
    for (const id of result.jobIds) {
      assert.equal((await settled(f, id)).status, 'completed')
    }
    const frozen = await Promise.all(
      result.jobIds.map(async (id) => await f.queue.loadVerifiedRegionalInput(id)),
    )
    assert.deepEqual(
      frozen.map(({ input }) => input.request.job.sampling.seed),
      [123, 124],
    )
    assert.deepEqual(
      frozen.map(({ input }) => input.request.job.prompts.positive),
      ['red subject', 'blue subject'],
    )
    assert.ok(frozen.every(({ input }) => imgRequest(input).job.sampling.denoisingStrength === 0.5))
    assert.ok(f.consumedTargets.every((bytes) => bytes.equals(source)))
    assert.equal(f.calls.compose.length, 1)
  })
})

test('opaque failed history survives SQLite reopen and preserves strict accepted base projection', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5)
    f.controls.fail = true
    const id = await queueOne(f)
    await settled(f, id)
    const prior = await f.queue.loadVerifiedRegionalInput(id)
    const database = openAppDatabase(f.root, path.resolve('src/main/db/migrations'))
    try {
      const queue = new GenerationQueueRepository(database.db, f.root)
      await queue.recoverAfterRestart()
      const restored = await queue.loadVerifiedRegionalInput(id)
      assert.deepEqual(restored.payload, prior.payload)
      assert.ok((await readFile(restored.targetPath)).equals(f.sourceBytes()))
      assert.equal(
        parseAcceptedGenerationBaseV1(JSON.stringify(restored.payload)).kind,
        'illustrious-img2img',
      )
    } finally {
      await database.close()
    }
  })
})

for (const field of ['type', 'strength', 'initialization', 'alpha'] as const) {
  test(`captured opaque regional material rejects conflicting ${field} without queue changes`, async () => {
    await withFixture(async (f) => {
      await select(f)
      f.controls.fail = true
      const id = await queueOne(f)
      await settled(f, id)
      const frozen = await f.queue.loadVerifiedRegionalInput(id)
      const input = structuredClone(frozen.input)
      if (field === 'type') {
        Reflect.set(input.request, 'type', 'generate-illustrious-txt2img')
      }
      if (field === 'strength') {
        Reflect.set(input.request.job.sampling, 'denoisingStrength', null)
      }
      if (field === 'initialization') {
        input.initializationProfile = 'invoke-cpu-f32-add-noise-v1'
      }
      if (field === 'alpha') {
        const target = f.targetBytes
        input.request.job.target.sha256 = regionalProjectDigest(target)
        input.request.job.target.byteSize = target.length
        const original = await readFile(frozen.targetPath)
        try {
          await writeFile(frozen.targetPath, target)
          const before = await rows(f)
          await assert.rejects(prepareRegionalWorkerRequest(input, f.scratch), {
            code: 'INVALID_REQUEST',
          })
          assert.deepEqual(await rows(f), before)
          assert.deepEqual(await readdir(f.scratch), [])
        } finally {
          await writeFile(frozen.targetPath, original)
        }
      } else {
        const before = await snapshot(f)
        assert.throws(() => captureRegionalWorkerInput(input), { code: 'INVALID_REQUEST' })
        assert.deepEqual(await snapshot(f), before)
      }
    })
  })
}

const UNSUPPORTED = [
  [
    'Euler a with Karras',
    (document: IgsProjectDocumentV1) => {
      document.generationDraft.sampling.sampler = 'Euler a'
      document.generationDraft.sampling.scheduler = 'Karras'
    },
  ],
  [
    'DPM++ SDE',
    (document: IgsProjectDocumentV1) => {
      document.generationDraft.sampling.sampler = 'DPM++ SDE'
    },
  ],
  [
    'Karras',
    (document: IgsProjectDocumentV1) => {
      document.generationDraft.sampling.scheduler = 'Karras'
    },
  ],
  [
    'Auto VAE',
    (document: IgsProjectDocumentV1) => {
      document.generationDraft.vaePrecision = 'Auto'
    },
  ],
  [
    'FP32 VAE',
    (document: IgsProjectDocumentV1) => {
      document.generationDraft.vaePrecision = 'FP32'
    },
  ],
  [
    'selected VAE',
    (document: IgsProjectDocumentV1) => {
      document.generationDraft.vae = {
        ...document.generationDraft.model!,
        kind: 'vae',
        predictionType: null,
      }
    },
  ],
  [
    'out-of-range CFG Rescale',
    (document: IgsProjectDocumentV1) => {
      document.generationDraft.cfgRescale = 1
    },
  ],
] as const
for (const [label, edit] of UNSUPPORTED) {
  test(`opaque regional ${label} refuses without a fallback or model load`, async () => {
    await withFixture(async (f) => {
      await select(f, 0.5, edit)
      const before = await snapshot(f)
      await assert.rejects(
        f.actions.generate(f.tabId, { documentId: f.document().documentId, iterations: 1 }),
        supportedRefusal,
      )
      assert.deepEqual(await snapshot(f), before)
      assert.equal(f.calls.checkpoint, 0)
      assert.equal(f.consumed.length, 0)
      assert.deepEqual(await readdir(f.scratch), [])
    })
  })
}

test('opaque source requires an explicit saved strength and never adopts an implicit default', async () => {
  await withFixture(async (f) => {
    await select(f, null)
    const before = await snapshot(f)
    await assert.rejects(
      f.actions.generate(f.tabId, { documentId: f.document().documentId, iterations: 1 }),
      supportedRefusal,
    )
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.consumed.length, 0)
  })
})

for (const claimedMode of [null, 'img2img'] as const) {
  test(`partial alpha with ${String(claimedMode)} compositor claim never admits opaque regional work`, async () => {
    await withFixture(async (f) => {
      f.controls.mode = 'outpaint'
      f.controls.claimedMode = claimedMode
      await select(f)
      const before = await snapshot(f)
      await assert.rejects(
        f.actions.generate(f.tabId, { documentId: f.document().documentId, iterations: 1 }),
      )
      assert.deepEqual(await snapshot(f), before)
      assert.equal(f.consumed.length, 0)
      assert.deepEqual(await readdir(f.scratch), [])
    })
  })
}

test('changed frozen source refuses Retry without replacing the original attempt', async () => {
  await withFixture(async (f) => {
    await select(f)
    f.controls.fail = true
    const id = await queueOne(f)
    const first = await settled(f, id)
    const frozen = await f.queue.loadVerifiedRegionalInput(id)
    const source = await readFile(frozen.targetPath)
    const before = await rows(f)
    f.controls.marker = 1
    try {
      await writeFile(frozen.targetPath, f.sourceBytes())
      await assert.rejects(f.actions.retryJob({ id, statusSequence: first.status_sequence }))
      assert.deepEqual(await rows(f), before)
      assert.equal(f.consumed.length, 1)
    } finally {
      await writeFile(frozen.targetPath, source)
    }
    assert.deepEqual((await f.queue.loadVerifiedRegionalInput(id)).payload, frozen.payload)
  })
})

test('opaque frozen dispatch refuses a lost image capability before inference or new receipt', async () => {
  await withFixture(async (f) => {
    await select(f)
    const admitted = await f.gate.run(
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
    )
    assert.equal(admitted.length, 1)
    disableImg(f)
    const result = await f.publicCoordinator.runNext(
      f.transport({ ready: structuredClone(f.controls.ready) }),
    )
    assert.equal(result.kind, 'failed')
    assert.equal(f.consumed.length, 0)
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [])
    assert.equal((await rows(f))[0].status, 'failed')
    assert.deepEqual(await readdir(f.scratch), [])
  })
})

test('private explicit opaque submission remains refused without inheriting public image admission', async () => {
  await withFixture(async (f) => {
    await select(f)
    const before = await snapshot(f)
    await assert.rejects(f.coordinator.submit(f.tabId, f.input()), supportedRefusal)
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.consumed.length, 0)
  })
})

test('regional image Retry advisory requires the separate optional state flag', () => {
  assert.match(generationQueueRetryReason(OPERATION, null)!, /Checking image engine/)
  for (const regionalImg2ImgSupported of [undefined, false, true]) {
    assert.equal(
      generationQueueRetryReason(
        OPERATION,
        { regionalImg2ImgSupported, regionalSupported: true },
        'Euler',
      ) === null,
      regionalImg2ImgSupported === true,
    )
  }
  assert.match(
    generationQueueRetryReason(
      OPERATION,
      { regionalImg2ImgSupported: true, regionalSupported: false },
      'Euler',
    )!,
    /does not support Regional Guidance/,
  )
  assert.equal(
    generationQueueRetryReason(
      'illustrious-regional-txt2img',
      { regionalSupported: true },
      'Euler',
    ),
    null,
  )
})

for (const strength of [0, 0.5]) {
  test(`opaque image strength ${strength} projects only its actual truncated progress`, async () => {
    await withFixture(async (f) => {
      await select(f, strength)
      f.controls.progress = true
      const seen: GenerationProgressSnapshot[] = []
      const off = f.publicCoordinator.onProgress((snapshot) => seen.push(structuredClone(snapshot)))
      try {
        const id = await queueOne(f)
        assert.equal((await settled(f, id)).status, 'completed')
        const observed = seen.flatMap((snapshot) => (snapshot.current ? [snapshot.current] : []))
        assert.deepEqual(
          observed.map(({ step, totalSteps }) => ({ step, totalSteps })),
          strength === 0
            ? []
            : [
                { step: 1, totalSteps: 2 },
                { step: 2, totalSteps: 2 },
              ],
        )
        assert.equal(f.publicCoordinator.getProgressSnapshot().current, null)
      } finally {
        off()
      }
    })
  })
}

/**
 * Invoke's Canvas graft feeds img2img into the same denoiser/RescaleCFGExt as TXT. The separate
 * combination capability qualifies our encoder-to-native path; two independent historical TXT/image
 * flags are insufficient. No numerical proof is claimed by these genuine Main/SQLite tests with
 * controlled inference.
 */
test('opaque regional rescale capability requires the exact combination and strict transient state', async () => {
  await withFixture(async (f) => {
    assert.equal(supportsInferenceRegionalImg2ImgCFGRescale(f.controls.ready), true)
    const ready = structuredClone(f.controls.ready)
    for (const missing of [
      RESCALE_CAPABILITY,
      CAPABILITY,
      'illustrious-regional-cfg-rescale-v1',
      'illustrious-regional-invoke-v1',
      'illustrious-cfg-rescale',
      'illustrious-img2img',
    ]) {
      assert.equal(
        supportsInferenceRegionalImg2ImgCFGRescale({
          ...ready,
          capabilities: ready.capabilities.filter((value) => value !== missing),
        }),
        false,
        missing,
      )
    }
    assert.equal(
      supportsInferenceRegionalImg2ImgCFGRescale({ ...ready, workerVersion: '0.13.0' }),
      false,
    )
    const state = await f.actions.getState(f.tabId)
    assert.equal(state.regionalImg2ImgCfgRescaleSupported, true)
    for (const value of [undefined, false, true]) {
      assert.equal(
        isProjectGenerationActionState({ ...state, regionalImg2ImgCfgRescaleSupported: value }),
        true,
      )
    }
    for (const value of [null, 0, 'true', {}]) {
      assert.equal(
        isProjectGenerationActionState({ ...state, regionalImg2ImgCfgRescaleSupported: value }),
        false,
      )
    }
    f.controls.ready.capabilities = ready.capabilities.filter(
      (value) => value !== RESCALE_CAPABILITY,
    )
    const old = await f.actions.getState(f.tabId)
    assert.equal(old.regionalImg2ImgSupported, true)
    assert.equal(old.regionalCfgRescaleSupported, true)
    assert.equal(old.regionalImg2ImgCfgRescaleSupported, false)
  })
})

for (const cfgRescale of [0, 0.7, 0.99]) {
  test(`opaque regional rescale ${cfgRescale} crosses saved Main queue reload receipt and base provenance`, async () => {
    await withFixture(async (f) => {
      const authored = await select(f, 0.5, (document) => {
        document.generationDraft.cfgRescale = cfgRescale
      })
      const saved = await readFile(f.packagePath)
      const source = f.sourceBytes()
      const id = await queueOne(f)
      assert.equal((await settled(f, id)).status, 'completed')
      const frozen = await f.queue.loadVerifiedRegionalInput(id)
      assert.equal(frozen.payload.kind, OPERATION)
      assert.equal(frozen.payload.context.sampling.cfgRescale, cfgRescale)
      assert.equal(frozen.payload.workerJob.sampling.cfgRescale, cfgRescale)
      assert.equal(imgRequest(frozen.input).job.sampling.cfgRescale, cfgRescale)
      assert.equal(imgRequest(f.consumed[0]).job.sampling.cfgRescale, cfgRescale)
      assert.equal(imgRequest(f.consumed[0]).job.sampling.denoisingStrength, 0.5)
      assert.ok(f.consumedTargets[0].equals(source))
      assert.deepEqual(f.consumed[0].recipe, frozen.input.recipe)
      const database = openAppDatabase(f.root, path.resolve('src/main/db/migrations'))
      try {
        const queue = new GenerationQueueRepository(database.db, f.root)
        assert.deepEqual((await queue.loadVerifiedRegionalInput(id)).payload, frozen.payload)
      } finally {
        await database.close()
      }
      const candidate = (await f.staging.listVerifiedCandidates(f.tabId)).find(
        (item) => item.queueItemId === id,
      )
      assert.ok(candidate)
      const base = parseAcceptedGenerationBaseV1(candidate.frozenPayloadJson)
      assert.equal(base.kind, 'illustrious-img2img')
      assert.equal(base.context.sampling.cfgRescale, cfgRescale)
      const provenance = provenanceFromVerifiedRasterCandidate({
        acceptedAt: candidate.completedAt,
        candidate,
        imagePngBytes: Buffer.from(f.outputBytes),
      })
      assert.equal(provenance.kind, 'illustrious-img2img')
      assert.equal(provenance.generationConfiguration.cfgRescale, cfgRescale)
      assert.equal(provenance.generationConfiguration.sampling.denoisingStrength, 0.5)
      for (const key of ['regionalGuidance', 'compositionProfile', 'initializationProfile']) {
        assert.equal(JSON.stringify(provenance).includes(`"${key}"`), false)
      }
      assert.deepEqual(f.document(), authored)
      assert.ok((await readFile(f.packagePath)).equals(saved))
    })
  })
}

test('test_regional_img_rescale_capability_mutation_red', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.cfgRescale = 0.7
    })
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (value) => value !== RESCALE_CAPABILITY,
    )
    assert.equal(supportsInferenceRegionalImg2Img(f.controls.ready), true)
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
    assert.equal(
      f.calls.compose.length,
      1,
      'Actual alpha classifies IMG before its combination gate',
    )
    assert.equal(f.calls.checkpoint, 0)
    assert.equal(f.consumed.length, 0)
    assert.deepEqual(await readdir(f.scratch), [])
  })
})

for (const [mode, cfgRescale] of [
  ['img2img', 0],
  ['txt2img', 0.7],
] as const) {
  test(`test_regional_img_rescale_old_peer_control_green ${mode} ${cfgRescale}`, async () => {
    await withFixture(async (f) => {
      f.controls.mode = mode
      const authored = await select(f, 0.5, (document) => {
        document.generationDraft.cfgRescale = cfgRescale
      })
      f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
        (value) => value !== RESCALE_CAPABILITY,
      )
      const id = await queueOne(f)
      assert.equal((await settled(f, id)).status, 'completed')
      assert.equal(f.consumed[0].request.type, `generate-illustrious-${mode}`)
      assert.equal(f.consumed[0].request.job.sampling.cfgRescale, cfgRescale)
      assert.deepEqual(f.document(), authored)
    })
  })
}

test('opaque regional rescale frozen Retry keeps original .7 source and strength after saved .2 edits', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.cfgRescale = 0.7
    })
    f.controls.fail = true
    const id = await queueOne(f)
    const first = await settled(f, id)
    assert.equal(first.status, 'failed')
    const source = await f.queue.loadVerifiedRegionalInput(id)
    f.controls.marker++
    const authored = await select(f, 0.8, (document) => {
      document.generationDraft.cfgRescale = 0.2
      document.generationDraft.positivePrompt.text = 'changed authoring'
      document.generationDraft.seed = { policy: 'fixed', value: 999 }
      document.regionalGuidance![0].enabled = false
    })
    const saved = await readFile(f.packagePath)
    f.controls.fail = false
    await f.actions.retryJob({ id, statusSequence: first.status_sequence })
    const retry = (await rows(f)).find((row) => row.id !== id)
    assert.ok(retry)
    assert.equal((await settled(f, retry.id)).status, 'completed')
    const loaded = await f.queue.loadVerifiedRegionalInput(retry.id)
    assert.deepEqual(loaded.payload, source.payload)
    assert.equal(imgRequest(f.consumed[1]).job.sampling.cfgRescale, 0.7)
    assert.equal(imgRequest(f.consumed[1]).job.sampling.denoisingStrength, 0.5)
    assert.equal(f.consumed[1].request.job.sampling.seed, 123)
    assert.deepEqual(f.consumed[1].recipe, source.input.recipe)
    assert.ok(f.consumedTargets[1].equals(f.consumedTargets[0]))
    assert.equal(f.calls.compose.length, 1)
    assert.deepEqual(f.document(), authored)
    assert.ok((await readFile(f.packagePath)).equals(saved))
  })
})

test('opaque rescale frozen Retry refuses a missing combination capability before SQL despite current zero', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.cfgRescale = 0.7
    })
    f.controls.fail = true
    const id = await queueOne(f)
    const first = await settled(f, id)
    await select(f, 0.8)
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (value) => value !== RESCALE_CAPABILITY,
    )
    const before = await snapshot(f)
    await assert.rejects(f.actions.retryJob({ id, statusSequence: first.status_sequence }), {
      code: 'GENERATION_RUNTIME_UNAVAILABLE',
    })
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.consumed.length, 1)
    assert.equal(f.calls.compose.length, 1)
  })
})

test('opaque neutral frozen Retry ignores later nonzero draft and absent combination capability', async () => {
  await withFixture(async (f) => {
    await select(f)
    f.controls.fail = true
    const id = await queueOne(f)
    const first = await settled(f, id)
    const authored = await select(f, 0.8, (document) => {
      document.generationDraft.cfgRescale = 0.7
    })
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (value) => value !== RESCALE_CAPABILITY,
    )
    f.controls.fail = false
    await f.actions.retryJob({ id, statusSequence: first.status_sequence })
    const retry = (await rows(f)).find((row) => row.id !== id)
    assert.ok(retry)
    assert.equal((await settled(f, retry.id)).status, 'completed')
    assert.equal(imgRequest(f.consumed[1]).job.sampling.cfgRescale, 0)
    assert.deepEqual(f.document(), authored)
  })
})

test('opaque rescale dispatch refuses a lost combination capability before reverify or receipt', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.cfgRescale = 0.7
    })
    const admitted = await f.gate.run(
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
    )
    assert.equal(admitted.length, 1)
    const checkpointCalls = f.calls.checkpoint
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (value) => value !== RESCALE_CAPABILITY,
    )
    const outcome = await f.publicCoordinator.runNext(
      f.transport({ ready: structuredClone(f.controls.ready) }),
    )
    assert.equal(outcome.kind, 'failed')
    assert.equal(f.calls.checkpoint, checkpointCalls)
    assert.equal(f.consumed.length, 0)
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [])
    assert.deepEqual(await readdir(f.scratch), [])
  })
})

test('opaque rescale Retry advisory consumes its own frozen value and separate strict flag', () => {
  const base = {
    regionalCfgRescaleSupported: true,
    regionalImg2ImgSupported: true,
    regionalSupported: true,
  }
  for (const regionalImg2ImgCfgRescaleSupported of [undefined, false, true]) {
    const state = { ...base, regionalImg2ImgCfgRescaleSupported }
    assert.equal(generationQueueRetryReason(OPERATION, state, 'Euler', false, false, 0), null)
    assert.equal(
      generationQueueRetryReason(OPERATION, state, 'Euler', false, false, 0.7) === null,
      regionalImg2ImgCfgRescaleSupported === true,
    )
    assert.equal(
      generationQueueRetryReason('illustrious-regional-txt2img', state, 'Euler', false, false, 0.7),
      null,
    )
  }
})

test('opaque rescale actual JSONL child receives .7 and old combination peer refuses before scratch', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.cfgRescale = 0.7
    })
    const id = await queueOne(f)
    assert.equal((await settled(f, id)).status, 'completed')
    const frozen = await f.queue.loadVerifiedRegionalInput(id)
    const input = structuredClone(frozen.input)
    const runtime = path.join(f.root, 'img-rescale-runtime')
    const scratch = path.join(f.root, 'img-rescale-client-scratch')
    const received = path.join(f.root, 'img-rescale-received.jsonl')
    await mkdir(runtime)
    await mkdir(scratch, { mode: 0o700 })
    const executable = path.join(runtime, 'python')
    let client: GenerationWorkerClient | undefined
    try {
      for (const support of [false, true]) {
        // These are independent client requests; preserve the distinct nonce assertion below.
        input.request.requestId = randomUUID()
        const ready = {
          ...f.controls.ready,
          capabilities: [
            ...f.controls.ready.capabilities.filter((value) => value !== RESCALE_CAPABILITY),
            ...(support ? [RESCALE_CAPABILITY] : []),
            ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : []),
          ],
          pythonVersion: '3.12.13',
          type: 'ready',
        }
        const script = String.raw`#!${process.execPath}
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
  if(wire.type !== 'execute-current-canvas-regional') throw Error('Wrong owner');
  const bytes = fs.readFileSync(wire.bundle.path);
  if(bytes.length !== wire.bundle.byteSize || hash(bytes) !== wire.bundle.sha256) throw Error('Bundle mismatch');
  const bundle = JSON.parse(bytes);
  if(bundle.request.type !== 'generate-illustrious-img2img') throw Error('Wrong image discriminator');
  const target = fs.readFileSync(bundle.request.job.target.path);
  if(hash(target) !== bundle.request.job.target.sha256) throw Error('Target mismatch');
  fs.appendFileSync(${JSON.stringify(received)}, JSON.stringify({cfgRescale: bundle.request.job.sampling.cfgRescale, strength: bundle.request.job.sampling.denoisingStrength, requestId: wire.requestId}) + '\n');
  fs.writeFileSync(bundle.request.job.output.pngPath, Buffer.from(${JSON.stringify(f.outputBytes.toString('base64'))}, 'base64'), {flag:'wx'});
  process.stdout.write(JSON.stringify({type:'generation-done',protocolVersion:'1',requestId:wire.requestId,outputPath:bundle.request.job.output.pngPath,seed:bundle.request.job.sampling.seed}) + '\n');
});
`
        await writeFile(executable, script)
        await chmod(executable, 0o700)
        client = await GenerationWorkerClient.start(
          { pythonExecutable: executable, runtimeRoot: runtime, scratchBasePath: scratch },
          { requestTimeoutMs: 3000, shutdownWaitMs: 100 },
        )
        input.request.job.sampling.cfgRescale = 0.7
        if (!support) {
          await assert.rejects(client.executeCurrentCanvasRegional(input), {
            code: 'WORKER_VERSION_MISMATCH',
          })
          assert.deepEqual(await readdir(scratch), [])
          assert.equal(await readFile(received, 'utf8').catch(() => ''), '')
          input.request.job.sampling.cfgRescale = 0
        }
        assert.ok((await client.executeCurrentCanvasRegional(input)).pngBytes.equals(f.outputBytes))
        await client.close()
        client = undefined
      }
      const observed = (await readFile(received, 'utf8'))
        .trim()
        .split('\n')
        .map(
          (line) => JSON.parse(line) as { cfgRescale: number; requestId: string; strength: number },
        )
      assert.deepEqual(
        observed.map(({ cfgRescale }) => cfgRescale),
        [0, 0.7],
      )
      assert.deepEqual(
        observed.map(({ strength }) => strength),
        [0.5, 0.5],
      )
      assert.notEqual(observed[0].requestId, observed[1].requestId)
      assert.deepEqual(await readdir(scratch), [])
      assert.deepEqual((await f.queue.loadVerifiedRegionalInput(id)).payload, frozen.payload)
    } finally {
      await client?.close()
    }
  })
})

test('opaque rescale validates numeric bounds and never enables private nonzero execution', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.cfgRescale = 0.7
    })
    const id = await queueOne(f)
    assert.equal((await settled(f, id)).status, 'completed')
    const frozen = await f.queue.loadVerifiedRegionalInput(id)
    const before = await snapshot(f)
    for (const value of [-0.01, 1, NaN, Infinity, false, '0.7']) {
      const input = structuredClone(frozen.input)
      Reflect.set(input.request.job.sampling, 'cfgRescale', value)
      assert.throws(() => captureRegionalWorkerInput(input), { code: 'INVALID_REQUEST' })
    }
    const privateInput = structuredClone(frozen.input)
    delete privateInput.compositionProfile
    assert.throws(() => captureRegionalWorkerInput(privateInput), { code: 'INVALID_REQUEST' })
    assert.deepEqual(await snapshot(f), before)
    assert.deepEqual(await readdir(f.scratch), [])
  })
})

/**
 * InvokeAI a61ac4fb init_scheduler keeps strength-selected timesteps and a separate seed-xor step
 * generator. Its Canvas graft does not replace the selected sampler. These tests qualify Main
 * ownership and controlled transport, not native numerics.
 */
test('opaque regional Euler a requires its exact combination capability and strict transient state', async () => {
  await withFixture(async (f) => {
    const ready = structuredClone(f.controls.ready)
    assert.equal(supportsInferenceRegionalImg2ImgEulerAncestral(ready), true)
    for (const missing of [
      ANCESTRAL_CAPABILITY,
      CAPABILITY,
      'illustrious-regional-invoke-v1',
      'illustrious-regional-invoke-init-v1',
      'illustrious-img2img',
    ]) {
      assert.equal(
        supportsInferenceRegionalImg2ImgEulerAncestral({
          ...ready,
          capabilities: ready.capabilities.filter((value) => value !== missing),
        }),
        false,
        missing,
      )
    }
    assert.equal(
      supportsInferenceRegionalImg2ImgEulerAncestral({ ...ready, workerVersion: '0.13.0' }),
      false,
    )
    const state = await f.actions.getState(f.tabId)
    assert.equal(state.regionalImg2ImgEulerASupported, true)
    for (const value of [undefined, false, true]) {
      assert.equal(
        isProjectGenerationActionState({ ...state, regionalImg2ImgEulerASupported: value }),
        true,
      )
    }
    for (const value of [null, 0, 'true', {}]) {
      assert.equal(
        isProjectGenerationActionState({ ...state, regionalImg2ImgEulerASupported: value }),
        false,
      )
    }
    f.controls.ready.capabilities = ready.capabilities.filter(
      (value) => value !== ANCESTRAL_CAPABILITY,
    )
    const old = await f.actions.getState(f.tabId)
    assert.equal(old.regionalImg2ImgSupported, true)
    assert.equal(old.regionalInvokeInitializationSupported, true)
    assert.equal(old.regionalImg2ImgEulerASupported, false)
  })
})

for (const strength of [0, 0.5, 1]) {
  for (const cfgRescale of [0, 0.7]) {
    test(`opaque Euler a strength ${strength} rescale ${cfgRescale} crosses Main reload receipt and ordinary provenance`, async () => {
      await withFixture(async (f) => {
        const authored = await select(f, strength, (document) => {
          document.generationDraft.sampling.sampler = 'Euler a'
          document.generationDraft.cfgRescale = cfgRescale
        })
        const saved = await readFile(f.packagePath)
        const target = f.sourceBytes()
        const id = await queueOne(f)
        assert.equal((await settled(f, id)).status, 'completed')
        const frozen = await f.queue.loadVerifiedRegionalInput(id)
        assert.equal(frozen.payload.kind, OPERATION)
        assert.equal(frozen.payload.context.sampling.sampler, 'Euler a')
        assert.equal(frozen.payload.workerJob.sampling.scheduler, 'euler_a')
        assert.equal(frozen.payload.initializationProfile, undefined)
        assert.equal(frozen.input.initializationProfile, undefined)
        const consumed = f.consumed[0]
        assert.equal(imgRequest(consumed).job.sampling.scheduler, 'euler_a')
        assert.equal(imgRequest(consumed).job.sampling.denoisingStrength, strength)
        assert.equal(imgRequest(consumed).job.sampling.cfgRescale, cfgRescale)
        assert.equal(consumed.initializationProfile, undefined)
        assert.deepEqual(consumed.recipe, frozen.input.recipe)
        assert.ok(f.consumedTargets[0].equals(target))
        const database = openAppDatabase(f.root, path.resolve('src/main/db/migrations'))
        try {
          const queue = new GenerationQueueRepository(database.db, f.root)
          assert.deepEqual((await queue.loadVerifiedRegionalInput(id)).payload, frozen.payload)
        } finally {
          await database.close()
        }
        const candidate = (await f.staging.listVerifiedCandidates(f.tabId)).find(
          (item) => item.queueItemId === id,
        )
        assert.ok(candidate)
        const base = parseAcceptedGenerationBaseV1(candidate.frozenPayloadJson)
        assert.equal(base.kind, 'illustrious-img2img')
        assert.equal(base.context.sampling.sampler, 'Euler a')
        assert.equal(base.context.sampling.cfgRescale, cfgRescale)
        const provenance = provenanceFromVerifiedRasterCandidate({
          acceptedAt: candidate.completedAt,
          candidate,
          imagePngBytes: Buffer.from(f.outputBytes),
        })
        assert.equal(provenance.kind, 'illustrious-img2img')
        assert.equal(provenance.generationConfiguration.sampling.sampler, 'Euler a')
        assert.equal(provenance.generationConfiguration.sampling.denoisingStrength, strength)
        assert.equal(provenance.generationConfiguration.cfgRescale, cfgRescale)
        for (const key of ['regionalGuidance', 'compositionProfile', 'initializationProfile']) {
          assert.equal(JSON.stringify(provenance).includes(`"${key}"`), false)
        }
        assert.deepEqual(f.document(), authored)
        assert.ok((await readFile(f.packagePath)).equals(saved))
      })
    })
  }
}

test('test_regional_img_euler_a_capability_mutation_red', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.sampling.sampler = 'Euler a'
    })
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (value) => value !== ANCESTRAL_CAPABILITY,
    )
    assert.equal(supportsInferenceRegionalImg2Img(f.controls.ready), true)
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
    assert.equal(f.calls.compose.length, 1, 'Actual alpha must choose the IMG combination gate')
    assert.equal(f.calls.checkpoint, 0)
    assert.equal(f.consumed.length, 0)
    assert.deepEqual(await readdir(f.scratch), [])
  })
})

for (const [mode, sampler] of [
  ['img2img', 'Euler'],
  ['txt2img', 'Euler a'],
] as const) {
  test(`test_regional_img_euler_a_old_peer_control_green ${mode} ${sampler}`, async () => {
    await withFixture(async (f) => {
      f.controls.mode = mode
      const authored = await select(f, 0.5, (document) => {
        document.generationDraft.sampling.sampler = sampler
        document.generationDraft.cfgRescale = 0.7
      })
      f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
        (value) => value !== ANCESTRAL_CAPABILITY,
      )
      const id = await queueOne(f)
      assert.equal((await settled(f, id)).status, 'completed')
      assert.equal(f.consumed[0].request.type, `generate-illustrious-${mode}`)
      assert.equal(
        f.consumed[0].request.job.sampling.scheduler,
        sampler === 'Euler' ? 'euler' : 'euler_a',
      )
      assert.equal(
        f.consumed[0].initializationProfile,
        mode === 'txt2img' ? 'invoke-cpu-f32-add-noise-v1' : undefined,
      )
      assert.deepEqual(f.document(), authored)
    })
  })
}

test('opaque Euler a frozen Retry preserves original sampler source strength rescale and seed after saved Euler edits', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.sampling.sampler = 'Euler a'
      document.generationDraft.cfgRescale = 0.7
    })
    f.controls.fail = true
    const id = await queueOne(f)
    const first = await settled(f, id)
    assert.equal(first.status, 'failed')
    const source = await f.queue.loadVerifiedRegionalInput(id)
    f.controls.marker++
    const authored = await select(f, 0.8, (document) => {
      document.generationDraft.cfgRescale = 0.2
      document.generationDraft.positivePrompt.text = 'later Euler authoring'
      document.generationDraft.seed = { policy: 'fixed', value: 999 }
      document.regionalGuidance![0].enabled = false
    })
    const saved = await readFile(f.packagePath)
    f.controls.fail = false
    await f.actions.retryJob({ id, statusSequence: first.status_sequence })
    const retry = (await rows(f)).find((row) => row.id !== id)
    assert.ok(retry)
    assert.equal((await settled(f, retry.id)).status, 'completed')
    const loaded = await f.queue.loadVerifiedRegionalInput(retry.id)
    assert.deepEqual(loaded.payload, source.payload)
    assert.equal(imgRequest(f.consumed[1]).job.sampling.scheduler, 'euler_a')
    assert.equal(imgRequest(f.consumed[1]).job.sampling.cfgRescale, 0.7)
    assert.equal(imgRequest(f.consumed[1]).job.sampling.denoisingStrength, 0.5)
    assert.equal(f.consumed[1].request.job.sampling.seed, 123)
    assert.equal(f.consumed[1].initializationProfile, undefined)
    assert.deepEqual(f.consumed[1].recipe, source.input.recipe)
    assert.ok(f.consumedTargets[1].equals(f.consumedTargets[0]))
    assert.equal(f.calls.compose.length, 1)
    assert.deepEqual(f.document(), authored)
    assert.ok((await readFile(f.packagePath)).equals(saved))
  })
})

test('opaque Euler a frozen Retry refuses a lost combination capability before SQL despite saved Euler draft', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.sampling.sampler = 'Euler a'
    })
    f.controls.fail = true
    const id = await queueOne(f)
    const first = await settled(f, id)
    await select(f, 0.8)
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (value) => value !== ANCESTRAL_CAPABILITY,
    )
    const before = await snapshot(f)
    await assert.rejects(f.actions.retryJob({ id, statusSequence: first.status_sequence }), {
      code: 'GENERATION_RUNTIME_UNAVAILABLE',
    })
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.consumed.length, 1)
    assert.equal(f.calls.compose.length, 1)
  })
})

test('opaque Euler a dispatch refuses a lost combination capability before reverify or receipt', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.sampling.sampler = 'Euler a'
    })
    const admitted = await f.gate.run(
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
    )
    assert.equal(admitted.length, 1)
    const checkpointCalls = f.calls.checkpoint
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (value) => value !== ANCESTRAL_CAPABILITY,
    )
    const outcome = await f.publicCoordinator.runNext(
      f.transport({ ready: structuredClone(f.controls.ready) }),
    )
    assert.equal(outcome.kind, 'failed')
    assert.equal(f.calls.checkpoint, checkpointCalls)
    assert.equal(f.consumed.length, 0)
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [])
    assert.deepEqual(await readdir(f.scratch), [])
  })
})

test('opaque Euler a Retry advisory follows frozen sampler and its own strict flag', () => {
  const base = {
    regionalImg2ImgSupported: true,
    regionalInvokeInitializationSupported: true,
    regionalSupported: true,
  }
  for (const regionalImg2ImgEulerASupported of [undefined, false, true]) {
    const state = { ...base, regionalImg2ImgEulerASupported }
    assert.equal(generationQueueRetryReason(OPERATION, state, 'Euler'), null)
    assert.equal(
      generationQueueRetryReason(OPERATION, state, 'Euler a') === null,
      regionalImg2ImgEulerASupported === true,
    )
    assert.equal(generationQueueRetryReason('illustrious-regional-txt2img', state, 'Euler a'), null)
  }
})

test('opaque Euler a actual JSONL child receives image sampling without TXT initialization and old peer refuses before scratch', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.cfgRescale = 0.7
      document.generationDraft.sampling.sampler = 'Euler a'
    })
    const id = await queueOne(f)
    assert.equal((await settled(f, id)).status, 'completed')
    const frozen = await f.queue.loadVerifiedRegionalInput(id)
    const input = structuredClone(frozen.input)
    const runtime = path.join(f.root, 'img-euler-a-runtime')
    const scratch = path.join(f.root, 'img-euler-a-client-scratch')
    const received = path.join(f.root, 'img-euler-a-received.jsonl')
    await mkdir(runtime)
    await mkdir(scratch, { mode: 0o700 })
    const executable = path.join(runtime, 'python')
    let client: GenerationWorkerClient | undefined
    try {
      for (const support of [false, true]) {
        // These are independent client requests; preserve the distinct nonce assertion below.
        input.request.requestId = randomUUID()
        const ready = {
          ...f.controls.ready,
          capabilities: [
            ...f.controls.ready.capabilities.filter((value) => value !== ANCESTRAL_CAPABILITY),
            ...(support ? [ANCESTRAL_CAPABILITY] : []),
            ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : []),
          ],
          pythonVersion: '3.12.13',
          type: 'ready',
        }
        const script = String.raw`#!${process.execPath}
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
  if(wire.type !== 'execute-current-canvas-regional') throw Error('Wrong owner');
  const bytes = fs.readFileSync(wire.bundle.path);
  if(bytes.length !== wire.bundle.byteSize || hash(bytes) !== wire.bundle.sha256) throw Error('Bundle mismatch');
  const bundle = JSON.parse(bytes);
  if(bundle.request.type !== 'generate-illustrious-img2img') throw Error('Wrong image discriminator');
  if(bundle.initializationProfile !== undefined) throw Error('IMG inherited TXT initialization');
  const target = fs.readFileSync(bundle.request.job.target.path);
  if(hash(target) !== bundle.request.job.target.sha256) throw Error('Target mismatch');
  fs.appendFileSync(${JSON.stringify(received)}, JSON.stringify({scheduler: bundle.request.job.sampling.scheduler, initializationProfile: bundle.initializationProfile ?? null, cfgRescale: bundle.request.job.sampling.cfgRescale, strength: bundle.request.job.sampling.denoisingStrength, requestId: wire.requestId}) + '\n');
  fs.writeFileSync(bundle.request.job.output.pngPath, Buffer.from(${JSON.stringify(f.outputBytes.toString('base64'))}, 'base64'), {flag:'wx'});
  process.stdout.write(JSON.stringify({type:'generation-done',protocolVersion:'1',requestId:wire.requestId,outputPath:bundle.request.job.output.pngPath,seed:bundle.request.job.sampling.seed}) + '\n');
});
`
        await writeFile(executable, script)
        await chmod(executable, 0o700)
        client = await GenerationWorkerClient.start(
          { pythonExecutable: executable, runtimeRoot: runtime, scratchBasePath: scratch },
          { requestTimeoutMs: 3000, shutdownWaitMs: 100 },
        )
        input.request.job.sampling.scheduler = 'euler_a'
        if (!support) {
          await assert.rejects(client.executeCurrentCanvasRegional(input), {
            code: 'WORKER_VERSION_MISMATCH',
          })
          assert.deepEqual(await readdir(scratch), [])
          assert.equal(await readFile(received, 'utf8').catch(() => ''), '')
          input.request.job.sampling.scheduler = 'euler'
        }
        assert.ok((await client.executeCurrentCanvasRegional(input)).pngBytes.equals(f.outputBytes))
        await client.close()
        client = undefined
      }
      const observed = (await readFile(received, 'utf8'))
        .trim()
        .split('\n')
        .map(
          (line) =>
            JSON.parse(line) as {
              cfgRescale: number
              initializationProfile: null
              requestId: string
              scheduler: string
              strength: number
            },
        )
      assert.deepEqual(
        observed.map(({ cfgRescale }) => cfgRescale),
        [0.7, 0.7],
      )
      assert.deepEqual(
        observed.map(({ strength }) => strength),
        [0.5, 0.5],
      )
      assert.deepEqual(
        observed.map(({ scheduler }) => scheduler),
        ['euler', 'euler_a'],
      )
      assert.deepEqual(
        observed.map(({ initializationProfile }) => initializationProfile),
        [null, null],
      )
      assert.notEqual(observed[0].requestId, observed[1].requestId)
      assert.deepEqual(await readdir(scratch), [])
      assert.deepEqual((await f.queue.loadVerifiedRegionalInput(id)).payload, frozen.payload)
    } finally {
      await client?.close()
    }
  })
})

// DPM image qualification uses the same real Main owners; inference remains a controlled substitute.
test('opaque regional DPM++ 2M requires its exact combination capability and strict transient state', async () => {
  await withFixture(async (f) => {
    const ready = structuredClone(f.controls.ready)
    assert.equal(supportsInferenceRegionalImg2ImgDpmpp2m(ready), true)
    for (const missing of [
      DPM_IMG_CAPABILITY,
      CAPABILITY,
      'illustrious-regional-invoke-v1',
      'illustrious-regional-dpmpp-2m-v1',
      'illustrious-img2img',
    ]) {
      assert.equal(
        supportsInferenceRegionalImg2ImgDpmpp2m({
          ...ready,
          capabilities: ready.capabilities.filter((value) => value !== missing),
        }),
        false,
        missing,
      )
    }
    assert.equal(
      supportsInferenceRegionalImg2ImgDpmpp2m({ ...ready, workerVersion: '0.13.0' }),
      false,
    )
    const withoutTxtInit = {
      ...ready,
      capabilities: ready.capabilities.filter(
        (value) => value !== 'illustrious-regional-invoke-init-v1',
      ),
    }
    assert.equal(supportsInferenceRegionalImg2ImgDpmpp2m(withoutTxtInit), true)
    const state = await f.actions.getState(f.tabId)
    assert.equal(state.regionalImg2ImgDpmpp2mSupported, true)
    for (const value of [undefined, false, true]) {
      assert.equal(
        isProjectGenerationActionState({ ...state, regionalImg2ImgDpmpp2mSupported: value }),
        true,
      )
    }
    for (const value of [null, 0, 'true', {}]) {
      assert.equal(
        isProjectGenerationActionState({ ...state, regionalImg2ImgDpmpp2mSupported: value }),
        false,
      )
    }
    f.controls.ready.capabilities = ready.capabilities.filter(
      (value) => value !== DPM_IMG_CAPABILITY,
    )
    const old = await f.actions.getState(f.tabId)
    assert.equal(old.regionalImg2ImgSupported, true)
    assert.equal(old.regionalInvokeInitializationSupported, true)
    assert.equal(old.regionalImg2ImgDpmpp2mSupported, false)
  })
})

for (const strength of [0, 0.5, 1]) {
  for (const cfgRescale of [0, 0.7]) {
    test(`opaque DPM++ 2M strength ${strength} rescale ${cfgRescale} crosses Main reload receipt and ordinary provenance`, async () => {
      await withFixture(async (f) => {
        const authored = await select(f, strength, (document) => {
          document.generationDraft.sampling.sampler = 'DPM++ 2M'
          document.generationDraft.sampling.scheduler = 'Karras'
          document.generationDraft.cfgRescale = cfgRescale
        })
        const saved = await readFile(f.packagePath)
        const target = f.sourceBytes()
        const id = await queueOne(f)
        assert.equal((await settled(f, id)).status, 'completed')
        const frozen = await f.queue.loadVerifiedRegionalInput(id)
        assert.equal(frozen.payload.kind, OPERATION)
        assert.equal(frozen.payload.context.sampling.sampler, 'DPM++ 2M')
        assert.equal(frozen.payload.workerJob.sampling.scheduler, 'dpmpp_2m_k')
        assert.equal(frozen.payload.initializationProfile, undefined)
        assert.equal(frozen.input.initializationProfile, undefined)
        const consumed = f.consumed[0]
        assert.equal(imgRequest(consumed).job.sampling.scheduler, 'dpmpp_2m_k')
        assert.equal(imgRequest(consumed).job.sampling.denoisingStrength, strength)
        assert.equal(imgRequest(consumed).job.sampling.cfgRescale, cfgRescale)
        assert.equal(consumed.initializationProfile, undefined)
        assert.deepEqual(consumed.recipe, frozen.input.recipe)
        assert.ok(f.consumedTargets[0].equals(target))
        const database = openAppDatabase(f.root, path.resolve('src/main/db/migrations'))
        try {
          const queue = new GenerationQueueRepository(database.db, f.root)
          assert.deepEqual((await queue.loadVerifiedRegionalInput(id)).payload, frozen.payload)
        } finally {
          await database.close()
        }
        const candidate = (await f.staging.listVerifiedCandidates(f.tabId)).find(
          (item) => item.queueItemId === id,
        )
        assert.ok(candidate)
        const base = parseAcceptedGenerationBaseV1(candidate.frozenPayloadJson)
        assert.equal(base.kind, 'illustrious-img2img')
        assert.equal(base.context.sampling.sampler, 'DPM++ 2M')
        assert.equal(base.context.sampling.cfgRescale, cfgRescale)
        const provenance = provenanceFromVerifiedRasterCandidate({
          acceptedAt: candidate.completedAt,
          candidate,
          imagePngBytes: Buffer.from(f.outputBytes),
        })
        assert.equal(provenance.kind, 'illustrious-img2img')
        assert.equal(provenance.generationConfiguration.sampling.sampler, 'DPM++ 2M')
        assert.equal(provenance.generationConfiguration.sampling.denoisingStrength, strength)
        assert.equal(provenance.generationConfiguration.cfgRescale, cfgRescale)
        for (const key of ['regionalGuidance', 'compositionProfile', 'initializationProfile']) {
          assert.equal(JSON.stringify(provenance).includes(`"${key}"`), false)
        }
        assert.deepEqual(f.document(), authored)
        assert.ok((await readFile(f.packagePath)).equals(saved))
      })
    })
  }
}

test('test_regional_img_dpmpp_2m_k_capability_mutation_red', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.sampling.sampler = 'DPM++ 2M'
      document.generationDraft.sampling.scheduler = 'Karras'
    })
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (value) => value !== DPM_IMG_CAPABILITY,
    )
    assert.equal(supportsInferenceRegionalImg2Img(f.controls.ready), true)
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
    assert.equal(f.calls.compose.length, 1, 'Actual alpha must choose the IMG combination gate')
    assert.equal(f.calls.checkpoint, 0)
    assert.equal(f.consumed.length, 0)
    assert.deepEqual(await readdir(f.scratch), [])
  })
})

for (const [mode, sampler] of [
  ['img2img', 'Euler'],
  ['txt2img', 'DPM++ 2M'],
] as const) {
  test(`test_regional_img_dpmpp_2m_k_old_peer_control_green ${mode} ${sampler}`, async () => {
    await withFixture(async (f) => {
      f.controls.mode = mode
      const authored = await select(f, 0.5, (document) => {
        document.generationDraft.sampling.sampler = sampler
        document.generationDraft.sampling.scheduler = sampler === 'DPM++ 2M' ? 'Karras' : 'Normal'
        document.generationDraft.cfgRescale = 0.7
      })
      f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
        (value) => value !== DPM_IMG_CAPABILITY,
      )
      const id = await queueOne(f)
      assert.equal((await settled(f, id)).status, 'completed')
      assert.equal(f.consumed[0].request.type, `generate-illustrious-${mode}`)
      assert.equal(
        f.consumed[0].request.job.sampling.scheduler,
        sampler === 'Euler' ? 'euler' : 'dpmpp_2m_k',
      )
      assert.equal(
        f.consumed[0].initializationProfile,
        mode === 'txt2img' ? 'invoke-cpu-f32-add-noise-v1' : undefined,
      )
      assert.deepEqual(f.document(), authored)
    })
  })
}

test('opaque DPM++ 2M frozen Retry preserves original sampler source strength rescale and seed after saved Euler edits', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.sampling.sampler = 'DPM++ 2M'
      document.generationDraft.sampling.scheduler = 'Karras'
      document.generationDraft.cfgRescale = 0.7
    })
    f.controls.fail = true
    const id = await queueOne(f)
    const first = await settled(f, id)
    assert.equal(first.status, 'failed')
    const source = await f.queue.loadVerifiedRegionalInput(id)
    f.controls.marker++
    const authored = await select(f, 0.8, (document) => {
      document.generationDraft.cfgRescale = 0.2
      document.generationDraft.positivePrompt.text = 'later Euler authoring'
      document.generationDraft.seed = { policy: 'fixed', value: 999 }
      document.regionalGuidance![0].enabled = false
    })
    const saved = await readFile(f.packagePath)
    f.controls.fail = false
    await f.actions.retryJob({ id, statusSequence: first.status_sequence })
    const retry = (await rows(f)).find((row) => row.id !== id)
    assert.ok(retry)
    assert.equal((await settled(f, retry.id)).status, 'completed')
    const loaded = await f.queue.loadVerifiedRegionalInput(retry.id)
    assert.deepEqual(loaded.payload, source.payload)
    assert.equal(imgRequest(f.consumed[1]).job.sampling.scheduler, 'dpmpp_2m_k')
    assert.equal(imgRequest(f.consumed[1]).job.sampling.cfgRescale, 0.7)
    assert.equal(imgRequest(f.consumed[1]).job.sampling.denoisingStrength, 0.5)
    assert.equal(f.consumed[1].request.job.sampling.seed, 123)
    assert.equal(f.consumed[1].initializationProfile, undefined)
    assert.deepEqual(f.consumed[1].recipe, source.input.recipe)
    assert.ok(f.consumedTargets[1].equals(f.consumedTargets[0]))
    assert.equal(f.calls.compose.length, 1)
    assert.deepEqual(f.document(), authored)
    assert.ok((await readFile(f.packagePath)).equals(saved))
  })
})

test('opaque DPM++ 2M frozen Retry refuses a lost combination capability before SQL despite saved Euler draft', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.sampling.sampler = 'DPM++ 2M'
      document.generationDraft.sampling.scheduler = 'Karras'
    })
    f.controls.fail = true
    const id = await queueOne(f)
    const first = await settled(f, id)
    await select(f, 0.8)
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (value) => value !== DPM_IMG_CAPABILITY,
    )
    const before = await snapshot(f)
    await assert.rejects(f.actions.retryJob({ id, statusSequence: first.status_sequence }), {
      code: 'GENERATION_RUNTIME_UNAVAILABLE',
    })
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.consumed.length, 1)
    assert.equal(f.calls.compose.length, 1)
  })
})

test('opaque DPM++ 2M dispatch refuses a lost combination capability before reverify or receipt', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.sampling.sampler = 'DPM++ 2M'
      document.generationDraft.sampling.scheduler = 'Karras'
    })
    const admitted = await f.gate.run(
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
    )
    assert.equal(admitted.length, 1)
    const checkpointCalls = f.calls.checkpoint
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (value) => value !== DPM_IMG_CAPABILITY,
    )
    const outcome = await f.publicCoordinator.runNext(
      f.transport({ ready: structuredClone(f.controls.ready) }),
    )
    assert.equal(outcome.kind, 'failed')
    assert.equal(f.calls.checkpoint, checkpointCalls)
    assert.equal(f.consumed.length, 0)
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [])
    assert.deepEqual(await readdir(f.scratch), [])
  })
})

test('opaque DPM++ 2M Retry advisory follows frozen sampler and its own strict flag', () => {
  const base = {
    regionalDpmSupported: false,
    regionalImg2ImgSupported: true,
    regionalInvokeInitializationSupported: false,
    regionalSupported: true,
  }
  for (const regionalImg2ImgDpmpp2mSupported of [undefined, false, true]) {
    const state = { ...base, regionalImg2ImgDpmpp2mSupported }
    assert.equal(generationQueueRetryReason(OPERATION, state, 'Euler'), null)
    assert.equal(
      generationQueueRetryReason(OPERATION, state, 'DPM++ 2M') === null,
      regionalImg2ImgDpmpp2mSupported === true,
    )
    assert.match(
      generationQueueRetryReason('illustrious-regional-txt2img', state, 'DPM++ 2M')!,
      /Regional Guidance with DPM/,
    )
  }
})

test('opaque DPM++ 2M actual JSONL child receives image sampling without TXT initialization and old peer refuses before scratch', async () => {
  await withFixture(async (f) => {
    await select(f, 0.5, (document) => {
      document.generationDraft.cfgRescale = 0.7
      document.generationDraft.sampling.sampler = 'DPM++ 2M'
      document.generationDraft.sampling.scheduler = 'Karras'
    })
    const id = await queueOne(f)
    assert.equal((await settled(f, id)).status, 'completed')
    const frozen = await f.queue.loadVerifiedRegionalInput(id)
    const input = structuredClone(frozen.input)
    const runtime = path.join(f.root, 'img-dpmpp-2m-k-runtime')
    const scratch = path.join(f.root, 'img-dpmpp-2m-k-client-scratch')
    const received = path.join(f.root, 'img-dpmpp-2m-k-received.jsonl')
    await mkdir(runtime)
    await mkdir(scratch, { mode: 0o700 })
    const executable = path.join(runtime, 'python')
    let client: GenerationWorkerClient | undefined
    try {
      for (const support of [false, true]) {
        // These are independent client requests; preserve the distinct nonce assertion below.
        input.request.requestId = randomUUID()
        const ready = {
          ...f.controls.ready,
          capabilities: [
            ...f.controls.ready.capabilities.filter((value) => value !== DPM_IMG_CAPABILITY),
            ...(support ? [DPM_IMG_CAPABILITY] : []),
            ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : []),
          ],
          pythonVersion: '3.12.13',
          type: 'ready',
        }
        const script = String.raw`#!${process.execPath}
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
  if(wire.type !== 'execute-current-canvas-regional') throw Error('Wrong owner');
  const bytes = fs.readFileSync(wire.bundle.path);
  if(bytes.length !== wire.bundle.byteSize || hash(bytes) !== wire.bundle.sha256) throw Error('Bundle mismatch');
  const bundle = JSON.parse(bytes);
  if(bundle.request.type !== 'generate-illustrious-img2img') throw Error('Wrong image discriminator');
  if(bundle.initializationProfile !== undefined) throw Error('IMG inherited TXT initialization');
  const target = fs.readFileSync(bundle.request.job.target.path);
  if(hash(target) !== bundle.request.job.target.sha256) throw Error('Target mismatch');
  fs.appendFileSync(${JSON.stringify(received)}, JSON.stringify({scheduler: bundle.request.job.sampling.scheduler, initializationProfile: bundle.initializationProfile ?? null, cfgRescale: bundle.request.job.sampling.cfgRescale, strength: bundle.request.job.sampling.denoisingStrength, requestId: wire.requestId}) + '\n');
  fs.writeFileSync(bundle.request.job.output.pngPath, Buffer.from(${JSON.stringify(f.outputBytes.toString('base64'))}, 'base64'), {flag:'wx'});
  process.stdout.write(JSON.stringify({type:'generation-done',protocolVersion:'1',requestId:wire.requestId,outputPath:bundle.request.job.output.pngPath,seed:bundle.request.job.sampling.seed}) + '\n');
});
`
        await writeFile(executable, script)
        await chmod(executable, 0o700)
        client = await GenerationWorkerClient.start(
          { pythonExecutable: executable, runtimeRoot: runtime, scratchBasePath: scratch },
          { requestTimeoutMs: 3000, shutdownWaitMs: 100 },
        )
        input.request.job.sampling.scheduler = 'dpmpp_2m_k'
        if (!support) {
          await assert.rejects(client.executeCurrentCanvasRegional(input), {
            code: 'WORKER_VERSION_MISMATCH',
          })
          assert.deepEqual(await readdir(scratch), [])
          assert.equal(await readFile(received, 'utf8').catch(() => ''), '')
          input.request.job.sampling.scheduler = 'euler'
        }
        assert.ok((await client.executeCurrentCanvasRegional(input)).pngBytes.equals(f.outputBytes))
        await client.close()
        client = undefined
      }
      const observed = (await readFile(received, 'utf8'))
        .trim()
        .split('\n')
        .map(
          (line) =>
            JSON.parse(line) as {
              cfgRescale: number
              initializationProfile: null
              requestId: string
              scheduler: string
              strength: number
            },
        )
      assert.deepEqual(
        observed.map(({ cfgRescale }) => cfgRescale),
        [0.7, 0.7],
      )
      assert.deepEqual(
        observed.map(({ strength }) => strength),
        [0.5, 0.5],
      )
      assert.deepEqual(
        observed.map(({ scheduler }) => scheduler),
        ['euler', 'dpmpp_2m_k'],
      )
      assert.deepEqual(
        observed.map(({ initializationProfile }) => initializationProfile),
        [null, null],
      )
      assert.notEqual(observed[0].requestId, observed[1].requestId)
      assert.deepEqual(await readdir(scratch), [])
      assert.deepEqual((await f.queue.loadVerifiedRegionalInput(id)).payload, frozen.payload)
    } finally {
      await client?.close()
    }
  })
})

for (const strength of [0, 0.5, 1]) {
  test(`opaque DPM Normal strength ${strength} admits a peer without TXT initialization`, async () => {
    await withFixture(async (f) => {
      f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
        (value) => value !== 'illustrious-regional-invoke-init-v1',
      )
      await select(f, strength, (document) => {
        document.generationDraft.sampling.sampler = 'DPM++ 2M'
        document.generationDraft.sampling.scheduler = 'Normal'
      })
      const state = await f.actions.getState(f.tabId)
      assert.equal(state.regionalDpmSupported, false)
      assert.equal(state.regionalImg2ImgDpmpp2mSupported, true)
      const id = await queueOne(f)
      assert.equal((await settled(f, id)).status, 'completed')
      const frozen = await f.queue.loadVerifiedRegionalInput(id)
      assert.equal(frozen.payload.workerJob.sampling.scheduler, 'dpmpp_2m')
      assert.equal(imgRequest(f.consumed[0]).job.sampling.denoisingStrength, strength)
      assert.equal(frozen.input.initializationProfile, undefined)
      assert.ok(f.consumedTargets[0].equals(f.sourceBytes()))
    })
  })
}

test('opaque DPM-only peer cannot admit actual transparent TXT without its TXT initialization', async () => {
  await withFixture(async (f) => {
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (value) => value !== 'illustrious-regional-invoke-init-v1',
    )
    f.controls.mode = 'txt2img'
    await select(f, 0.5, (document) => {
      document.generationDraft.sampling.sampler = 'DPM++ 2M'
    })
    const before = await snapshot(f)
    await assert.rejects(
      f.actions.generate(f.tabId, { documentId: f.document().documentId, iterations: 1 }),
      { code: 'INFERENCE_UNAVAILABLE' },
    )
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.calls.checkpoint, 0)
    assert.equal(f.consumed.length, 0)
    assert.deepEqual(await readdir(f.scratch), [])
  })
})
