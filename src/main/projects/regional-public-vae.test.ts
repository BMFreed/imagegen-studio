import { LAMA_OUTPAINT_IDENTITY_V1 } from '../../shared/projects/alpha-outpaint.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { supportsInferenceRegionalImg2ImgVae } from '../../shared/projects/inference-worker-capabilities.js'
import type { ProjectGenerateOptions } from '../../shared/projects/project-generation-actions.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readdir, readFile, rm, truncate, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { isDeepStrictEqual } from 'node:util'

import type { OutpaintInfillResolver } from '../runtime/inference-auxiliary-resources.js'
import type { FrozenGenerationVae } from './illustrious-generation-vae.js'
import type { RegionalWorkerInput } from './regional-worker-request.js'
import type { RegionalProjectFixture } from './test-fixtures/regional-project.js'

import { openAppDatabase } from '../db/database.js'
import { ProjectGenerationActionController } from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationWorkerClient } from './generation-worker-client.js'
import { deriveOutpaintContributionAlphaV1 } from './outpaint-contribution.js'
import { provenanceFromVerifiedRasterCandidate } from './project-generation-provenance.js'
import { ProjectRegionalGenerationCoordinator } from './project-regional-generation-coordinator.js'
import { parseAcceptedGenerationBaseV1 } from './regional-queued-generation.js'
import { prepareRegionalWorkerRequest } from './regional-worker-request.js'
import { decodeTargetPngAlpha } from './target-png-mode.js'
import {
  createRegionalProjectFixture,
  regionalProjectDigest,
} from './test-fixtures/regional-project.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'

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
async function vaeFixture(image: boolean | 'outpaint' = false) {
  const f = await createRegionalProjectFixture()
  if (image) {
    // Controlled compositor, with actual source PNG bytes verified by Main. Numerical inference
    // remains a controlled substitute; this fixture qualifies only Main ownership and resources.
    f.compositionWorker.composeTarget = async (input) => {
      f.calls.compose.push(structuredClone(input))
      await f.hooks.compose?.()
      const bytes = literalSmartPatchColorPng(
        64,
        64,
        Array.from({ length: 4096 }, (_, i) => [
          40,
          80,
          120,
          image === 'outpaint' ? (i % 64 < 32 ? 255 : i % 64 === 32 ? 127 : 0) : 255,
        ]).flat(),
        4,
      )
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
        mode: image === 'outpaint' ? 'outpaint' : 'img2img',
        rect: { ...f.bbox },
      }
    }
    await f.edit((document) => {
      document.generationDraft.sampling.denoisingStrength = 0.5
    })
  }
  let infillResolver: OutpaintInfillResolver | undefined
  if (image === 'outpaint') {
    // Sparse Main-only stand-in: never native LaMa or trained-image evidence.
    const managedPath = path.join(f.root, 'v-image-controlled-lama.pt')
    await writeFile(managedPath, '', { flag: 'wx', mode: 0o600 })
    await truncate(managedPath, LAMA_OUTPAINT_IDENTITY_V1.byteSize)
    infillResolver = {
      resolveVerifiedOutpaintInfill: async () => ({ ...LAMA_OUTPAINT_IDENTITY_V1, managedPath }),
    }
  }
  const orchestrator = infillResolver
    ? new GenerationOrchestrator(
        f.projects,
        f.index,
        f.models,
        f.queue,
        f.staging,
        f.processor,
        f.scratch,
        infillResolver,
      )
    : f.orchestrator
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
    resolvedPredictionType?: 'epsilon' | 'v_prediction'
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
        ...(image
          ? [
              'illustrious-regional-img2img-v1',
              'illustrious-regional-img2img-vae-v1',
              'illustrious-regional-img2img-euler-a-v1',
              'illustrious-regional-img2img-dpmpp-2m-v1',
              'illustrious-regional-dpmpp-2m-v1',
              'illustrious-regional-cfg-rescale-v1',
              'illustrious-regional-img2img-cfg-rescale-v1',
              ...(image === 'outpaint' ? ['illustrious-regional-outpaint-v1'] : []),
            ]
          : []),
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
  const exactCheckpoint = f.models.resolveVerifiedGenerationCheckpointForPlan
  f.models.resolveVerifiedGenerationCheckpointForPlan = async (saved) => {
    // The real ModelService owns the current objective override independently from a saved ref.
    // Keep every other exact identity assertion in the underlying Main-only fixture unchanged.
    const resolved = await exactCheckpoint(
      controls.resolvedPredictionType === undefined
        ? saved
        : { ...saved, predictionType: f.reference.predictionType },
    )
    return {
      ...resolved,
      reference: {
        ...resolved.reference,
        predictionType: controls.resolvedPredictionType ?? resolved.reference.predictionType,
      },
    }
  }
  const publicCoordinator = new ProjectRegionalGenerationCoordinator({
    compositionProfile: 'invoke-canvas-v1',
    gate: f.gate,
    models: f.models,
    orchestrator,
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
              throw new Error('Controlled frozen regional VAE inference refusal')
            }
            const result = f.resultFor(input)
            if (input.request.type !== 'generate-illustrious-outpaint') {
              return result
            }
            const source = await readFile(input.request.job.target.path)
            const alpha = deriveOutpaintContributionAlphaV1(
              decodeTargetPngAlpha(source, 64, 64),
              64,
              64,
            )
            const pngBytes = literalSmartPatchColorPng(
              64,
              64,
              Array.from({ length: 4096 }, (_, i) => [17, i % 251, 91, alpha[i]]).flat(),
              4,
            )
            return {
              ...result,
              output: {
                ...result.output,
                byteSize: pngBytes.length,
                sha256: regionalProjectDigest(pngBytes),
              },
              pngBytes,
            }
          },
          ready: structuredClone(controls.ready),
        }),
        generate: async () => assert.fail('Regional VAE cannot enter ordinary inference.'),
      })
    },
  }
  const dispatch = new GenerationDispatchCoordinator(
    runtime,
    orchestrator,
    f.processor,
    f.scratch,
    undefined,
    publicCoordinator,
  )
  const actions = new ProjectGenerationActionController({
    dispatch,
    gate: f.gate,
    models: f.models,
    orchestrator,
    processor: f.processor,
    ...(infillResolver ? { infillResolver } : {}),
    projects: f.projects,
    queue: f.queue,
    regional: publicCoordinator,
    runtime,
    scratchBasePath: f.scratch,
    staging: f.staging,
  })
  return { ...f, actions, consumed, controls, publicCoordinator, resolved, resources }
}

async function withFixture(
  use: (f: Fixture) => Promise<void>,
  image: boolean | 'outpaint' = false,
) {
  const f = await vaeFixture(image)
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

// Public opaque IMG uses Invoke's same selected VAE for the encoder and decoder. The new peer
// capability qualifies that combination; TXT and legacy Embedded FP16 keep their existing owner.
const IMAGE_VAE_CAPABILITY = 'illustrious-regional-img2img-vae-v1'
function withoutImageVaeCapability(f: Fixture) {
  f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
    (capability) => capability !== IMAGE_VAE_CAPABILITY,
  )
}

for (const external of [false, true]) {
  for (const precision of ['Auto', 'FP16', 'FP32'] as const) {
    test(`public regional IMG ${external ? 'selected' : 'Embedded'} VAE preserves ${precision} through save queue wire and receipt`, async () => {
      await withFixture(async (f) => {
        await select(f, external, precision)
        await f.projects.close(f.tabId)
        assert.equal((await f.projects.open(f.tabId)).kind, 'opened')
        f.controls.libraryDefault = 'B'
        const authored = structuredClone(f.document())
        const saved = await readFile(f.packagePath)
        const result = await queued(f)
        assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
        const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
        assert.equal(loaded.payload.kind, 'illustrious-regional-img2img')
        assert.equal(loaded.input.request.type, 'generate-illustrious-img2img')
        assert.equal(loaded.input.initializationProfile, undefined)
        assert.equal(loaded.input.request.job.sampling.scheduler, 'euler')
        assert.equal(loaded.payload.context.vaePrecision, precision)
        assert.equal(loaded.input.request.job.vaePrecision, precision)
        if (external) {
          assertFrozen(f, loaded, precision)
        } else {
          assert.equal(loaded.payload.context.vae, null)
          assert.equal(loaded.input.request.job.vae, null)
          assert.deepEqual(f.resolved, [])
        }
        const lease = await prepareRegionalWorkerRequest(loaded.input, f.scratch)
        try {
          const bundle = JSON.parse(
            await readFile(lease.wire.bundle.path, 'utf8'),
          ) as RegionalWorkerInput
          assert.equal(bundle.request.type, 'generate-illustrious-img2img')
          assert.deepEqual(bundle.request.job.vae, loaded.input.request.job.vae)
          assert.equal(bundle.request.job.vaePrecision, precision)
          assert.equal(bundle.initializationProfile, undefined)
          assert.deepEqual(lease.request.job.vae, loaded.input.request.job.vae)
          assert.equal('vae' in bundle.recipe, false)
        } finally {
          await lease.dispose()
        }
        const entry = await f.queue.getManagerEntry(result.jobIds[0])
        assert.equal(
          entry.details?.requiresRegionalVae,
          external || precision !== 'FP16' ? true : undefined,
        )
        assert.equal((await f.actions.getState(f.tabId)).regionalImg2ImgVaeSupported, true)
        assert.equal((await f.staging.listVerifiedCandidates(f.tabId)).length, 1)
        assert.deepEqual(f.document(), authored)
        assert.ok((await readFile(f.packagePath)).equals(saved))
      }, true)
    })
  }
}

test('test_regional_img_vae_capability_red', async () => {
  await withFixture(async (f) => {
    await select(f, true, 'FP32')
    withoutImageVaeCapability(f)
    const before = await snapshot(f)
    await assert.rejects(f.actions.generate(f.tabId, options(f)), {
      code: 'INFERENCE_UNAVAILABLE',
    })
    assert.equal(f.calls.compose.length, 1)
    assert.equal(f.calls.checkpoint, 0)
    assert.deepEqual(f.resolved, [])
    assert.deepEqual(f.consumed, [])
    assert.deepEqual(await snapshot(f), before)
    assert.deepEqual(await readdir(f.scratch), [])
  }, true)
})

test('test_regional_img_vae_legacy_control_green', async () => {
  await withFixture(async (f) => {
    await select(f, false, 'FP16')
    withoutImageVaeCapability(f)
    withoutCapability(f)
    const result = await queued(f)
    assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
    const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    assert.equal(loaded.payload.kind, 'illustrious-regional-img2img')
    assert.equal(loaded.input.request.job.vae, null)
    assert.equal(loaded.input.request.job.vaePrecision, 'FP16')
    assert.equal((await f.actions.getState(f.tabId)).regionalImg2ImgVaeSupported, false)
    assert.deepEqual(f.resolved, [])
  }, true)
})

test('public regional IMG VAE qualification requires every combination prerequisite and known peer', async () => {
  await withFixture(async (f) => {
    const ready = structuredClone(f.controls.ready)
    assert.equal(supportsInferenceRegionalImg2ImgVae(ready), true)
    for (const absent of [
      IMAGE_VAE_CAPABILITY,
      'illustrious-regional-img2img-v1',
      'illustrious-regional-vae-v1',
      'illustrious-regional-invoke-v1',
    ]) {
      assert.equal(
        supportsInferenceRegionalImg2ImgVae({
          ...ready,
          capabilities: ready.capabilities.filter((capability) => capability !== absent),
        }),
        false,
        absent,
      )
    }
    assert.equal(supportsInferenceRegionalImg2ImgVae({ ...ready, workerVersion: '0.13.0' }), false)
    assert.equal(supportsInferenceRegionalImg2ImgVae({ ...ready, workerVersion: '0.15.0' }), false)
    assert.equal(supportsInferenceRegionalImg2ImgVae(null), false)
  }, true)
})

for (const [sampler, scheduler, key] of [
  ['Euler', 'Normal', 'euler'],
  ['Euler a', 'Normal', 'euler_a'],
  ['DPM++ 2M', 'Normal', 'dpmpp_2m'],
  ['DPM++ 2M', 'Karras', 'dpmpp_2m_k'],
] as const) {
  test(`public regional selected FP32 IMG retains ${sampler}/${scheduler} strength and CFG gates without TXT initialization`, async () => {
    await withFixture(async (f) => {
      await select(f)
      await f.edit((document) => {
        document.generationDraft.sampling.sampler = sampler
        document.generationDraft.sampling.scheduler = scheduler
        document.generationDraft.cfgRescale = 0.7
      })
      const result = await queued(f)
      assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
      const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      assertFrozen(f, loaded)
      assert.equal(loaded.input.request.job.sampling.scheduler, key)
      assert.equal(loaded.input.request.job.sampling.cfgRescale, 0.7)
      assert.ok(loaded.input.request.type === 'generate-illustrious-img2img')
      assert.equal(loaded.input.request.job.sampling.denoisingStrength, 0.5)
      assert.equal(loaded.input.initializationProfile, undefined)
    }, true)
  })
}

test('public regional selected IMG Retry uses frozen VAE and precision after reload despite Default B and current TXT edits', async () => {
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
      assertFrozen(f, await recovered.loadVerifiedRegionalInput(admitted[1].id))
      f.controls.libraryDefault = 'B'
      await f.edit((document) => {
        document.generationDraft.vae = structuredClone(f.resources.B.descriptor.reference)
        document.generationDraft.vaePrecision = 'FP16'
        document.generationDraft.sampling.denoisingStrength = null
        document.generationDraft.sampling.sampler = 'Euler'
        document.generationDraft.seed.value = 999
        document.regionalGuidance = []
      })
      await f.projects.save(f.tabId)
      const authored = structuredClone(f.document())
      const saved = await readFile(f.packagePath)
      const terminal = await recovered.getManagerEntry(admitted[1].id)
      const capable = structuredClone(f.controls.ready)
      withoutImageVaeCapability(f)
      const before = await snapshot(f)
      const resolutions = f.resolved.length
      await assert.rejects(
        f.actions.retryJob({ id: terminal.id, statusSequence: terminal.statusSequence }),
        { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
      )
      assert.deepEqual(await snapshot(f), before)
      assert.equal(f.resolved.length, resolutions)
      f.controls.ready = capable
      await f.actions.retryJob({ id: terminal.id, statusSequence: terminal.statusSequence })
      const retry = (await rows(f)).find((row) => !admitted.some((item) => item.id === row.id))
      assert.ok(retry)
      assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
      const loaded = await recovered.loadVerifiedRegionalInput(retry.id)
      assert.deepEqual(loaded.payload, original.payload)
      assertFrozen(f, loaded)
      assert.equal(f.consumed.length, 1)
      assert.equal(f.calls.compose.length, 1)
      assert.deepEqual(f.document(), authored)
      assert.ok((await readFile(f.packagePath)).equals(saved))
    } finally {
      await connection.close()
    }
  }, true)
})

for (const fault of ['missing', 'changed'] as const) {
  test(`public regional selected IMG ${fault} exact VAE refuses frozen Retry before SQL`, async () => {
    await withFixture(async (f) => {
      await select(f)
      f.controls.failSeeds.add(123)
      const result = await queued(f)
      assert.equal((await settled(f, result.jobIds))[0].status, 'failed')
      const source = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      const before = await snapshot(f)
      const resource = f.resources.A
      await (fault === 'missing'
        ? rm(resource.descriptor.managedPath)
        : writeFile(resource.descriptor.managedPath, Buffer.from('Changed exact image VAE')))
      await assert.rejects(
        f.actions.retryJob({ id: source.item.id, statusSequence: source.item.statusSequence }),
        { code: fault === 'missing' ? 'MODEL_FILE_MISSING' : 'MODEL_FILE_CORRUPT' },
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
    }, true)
  })
}

test('public selected VAE TXT remains independent of the IMG VAE capability', async () => {
  await withFixture(async (f) => {
    await select(f)
    const result = await queued(f)
    assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
    assert.equal(
      (await f.queue.loadVerifiedRegionalInput(result.jobIds[0])).payload.kind,
      'illustrious-regional-txt2img',
    )
    assertFrozen(f, await f.queue.loadVerifiedRegionalInput(result.jobIds[0]))
    assert.equal((await f.actions.getState(f.tabId)).regionalImg2ImgVaeSupported, false)
  })
})

for (const fault of ['descriptor-omitted', 'precision', 'path', 'size'] as const) {
  test(`public regional selected IMG ${fault} logical/worker disagreement refuses before SQL`, async () => {
    await withFixture(async (f) => {
      await select(f)
      const result = await queued(f)
      await settled(f, result.jobIds)
      const loaded = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      const before = await snapshot(f)
      const input = structuredClone(loaded.input)
      const context = structuredClone(loaded.payload.context)
      const bytes = await readFile(input.request.job.target.path)
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
            assert.fail('VAE agreement must refuse before SQL capacity/publication.'),
          prepared: { context, targetPngBytes: bytes },
          projectPath: f.packagePath,
          regional,
          request,
          stagingSessionId: randomUUID(),
        }),
        { code: 'QUEUE_INPUT_INVALID' },
      )
      assert.deepEqual(await snapshot(f), before)
    }, true)
  })
}

test('public regional IMG lost VAE combination refuses dispatch before resource reverify and receipt', async () => {
  await withFixture(async (f) => {
    await select(f)
    await f.gate.run(
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
    const checkpointCalls = f.calls.checkpoint
    const resolutions = f.resolved.length
    withoutImageVaeCapability(f)
    const outcome = await f.publicCoordinator.runNext(
      f.transport({ ready: structuredClone(f.controls.ready) }),
    )
    assert.equal(outcome.kind, 'failed')
    assert.equal(f.calls.checkpoint, checkpointCalls)
    assert.equal(f.resolved.length, resolutions)
    assert.deepEqual(f.consumed, [])
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [])
    assert.deepEqual(await readdir(f.scratch), [])
  }, true)
})

for (const [external, precision] of [
  [false, 'Auto'],
  [false, 'FP32'],
  [true, 'FP16'],
] as const) {
  test(`public regional IMG ${external ? 'selected' : 'Embedded'} ${precision} refuses an old peer after actual composition before resources`, async () => {
    await withFixture(async (f) => {
      await select(f, external, precision)
      withoutImageVaeCapability(f)
      const before = await snapshot(f)
      await assert.rejects(f.actions.generate(f.tabId, options(f)), {
        code: 'INFERENCE_UNAVAILABLE',
      })
      assert.equal(f.calls.compose.length, 1)
      assert.equal(f.calls.checkpoint, 0)
      assert.deepEqual(f.resolved, [])
      assert.deepEqual(await snapshot(f), before)
    }, true)
  })
}

test('public regional IMG selected VAE JSONL child preserves exact descriptor and old peer refuses before scratch', async () => {
  await withFixture(async (f) => {
    await select(f)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const frozen = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    const runtime = path.join(f.root, 'image-vae-jsonl-runtime')
    const scratch = path.join(f.root, 'image-vae-jsonl-scratch')
    const received = path.join(f.root, 'image-vae-jsonl-received.jsonl')
    await mkdir(runtime)
    await mkdir(scratch, { mode: 0o700 })
    const executable = path.join(runtime, 'python')
    let client: GenerationWorkerClient | undefined
    try {
      for (const support of [false, true]) {
        const input = structuredClone(frozen.input)
        input.request.requestId = randomUUID()
        const ready = {
          ...f.controls.ready,
          capabilities: [
            ...f.controls.ready.capabilities.filter(
              (capability) => capability !== IMAGE_VAE_CAPABILITY,
            ),
            ...(support ? [IMAGE_VAE_CAPABILITY] : []),
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
  if(bundle.initializationProfile !== undefined) throw Error('Image inherited TXT initialization');
  const target = fs.readFileSync(bundle.request.job.target.path);
  if(hash(target) !== bundle.request.job.target.sha256) throw Error('Target mismatch');
  fs.appendFileSync(${JSON.stringify(received)}, JSON.stringify({vae:bundle.request.job.vae,vaePrecision:bundle.request.job.vaePrecision,initializationProfile:bundle.initializationProfile??null}) + '\n');
  fs.writeFileSync(bundle.request.job.output.pngPath, Buffer.from(${JSON.stringify(f.outputBytes.toString('base64'))},'base64'), {flag:'wx'});
  process.stdout.write(JSON.stringify({type:'generation-done',protocolVersion:'1',requestId:wire.requestId,outputPath:bundle.request.job.output.pngPath,seed:bundle.request.job.sampling.seed}) + '\n');
});
`
        await writeFile(executable, script)
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
        } else {
          assert.ok(
            (await client.executeCurrentCanvasRegional(input)).pngBytes.equals(f.outputBytes),
          )
        }
        await client.close()
        client = undefined
      }
      const observed = (await readFile(received, 'utf8'))
        .trim()
        .split('\n')
        .map(
          (line) =>
            JSON.parse(line) as { initializationProfile: null; vae: unknown; vaePrecision: string },
        )
      assert.deepEqual(observed, [
        { initializationProfile: null, vae: wire(f), vaePrecision: 'FP32' },
      ])
      assert.deepEqual(await readdir(scratch), [])
      assert.deepEqual(
        (await f.queue.loadVerifiedRegionalInput(result.jobIds[0])).payload,
        frozen.payload,
      )
    } finally {
      await client?.close()
    }
  }, true)
})

const V_PREDICTION_CAPABILITY = 'illustrious-regional-v-prediction-v1'

async function selectVPrediction(
  f: Fixture,
  saved: 'epsilon' | 'v_prediction' = 'v_prediction',
  resolved: 'epsilon' | 'v_prediction' = saved,
) {
  f.reference.predictionType = saved
  f.controls.resolvedPredictionType = resolved
  f.controls.ready.capabilities = [...f.controls.ready.capabilities, V_PREDICTION_CAPABILITY]
  await f.edit((document) => {
    document.generationDraft.model = structuredClone(f.reference)
  })
  await f.projects.save(f.tabId)
}

test('regional V TXT keeps the resolved objective noise policy and selected VAE through real queue and dispatch', async () => {
  await withFixture(async (f) => {
    await selectVPrediction(f)
    await select(f, true, 'FP32')
    const before = structuredClone(f.document())
    const result = await queued(f)
    await settled(f, result.jobIds)
    const frozen = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    assert.equal(frozen.payload.workerJob.checkpoint.predictionType, 'v_prediction')
    assert.equal(frozen.payload.context.model.reference.predictionType, 'v_prediction')
    assert.deepEqual(frozen.payload.workerJob.sampling.noiseProfile, {
      baseSchedule: 'sdxl-scaled-linear-v1',
      rescaleBetasZeroSnr: false,
      schemaVersion: 1,
      timestepSpacing: 'leading',
    })
    assert.deepEqual(f.consumed[0].request.job.checkpoint, frozen.payload.workerJob.checkpoint)
    assert.equal(f.consumed[0].request.type, 'generate-illustrious-txt2img')
    assert.equal(f.consumed[0].request.job.sampling.scheduler, 'euler')
    assert.deepEqual(f.consumed[0].request.job.vae, wire(f))
    assert.equal(f.consumed[0].request.job.vaePrecision, 'FP32')
    assert.equal((await f.actions.getState(f.tabId)).regionalVPredictionSupported, true)
    assert.equal(
      (await f.queue.getManagerEntry(result.jobIds[0])).details?.sampling.predictionType,
      'v_prediction',
    )
    assert.deepEqual(f.document(), before)
  })
})

test('regional V refuses a legacy peer after authoritative resolution without queue files or publication', async () => {
  await withFixture(async (f) => {
    await selectVPrediction(f)
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (c) => c !== V_PREDICTION_CAPABILITY,
    )
    const before = await snapshot(f)
    const draft = structuredClone(f.document())
    const compose = f.calls.compose.length
    await assert.rejects(f.actions.generate(f.tabId, options(f)), {
      code: 'INFERENCE_UNAVAILABLE',
    })
    assert.deepEqual(await snapshot(f), before)
    assert.deepEqual(f.document(), draft)
    assert.equal(f.calls.compose.length, compose + 1)
    assert.equal(f.calls.checkpoint, 1)
    assert.equal(f.consumed.length, 0)
    assert.equal((await f.actions.getState(f.tabId)).regionalVPredictionSupported, false)
  })
})

test('regional actual resolver V override cannot borrow an epsilon peer and is frozen when explicitly qualified', async () => {
  await withFixture(async (f) => {
    await selectVPrediction(f, 'epsilon', 'v_prediction')
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (c) => c !== V_PREDICTION_CAPABILITY,
    )
    const before = await snapshot(f)
    await assert.rejects(
      f.actions.generate(f.tabId, options(f)),
      /qualified Regional Guidance v_prediction/,
    )
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.consumed.length, 0)
    f.controls.ready.capabilities = [...f.controls.ready.capabilities, V_PREDICTION_CAPABILITY]
    const result = await queued(f)
    await settled(f, result.jobIds)
    const frozen = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    assert.equal(f.document().generationDraft.model?.predictionType, 'epsilon')
    assert.equal(frozen.payload.context.model.reference.predictionType, 'v_prediction')
    assert.equal(frozen.payload.workerJob.checkpoint.predictionType, 'v_prediction')
  })
})

test('regional V actual opaque target on a legacy V TXT peer refuses before publishing any member or regional sidecar', async () => {
  await withFixture(async (f) => {
    await selectVPrediction(f)
    const before = await snapshot(f)
    await assert.rejects(
      f.actions.generate(f.tabId, options(f, 2)),
      /qualified Regional Guidance v_prediction image modes/,
    )
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.consumed.length, 0)
  }, true)
})

test('regional V frozen Retry follows its original objective after current epsilon draft and peer edits', async () => {
  await withFixture(async (f) => {
    await selectVPrediction(f)
    f.controls.failSeeds.add(123)
    const result = await queued(f)
    const [source] = await settled(f, result.jobIds)
    assert.equal(source.status, 'failed')
    const frozen = await f.queue.loadVerifiedRegionalInput(source.id)
    await f.edit((document) => {
      document.regionalGuidance = []
      document.generationDraft.model = null
      document.generationDraft.positivePrompt.text = 'Later ordinary draft'
      document.generationDraft.seed.value = 999
    })
    await f.projects.save(f.tabId)
    f.controls.failSeeds.clear()
    const ready = structuredClone(f.controls.ready)
    f.controls.ready.capabilities = ready.capabilities.filter((c) => c !== V_PREDICTION_CAPABILITY)
    const before = await rows(f)
    await assert.rejects(
      f.actions.retryJob({ id: source.id, statusSequence: source.status_sequence }),
      { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
    )
    assert.deepEqual(await rows(f), before)
    f.controls.ready = ready
    await f.actions.retryJob({ id: source.id, statusSequence: source.status_sequence })
    const retry = (await rows(f)).find((row) => row.id !== source.id)
    assert.ok(retry)
    await settled(f, [retry.id])
    assert.deepEqual((await f.queue.loadVerifiedRegionalInput(retry.id)).payload, frozen.payload)
    assert.equal(f.consumed.at(-1)?.request.job.checkpoint.predictionType, 'v_prediction')
    assert.equal(f.document().generationDraft.model, null)
    assert.equal(f.calls.compose.length, 1)
  })
})

test('regional private epsilon profile still refuses V despite the new public capability', async () => {
  await withFixture(async (f) => {
    await selectVPrediction(f)
    const before = await snapshot(f)
    await assert.rejects(f.coordinator.submit(f.tabId, f.input()), {
      code: 'UNSUPPORTED',
      message: 'The Project does not match the private Illustrious regional profile.',
    })
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.calls.compose.length, 0)
  })
})

test('regional V JSONL dispatch requires the actual ready combination before staging or send', async () => {
  await withFixture(async (f) => {
    await selectVPrediction(f)
    const result = await queued(f)
    await settled(f, result.jobIds)
    const frozen = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    const runtime = path.join(f.root, 'v-prediction-jsonl-runtime')
    const scratch = path.join(f.root, 'v-prediction-jsonl-scratch')
    const received = path.join(f.root, 'v-prediction-jsonl-received.jsonl')
    await mkdir(runtime)
    await mkdir(scratch, { mode: 0o700 })
    const executable = path.join(runtime, 'python')
    let client: GenerationWorkerClient | undefined
    try {
      for (const support of [false, true]) {
        const input = structuredClone(frozen.input)
        input.request.requestId = randomUUID()
        const ready = {
          ...f.controls.ready,
          capabilities: [
            ...f.controls.ready.capabilities.filter((c) => c !== V_PREDICTION_CAPABILITY),
            ...(support ? [V_PREDICTION_CAPABILITY] : []),
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
if(!validArgs) process.exit(21);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
process.stdout.write(JSON.stringify(${JSON.stringify(ready)}) + '\n');
require('node:readline').createInterface({input:process.stdin}).on('line', line => {
 const wire=JSON.parse(line); if(wire.type !== 'execute-current-canvas-regional') throw Error('Wrong owner');
 const raw=fs.readFileSync(wire.bundle.path); if(raw.length!==wire.bundle.byteSize || hash(raw)!==wire.bundle.sha256) throw Error('Bundle mismatch');
 const bundle=JSON.parse(raw); if(bundle.request.type!=='generate-illustrious-txt2img' || bundle.request.job.checkpoint.predictionType!=='v_prediction') throw Error('Lost objective');
 fs.appendFileSync(${JSON.stringify(received)}, JSON.stringify(bundle.request.job.checkpoint)+'\n');
 fs.writeFileSync(bundle.request.job.output.pngPath,Buffer.from(${JSON.stringify(f.outputBytes.toString('base64'))},'base64'),{flag:'wx'});
 process.stdout.write(JSON.stringify({type:'generation-done',protocolVersion:'1',requestId:wire.requestId,outputPath:bundle.request.job.output.pngPath,seed:bundle.request.job.sampling.seed})+'\n');
});
`
        await writeFile(executable, script)
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
        } else {
          assert.ok(
            (await client.executeCurrentCanvasRegional(input)).pngBytes.equals(f.outputBytes),
          )
        }
        await client.close()
        client = undefined
      }
      assert.deepEqual(
        (await readFile(received, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as unknown),
        [frozen.payload.workerJob.checkpoint],
      )
      assert.deepEqual(await readdir(scratch), [])
    } finally {
      await client?.close()
    }
  })
})

test('regional epsilon completion remains available on its unchanged peer without V capability', async () => {
  await withFixture(async (f) => {
    assert.equal(f.controls.ready.capabilities.includes(V_PREDICTION_CAPABILITY), false)
    const result = await queued(f)
    await settled(f, result.jobIds)
    assert.equal(f.consumed[0].request.job.checkpoint.predictionType, 'epsilon')
    assert.equal((await f.actions.getState(f.tabId)).regionalVPredictionSupported, false)
    assert.equal(
      (await f.queue.getManagerEntry(result.jobIds[0])).details?.sampling.predictionType,
      'epsilon',
    )
  })
})

test('regional stale saved V label defers to actual epsilon resolver output on a legacy regional peer', async () => {
  await withFixture(async (f) => {
    await selectVPrediction(f, 'v_prediction', 'epsilon')
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (c) => c !== V_PREDICTION_CAPABILITY,
    )
    const result = await queued(f)
    await settled(f, result.jobIds)
    const frozen = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
    assert.equal(f.document().generationDraft.model?.predictionType, 'v_prediction')
    assert.equal(frozen.payload.context.model.reference.predictionType, 'epsilon')
    assert.equal(frozen.payload.workerJob.checkpoint.predictionType, 'epsilon')
    assert.equal(f.consumed[0].request.job.checkpoint.predictionType, 'epsilon')
    assert.equal((await f.actions.getState(f.tabId)).regionalVPredictionSupported, false)
  })
})

// InvokeAI b0ac163b: Canvas graftImageToImage/graftOutpaint precede addRegionalGuidance;
// get_scheduler forwards the same exact UNet objective through either source mode.
// The following tests exercise Main ownership with controlled numerical/LaMa substitutes.
const V_IMAGE_CAPABILITY = 'illustrious-regional-v-prediction-image-v1'

async function selectVImage(
  f: Fixture,
  saved: 'epsilon' | 'v_prediction' = 'v_prediction',
  resolved: 'epsilon' | 'v_prediction' = saved,
) {
  await selectVPrediction(f, saved, resolved)
  f.controls.ready.capabilities = [...f.controls.ready.capabilities, V_IMAGE_CAPABILITY]
}

for (const mode of ['img2img', 'outpaint'] as const) {
  const fixtureMode = mode === 'outpaint' ? 'outpaint' : true
  test(`regional V ${mode} freezes source objective policy strength and VAE through actual queue dispatch`, async () => {
    await withFixture(async (f) => {
      await selectVImage(f)
      await select(f, true, 'FP32')
      const authored = structuredClone(f.document())
      const saved = await readFile(f.packagePath)
      const result = await queued(f)
      assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
      const frozen = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      assert.equal(frozen.payload.kind, `illustrious-regional-${mode}`)
      assert.equal(frozen.input.request.type, `generate-illustrious-${mode}`)
      assert.ok(
        frozen.input.request.type === 'generate-illustrious-img2img' ||
          frozen.input.request.type === 'generate-illustrious-outpaint',
      )
      assert.equal(frozen.input.request.job.checkpoint.predictionType, 'v_prediction')
      assert.equal(frozen.payload.context.model.reference.predictionType, 'v_prediction')
      assert.equal(frozen.input.request.job.sampling.denoisingStrength, 0.5)
      assert.equal(frozen.input.request.job.sampling.scheduler, 'euler')
      assert.deepEqual(frozen.input.request.job.sampling.noiseProfile, {
        baseSchedule: 'sdxl-scaled-linear-v1',
        rescaleBetasZeroSnr: false,
        schemaVersion: 1,
        timestepSpacing: 'leading',
      })
      assert.equal(frozen.input.initializationProfile, undefined)
      assertFrozen(f, frozen)
      assert.equal(f.consumed.length, 1)
      assert.deepEqual(f.consumed[0].request.job, frozen.input.request.job)
      const target = await readFile(frozen.input.request.job.target.path)
      assert.equal(regionalProjectDigest(target), frozen.input.request.job.target.sha256)
      assert.equal(target.length, frozen.input.request.job.target.byteSize)
      assert.equal((await f.actions.getState(f.tabId)).regionalVPredictionImageSupported, true)
      assert.equal(
        (await f.queue.getManagerEntry(result.jobIds[0])).details?.sampling.predictionType,
        'v_prediction',
      )
      assert.equal((await f.staging.listVerifiedCandidates(f.tabId)).length, 1)
      assert.deepEqual(f.document(), authored)
      assert.ok((await readFile(f.packagePath)).equals(saved))
    }, fixtureMode)
  })

  test(`regional V ${mode} legacy image peer refuses atomically after actual resolution`, async () => {
    await withFixture(async (f) => {
      await selectVImage(f)
      f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
        (c) => c !== V_IMAGE_CAPABILITY,
      )
      const before = await snapshot(f)
      const draft = structuredClone(f.document())
      const saved = await readFile(f.packagePath)
      await assert.rejects(f.actions.generate(f.tabId, options(f, 2)), {
        code: 'INFERENCE_UNAVAILABLE',
        message: 'The image engine has not qualified Regional Guidance v_prediction image modes.',
      })
      assert.deepEqual(await snapshot(f), before)
      assert.deepEqual(f.document(), draft)
      assert.ok((await readFile(f.packagePath)).equals(saved))
      assert.equal(f.calls.compose.length, 1)
      assert.equal(f.calls.checkpoint, 1)
      assert.equal(f.consumed.length, 0)
      assert.equal((await f.actions.getState(f.tabId)).regionalVPredictionSupported, true)
      assert.equal((await f.actions.getState(f.tabId)).regionalVPredictionImageSupported, false)
    }, fixtureMode)
  })

  test(`regional ${mode} actual V override needs the image peer despite a saved epsilon label`, async () => {
    await withFixture(async (f) => {
      await selectVImage(f, 'epsilon', 'v_prediction')
      f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
        (c) => c !== V_IMAGE_CAPABILITY,
      )
      const before = await snapshot(f)
      await assert.rejects(
        f.actions.generate(f.tabId, options(f)),
        /qualified Regional Guidance v_prediction image modes/,
      )
      assert.deepEqual(await snapshot(f), before)
      assert.equal(f.consumed.length, 0)
      f.controls.ready.capabilities = [...f.controls.ready.capabilities, V_IMAGE_CAPABILITY]
      const result = await queued(f)
      assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
      const frozen = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      assert.equal(f.document().generationDraft.model?.predictionType, 'epsilon')
      assert.equal(frozen.payload.workerJob.checkpoint.predictionType, 'v_prediction')
      assert.equal(frozen.payload.context.model.reference.predictionType, 'v_prediction')
    }, fixtureMode)
  })

  test(`regional ${mode} stale saved V still uses actual epsilon on an unchanged image peer`, async () => {
    await withFixture(async (f) => {
      await selectVImage(f, 'v_prediction', 'epsilon')
      f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
        (c) => c !== V_IMAGE_CAPABILITY && c !== V_PREDICTION_CAPABILITY,
      )
      const result = await queued(f)
      assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
      const frozen = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      assert.equal(f.document().generationDraft.model?.predictionType, 'v_prediction')
      assert.equal(frozen.payload.workerJob.checkpoint.predictionType, 'epsilon')
      assert.equal(frozen.payload.context.model.reference.predictionType, 'epsilon')
      assert.equal(f.consumed[0].request.job.checkpoint.predictionType, 'epsilon')
      assert.equal((await f.actions.getState(f.tabId)).regionalVPredictionImageSupported, false)
    }, fixtureMode)
  })

  test(`regional V ${mode} frozen Retry owns original source and strength after saved authoring changes`, async () => {
    await withFixture(async (f) => {
      await selectVImage(f)
      await select(f, true, 'FP32')
      f.controls.failSeeds.add(123)
      const result = await queued(f)
      const [source] = await settled(f, result.jobIds)
      assert.equal(source.status, 'failed')
      const frozen = await f.queue.loadVerifiedRegionalInput(source.id)
      const target = await readFile(frozen.input.request.job.target.path)
      await f.edit((document) => {
        document.generationDraft.model = null
        document.generationDraft.vae = structuredClone(f.resources.B.descriptor.reference)
        document.generationDraft.vaePrecision = 'FP16'
        document.generationDraft.sampling.denoisingStrength = 0.9
        document.generationDraft.sampling.sampler = 'Euler a'
        document.generationDraft.positivePrompt.text = 'Saved later draft'
        document.generationDraft.seed.value = 999
        document.regionalGuidance = []
      })
      await f.projects.save(f.tabId)
      const authored = structuredClone(f.document())
      const saved = await readFile(f.packagePath)
      const before = await snapshot(f)
      const capable = structuredClone(f.controls.ready)
      f.controls.ready.capabilities = capable.capabilities.filter((c) => c !== V_IMAGE_CAPABILITY)
      await assert.rejects(
        f.actions.retryJob({ id: source.id, statusSequence: source.status_sequence }),
        { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
      )
      assert.deepEqual(await snapshot(f), before)
      assert.equal(f.consumed.length, 1)
      f.controls.ready = capable
      f.controls.failSeeds.clear()
      await f.actions.retryJob({ id: source.id, statusSequence: source.status_sequence })
      const retry = (await rows(f)).find((row) => row.id !== source.id)
      assert.ok(retry)
      assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
      const replay = await f.queue.loadVerifiedRegionalInput(retry.id)
      assert.deepEqual(replay.payload, frozen.payload)
      assert.deepEqual(f.consumed.at(-1)?.recipe, frozen.input.recipe)
      assert.equal(f.consumed.at(-1)?.request.job.checkpoint.predictionType, 'v_prediction')
      const consumed = f.consumed.at(-1)
      assert.ok(consumed)
      assert.ok(
        consumed.request.type === 'generate-illustrious-img2img' ||
          consumed.request.type === 'generate-illustrious-outpaint',
      )
      assert.equal(consumed.request.job.sampling.denoisingStrength, 0.5)
      assert.ok((await readFile(replay.input.request.job.target.path)).equals(target))
      assert.equal(f.calls.compose.length, 1)
      assert.deepEqual(f.document(), authored)
      assert.ok((await readFile(f.packagePath)).equals(saved))
    }, fixtureMode)
  })

  test(`regional V ${mode} actual JSONL peer requires image support and preserves source strength and objective on send`, async () => {
    await withFixture(async (f) => {
      await selectVImage(f)
      const result = await queued(f)
      assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
      const frozen = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      const target = await readFile(frozen.input.request.job.target.path)
      const alpha =
        mode === 'outpaint'
          ? deriveOutpaintContributionAlphaV1(decodeTargetPngAlpha(target, 64, 64), 64, 64)
          : null
      const output = alpha
        ? literalSmartPatchColorPng(
            64,
            64,
            Array.from({ length: 4096 }, (_, i) => [17, i % 251, 91, alpha[i]]).flat(),
            4,
          )
        : f.outputBytes
      const runtime = path.join(f.root, `v-${mode}-jsonl-runtime`)
      const scratch = path.join(f.root, `v-${mode}-jsonl-scratch`)
      const received = path.join(f.root, `v-${mode}-jsonl-received.jsonl`)
      await mkdir(runtime)
      await mkdir(scratch, { mode: 0o700 })
      const executable = path.join(runtime, 'python')
      for (const support of [false, true]) {
        const ready = {
          ...f.controls.ready,
          capabilities: [
            ...f.controls.ready.capabilities.filter((c) => c !== V_IMAGE_CAPABILITY),
            ...(support ? [V_IMAGE_CAPABILITY] : []),
            ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : []),
          ],
          pythonVersion: '3.12.13',
          type: 'ready',
        }
        const script = String.raw`#!${process.execPath}
const fs=require('node:fs'), crypto=require('node:crypto');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
process.stdout.write(JSON.stringify(${JSON.stringify(ready)})+'\n');
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const wire=JSON.parse(line); if(wire.type!=='execute-current-canvas-regional') throw Error('Wrong owner');
 const raw=fs.readFileSync(wire.bundle.path); if(raw.length!==wire.bundle.byteSize || hash(raw)!==wire.bundle.sha256) throw Error('Bundle mismatch');
 const bundle=JSON.parse(raw), request=bundle.request, job=request.job;
 if(request.type!==${JSON.stringify(`generate-illustrious-${mode}`)} || job.checkpoint.predictionType!=='v_prediction' || job.sampling.scheduler!=='euler' || job.sampling.denoisingStrength!==0.5 || bundle.initializationProfile!==undefined) throw Error('Source execution changed');
 const target=fs.readFileSync(job.target.path); if(target.length!==job.target.byteSize || hash(target)!==job.target.sha256) throw Error('Lost source association');
 fs.appendFileSync(${JSON.stringify(received)},JSON.stringify({checkpoint:job.checkpoint,target:job.target,targetBytes:target.toString('base64'),strength:job.sampling.denoisingStrength})+'\n');
 fs.writeFileSync(job.output.pngPath,Buffer.from(${JSON.stringify(output.toString('base64'))},'base64'),{flag:'wx'});
 process.stdout.write(JSON.stringify({type:'generation-done',protocolVersion:'1',requestId:wire.requestId,outputPath:job.output.pngPath,seed:job.sampling.seed})+'\n');
});
`
        await writeFile(executable, script)
        await chmod(executable, 0o700)
        const client = await GenerationWorkerClient.start(
          { pythonExecutable: executable, runtimeRoot: runtime, scratchBasePath: scratch },
          { requestTimeoutMs: 3000, shutdownWaitMs: 100 },
        )
        try {
          const input = structuredClone(frozen.input)
          input.request.requestId = randomUUID()
          if (support) {
            assert.ok((await client.executeCurrentCanvasRegional(input)).pngBytes.equals(output))
          } else {
            await assert.rejects(client.executeCurrentCanvasRegional(input), {
              code: 'WORKER_VERSION_MISMATCH',
            })
            assert.equal(await readFile(received, 'utf8').catch(() => ''), '')
          }
          assert.deepEqual(await readdir(scratch), [])
          assert.deepEqual(
            (await f.queue.loadVerifiedRegionalInput(result.jobIds[0])).payload,
            frozen.payload,
          )
        } finally {
          await client.close()
        }
      }
      const observations = (await readFile(received, 'utf8'))
        .trim()
        .split('\n')
        .map(
          (line) =>
            JSON.parse(line) as {
              checkpoint: unknown
              strength: number
              target: typeof frozen.input.request.job.target
              targetBytes: string
            },
        )
      assert.equal(observations.length, 1)
      const observed = observations[0]
      // The real client transfers its verified target into its own staging lifetime.
      assert.equal(path.dirname(path.dirname(observed.target.path)), scratch)
      assert.ok(path.basename(path.dirname(observed.target.path)).startsWith('regional-request-'))
      assert.equal(path.basename(observed.target.path), 'target.png')
      assert.notEqual(observed.target.path, frozen.input.request.job.target.path)
      assert.deepEqual(observed, {
        checkpoint: frozen.input.request.job.checkpoint,
        strength: 0.5,
        target: { ...frozen.input.request.job.target, path: observed.target.path },
        targetBytes: target.toString('base64'),
      })
    }, fixtureMode)
  })
}

const V_SAMPLING_CAPABILITY = 'illustrious-regional-v-prediction-sampling-v1'
const V_SAMPLING_METHODS = [
  { sampler: 'Euler a', scheduler: 'Normal', worker: 'euler_a' },
  { sampler: 'DPM++ 2M', scheduler: 'Normal', worker: 'dpmpp_2m' },
  { sampler: 'DPM++ 2M', scheduler: 'Karras', worker: 'dpmpp_2m_k' },
] as const

type VSamplingMode = 'img2img' | 'outpaint' | 'txt2img'

async function selectVSampling(
  f: Fixture,
  mode: VSamplingMode,
  method: (typeof V_SAMPLING_METHODS)[number],
  saved: 'epsilon' | 'v_prediction' = 'v_prediction',
  resolved: 'epsilon' | 'v_prediction' = saved,
) {
  await selectVPrediction(f, saved, resolved)
  f.controls.ready.capabilities = [
    ...f.controls.ready.capabilities,
    V_SAMPLING_CAPABILITY,
    'illustrious-regional-dpmpp-2m-v1',
    ...(mode === 'txt2img' ? [] : [V_IMAGE_CAPABILITY]),
  ]
  await f.edit((document) => {
    document.generationDraft.sampling.sampler = method.sampler
    document.generationDraft.sampling.scheduler = method.scheduler
  })
  await f.projects.save(f.tabId)
}

for (const mode of ['txt2img', 'img2img', 'outpaint'] as const) {
  const fixtureMode = mode === 'txt2img' ? false : mode === 'img2img' ? true : 'outpaint'
  for (const method of V_SAMPLING_METHODS) {
    test(`regional V ${mode} ${method.sampler} ${method.scheduler} freezes the actual method policy and matching initialization through dispatch`, async () => {
      await withFixture(async (f) => {
        await selectVSampling(f, mode, method)
        const authored = structuredClone(f.document())
        const saved = await readFile(f.packagePath)
        const result = await queued(f, 2)
        assert.deepEqual(
          (await settled(f, result.jobIds)).map((row) => row.status),
          ['completed', 'completed'],
        )
        assert.equal(f.consumed.length, 2)
        for (const id of result.jobIds) {
          const frozen = await f.queue.loadVerifiedRegionalInput(id)
          assert.equal(frozen.input.request.type, `generate-illustrious-${mode}`)
          assert.equal(frozen.payload.kind, `illustrious-regional-${mode}`)
          assert.equal(frozen.payload.workerJob.checkpoint.predictionType, 'v_prediction')
          assert.equal(frozen.payload.context.model.reference.predictionType, 'v_prediction')
          assert.equal(frozen.payload.workerJob.sampling.scheduler, method.worker)
          assert.deepEqual(frozen.payload.workerJob.sampling.noiseProfile, {
            baseSchedule: 'sdxl-scaled-linear-v1',
            rescaleBetasZeroSnr: false,
            schemaVersion: 1,
            timestepSpacing: 'leading',
          })
          assert.equal(
            frozen.payload.initializationProfile,
            mode === 'txt2img' ? 'invoke-cpu-f32-add-noise-v1' : undefined,
          )
          const consumed = f.consumed.find(
            (entry) => entry.request.job.output.pngPath === frozen.input.request.job.output.pngPath,
          )
          assert.ok(consumed)
          assert.equal(consumed.request.job.sampling.scheduler, method.worker)
          assert.equal(consumed.request.job.checkpoint.predictionType, 'v_prediction')
          assert.equal(
            consumed.initializationProfile,
            mode === 'txt2img' ? 'invoke-cpu-f32-add-noise-v1' : undefined,
          )
          if (
            consumed.request.type === 'generate-illustrious-img2img' ||
            consumed.request.type === 'generate-illustrious-outpaint'
          ) {
            assert.equal(consumed.request.job.sampling.denoisingStrength, 0.5)
          }
          const bytes = await readFile(frozen.input.request.job.target.path)
          assert.equal(regionalProjectDigest(bytes), frozen.input.request.job.target.sha256)
        }
        assert.equal((await f.actions.getState(f.tabId)).regionalVPredictionSamplingSupported, true)
        assert.deepEqual(f.document(), authored)
        assert.ok((await readFile(f.packagePath)).equals(saved))
      }, fixtureMode)
    })
  }

  test(`regional V ${mode} sampling legacy peer refuses atomically after actual resolution`, async () => {
    await withFixture(async (f) => {
      await selectVSampling(f, mode, V_SAMPLING_METHODS[2])
      f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
        (c) => c !== V_SAMPLING_CAPABILITY,
      )
      const authored = structuredClone(f.document())
      const before = await snapshot(f)
      const saved = await readFile(f.packagePath)
      await assert.rejects(f.actions.generate(f.tabId, options(f, 2)), {
        code: 'INFERENCE_UNAVAILABLE',
        message:
          'The image engine has not qualified Regional Guidance v_prediction sampling methods.',
      })
      assert.deepEqual(await snapshot(f), before)
      assert.equal(f.calls.checkpoint, 1)
      assert.equal(f.calls.compose.length, 1)
      assert.equal(f.consumed.length, 0)
      assert.deepEqual(f.document(), authored)
      assert.ok((await readFile(f.packagePath)).equals(saved))
    }, fixtureMode)
  })

  test(`regional V ${mode} sampling actual override requires the new peer despite a saved epsilon label`, async () => {
    await withFixture(async (f) => {
      await selectVSampling(f, mode, V_SAMPLING_METHODS[0], 'epsilon', 'v_prediction')
      const capable = structuredClone(f.controls.ready)
      f.controls.ready.capabilities = capable.capabilities.filter(
        (c) => c !== V_SAMPLING_CAPABILITY,
      )
      const before = await snapshot(f)
      await assert.rejects(
        f.actions.generate(f.tabId, options(f)),
        /qualified Regional Guidance v_prediction sampling methods/,
      )
      assert.deepEqual(await snapshot(f), before)
      f.controls.ready = capable
      const result = await queued(f)
      assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
      const frozen = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      assert.equal(f.document().generationDraft.model?.predictionType, 'epsilon')
      assert.equal(frozen.payload.workerJob.checkpoint.predictionType, 'v_prediction')
      assert.equal(frozen.payload.workerJob.sampling.scheduler, 'euler_a')
      assert.equal(
        frozen.payload.initializationProfile,
        mode === 'txt2img' ? 'invoke-cpu-f32-add-noise-v1' : undefined,
      )
    }, fixtureMode)
  })

  test(`regional ${mode} sampling saved V label still resolves epsilon on the unchanged sampler peer`, async () => {
    await withFixture(async (f) => {
      await selectVSampling(f, mode, V_SAMPLING_METHODS[1], 'v_prediction', 'epsilon')
      f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
        (c) => ![V_IMAGE_CAPABILITY, V_PREDICTION_CAPABILITY, V_SAMPLING_CAPABILITY].includes(c),
      )
      const result = await queued(f)
      assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
      const frozen = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
      assert.equal(f.document().generationDraft.model?.predictionType, 'v_prediction')
      assert.equal(frozen.payload.workerJob.checkpoint.predictionType, 'epsilon')
      assert.equal(frozen.payload.workerJob.sampling.scheduler, 'dpmpp_2m')
      assert.equal((await f.actions.getState(f.tabId)).regionalVPredictionSamplingSupported, false)
    }, fixtureMode)
  })

  test(`regional V ${mode} sampling frozen Retry preserves method initializer source and policy after saved Euler edits`, async () => {
    await withFixture(async (f) => {
      await selectVSampling(f, mode, V_SAMPLING_METHODS[2])
      await select(f, true, 'FP32')
      f.controls.failSeeds.add(123)
      const result = await queued(f)
      const [source] = await settled(f, result.jobIds)
      assert.equal(source.status, 'failed')
      const frozen = await f.queue.loadVerifiedRegionalInput(source.id)
      const bytes = await readFile(frozen.input.request.job.target.path)
      await f.edit((document) => {
        document.generationDraft.model = null
        document.generationDraft.vae = structuredClone(f.resources.B.descriptor.reference)
        document.generationDraft.vaePrecision = 'FP16'
        document.generationDraft.sampling.sampler = 'Euler'
        document.generationDraft.sampling.scheduler = 'Normal'
        document.generationDraft.sampling.denoisingStrength = 0.9
        document.generationDraft.positivePrompt.text = 'Saved later Euler authoring'
        document.generationDraft.seed.value = 999
        document.regionalGuidance = []
      })
      await f.projects.save(f.tabId)
      const authored = structuredClone(f.document())
      const saved = await readFile(f.packagePath)
      const before = await snapshot(f)
      const capable = structuredClone(f.controls.ready)
      f.controls.ready.capabilities = capable.capabilities.filter(
        (c) => c !== V_SAMPLING_CAPABILITY,
      )
      await assert.rejects(
        f.actions.retryJob({ id: source.id, statusSequence: source.status_sequence }),
        { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
      )
      assert.deepEqual(await snapshot(f), before)
      assert.equal(f.consumed.length, 1)
      f.controls.ready = capable
      f.controls.failSeeds.clear()
      await f.actions.retryJob({ id: source.id, statusSequence: source.status_sequence })
      const retry = (await rows(f)).find((row) => row.id !== source.id)
      assert.ok(retry)
      assert.equal((await settled(f, [retry.id]))[0].status, 'completed')
      const replay = await f.queue.loadVerifiedRegionalInput(retry.id)
      assert.deepEqual(replay.payload, frozen.payload)
      const consumed = f.consumed.at(-1)
      assert.ok(consumed)
      assert.deepEqual(consumed.recipe, frozen.input.recipe)
      assert.equal(consumed.request.job.sampling.scheduler, 'dpmpp_2m_k')
      assert.equal(consumed.request.job.checkpoint.predictionType, 'v_prediction')
      assert.equal(
        consumed.initializationProfile,
        mode === 'txt2img' ? 'invoke-cpu-f32-add-noise-v1' : undefined,
      )
      assert.ok((await readFile(replay.input.request.job.target.path)).equals(bytes))
      assert.equal(f.calls.compose.length, 1)
      assert.deepEqual(f.document(), authored)
      assert.ok((await readFile(f.packagePath)).equals(saved))
    }, fixtureMode)
  })
}

for (const mode of ['txt2img', 'img2img', 'outpaint'] as const) {
  test(`regional V ${mode} sampling actual JSONL legacy peer refuses before staging while qualified peer consumes exact method initializer and source`, async () => {
    await withFixture(
      async (f) => {
        await selectVSampling(f, mode, V_SAMPLING_METHODS[2])
        const result = await queued(f)
        assert.equal((await settled(f, result.jobIds))[0].status, 'completed')
        const frozen = await f.queue.loadVerifiedRegionalInput(result.jobIds[0])
        const target = await readFile(frozen.input.request.job.target.path)
        const alpha =
          mode === 'outpaint'
            ? deriveOutpaintContributionAlphaV1(decodeTargetPngAlpha(target, 64, 64), 64, 64)
            : null
        const output = alpha
          ? literalSmartPatchColorPng(
              64,
              64,
              Array.from({ length: 4096 }, (_, i) => [17, i % 251, 91, alpha[i]]).flat(),
              4,
            )
          : f.outputBytes
        const runtime = path.join(f.root, `v-${mode}-sampling-jsonl-runtime`)
        const scratch = path.join(f.root, `v-${mode}-sampling-jsonl-scratch`)
        const received = path.join(f.root, `v-${mode}-sampling-jsonl-received.jsonl`)
        await mkdir(runtime)
        await mkdir(scratch, { mode: 0o700 })
        const executable = path.join(runtime, 'python')
        for (const support of [false, true]) {
          const ready = {
            ...f.controls.ready,
            capabilities: [
              ...f.controls.ready.capabilities.filter((c) => c !== V_SAMPLING_CAPABILITY),
              ...(support ? [V_SAMPLING_CAPABILITY] : []),
              ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : []),
            ],
            pythonVersion: '3.12.13',
            type: 'ready',
          }
          const script = String.raw`#!${process.execPath}
const fs=require('node:fs'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
process.stdout.write(JSON.stringify(${JSON.stringify(ready)})+'\n');
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const wire=JSON.parse(line);if(wire.type!=='execute-current-canvas-regional')throw Error('Wrong owner');
 const bytes=fs.readFileSync(wire.bundle.path);if(hash(bytes)!==wire.bundle.sha256 || bytes.length!==wire.bundle.byteSize)throw Error('Bundle changed');
 const bundle=JSON.parse(bytes),request=bundle.request,job=request.job,init=bundle.initializationProfile??null;
 if(request.type!==${JSON.stringify(`generate-illustrious-${mode}`)} || job.checkpoint.predictionType!=='v_prediction' || job.sampling.scheduler!=='dpmpp_2m_k' || init!==${JSON.stringify(mode === 'txt2img' ? 'invoke-cpu-f32-add-noise-v1' : null)})throw Error('Frozen sampling changed');
 const source=fs.readFileSync(job.target.path);if(hash(source)!==job.target.sha256 || source.length!==job.target.byteSize)throw Error('Source changed');
 fs.appendFileSync(${JSON.stringify(received)},JSON.stringify({type:request.type,sampling:job.sampling,init,targetPath:job.target.path,sourceHash:hash(source)})+'\n');
 fs.writeFileSync(job.output.pngPath,Buffer.from(${JSON.stringify(output.toString('base64'))},'base64'),{flag:'wx'});
 process.stdout.write(JSON.stringify({type:'generation-done',protocolVersion:'1',requestId:wire.requestId,outputPath:job.output.pngPath,seed:job.sampling.seed})+'\n');
});
`
          await writeFile(executable, script)
          await chmod(executable, 0o700)
          const client = await GenerationWorkerClient.start(
            { pythonExecutable: executable, runtimeRoot: runtime, scratchBasePath: scratch },
            { requestTimeoutMs: 3000, shutdownWaitMs: 100 },
          )
          try {
            const input = structuredClone(frozen.input)
            input.request.requestId = randomUUID()
            if (support) {
              assert.ok((await client.executeCurrentCanvasRegional(input)).pngBytes.equals(output))
            } else {
              await assert.rejects(client.executeCurrentCanvasRegional(input), {
                code: 'WORKER_VERSION_MISMATCH',
              })
              assert.equal(await readFile(received, 'utf8').catch(() => ''), '')
            }
            assert.deepEqual(await readdir(scratch), [])
            assert.deepEqual(
              (await f.queue.loadVerifiedRegionalInput(result.jobIds[0])).payload,
              frozen.payload,
            )
          } finally {
            await client.close()
          }
        }
        const records = (await readFile(received, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as { [key: string]: unknown; targetPath: string })
        assert.equal(records.length, 1)
        const record = records[0]
        assert.equal(path.dirname(path.dirname(record.targetPath)), scratch)
        assert.ok(path.basename(path.dirname(record.targetPath)).startsWith('regional-request-'))
        assert.equal(path.basename(record.targetPath), 'target.png')
        assert.deepEqual(record, {
          init: mode === 'txt2img' ? 'invoke-cpu-f32-add-noise-v1' : null,
          sampling: frozen.input.request.job.sampling,
          sourceHash: regionalProjectDigest(target),
          targetPath: record.targetPath,
          type: frozen.input.request.type,
        })
      },
      mode === 'txt2img' ? false : mode === 'img2img' ? true : 'outpaint',
    )
  })
}
