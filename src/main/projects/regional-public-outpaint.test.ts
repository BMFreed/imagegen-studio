import { LAMA_OUTPAINT_IDENTITY_V1 } from '../../shared/projects/alpha-outpaint.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { supportsInferenceRegionalOutpaint } from '../../shared/projects/inference-worker-capabilities.js'
import { isProjectGenerationActionState } from '../../shared/projects/project-generation-actions.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile, truncate, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'

import type { OutpaintInfillResolver } from '../runtime/inference-auxiliary-resources.js'
import type { RegionalWorkerInput, RegionalWorkerResult } from './regional-worker-request.js'

import { openAppDatabase } from '../db/database.js'
import { ProjectGenerationActionController } from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { freezeAlphaOutpaintConditioning } from './outpaint-conditioning.js'
import { deriveOutpaintContributionAlphaV1 } from './outpaint-contribution.js'
import { provenanceFromVerifiedRasterCandidate } from './project-generation-provenance.js'
import { ProjectRegionalGenerationCoordinator } from './project-regional-generation-coordinator.js'
import { parseAcceptedGenerationBaseV1 } from './regional-queued-generation.js'
import { captureRegionalWorkerInput } from './regional-worker-request.js'
import { classifyTargetPngAlpha, decodeTargetPngAlpha } from './target-png-mode.js'
import {
  createRegionalProjectFixture,
  regionalProjectDigest,
} from './test-fixtures/regional-project.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'

const CAPABILITY = 'illustrious-regional-outpaint-v1'
const OPERATION = 'illustrious-regional-outpaint'
type Fixture = Awaited<ReturnType<typeof fixture>>

/**
 * InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd graftOutpaint derives alpha masks and infills
 * before the same denoiser receives regional guidance. These are real Service/capture/planner,
 * queue/SQLite/files, dispatch, receipt/recovery and accepted-base tests. The compositor, catalog,
 * pinned LaMa resolver and numerical output are controlled substitutes; the sparse file is not
 * genuine LaMa evidence. Native/installed qualification belongs to ROOT's separate execution.
 */
async function fixture() {
  const f = await createRegionalProjectFixture()
  const infillPath = path.join(f.root, 'controlled-lama.pt')
  await writeFile(infillPath, '', { flag: 'wx', mode: 0o600 })
  await truncate(infillPath, LAMA_OUTPAINT_IDENTITY_V1.byteSize)
  const controls = {
    badAlpha: false,
    fail: false,
    failInfill: false,
    hold: null as (() => Promise<void>) | null,
    infillPath,
    marker: 0,
    mode: 'outpaint' as 'img2img' | 'outpaint' | 'txt2img',
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
        'illustrious-regional-img2img-v1',
        'illustrious-regional-img2img-cfg-rescale-v1',
        'illustrious-regional-img2img-euler-a-v1',
        'illustrious-regional-img2img-dpmpp-2m-v1',
        'illustrious-regional-img2img-vae-v1',
        CAPABILITY,
      ],
    },
  }
  const counters = { infill: 0, preparation: 0 }
  const infillResolver: OutpaintInfillResolver = {
    resolveVerifiedOutpaintInfill: async () => {
      counters.infill++
      if (controls.failInfill) {
        throw new Error('Controlled missing pinned infill')
      }
      return { ...LAMA_OUTPAINT_IDENTITY_V1, managedPath: controls.infillPath }
    },
  }
  const sourceBytes = () =>
    literalSmartPatchColorPng(
      64,
      64,
      Array.from({ length: 4096 }, (_, index) => [
        (index + controls.marker * 11) % 256,
        (index * 3 + controls.marker * 17) % 256,
        (index * 7 + controls.marker * 31) % 256,
        controls.mode === 'txt2img'
          ? 0
          : controls.mode === 'img2img'
            ? 255
            : index % 64 < 32
              ? 255
              : index % 64 === 32
                ? 127
                : 0,
      ]).flat(),
      4,
    )
  f.compositionWorker.composeTarget = async (input) => {
    f.calls.compose.push(structuredClone(input))
    await f.hooks.compose?.()
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
      mode: controls.mode,
      rect: { ...f.bbox },
    }
  }
  const orchestrator = new GenerationOrchestrator(
    f.projects,
    f.index,
    f.models,
    f.queue,
    f.staging,
    f.processor,
    f.scratch,
    infillResolver,
  )
  const coordinator = new ProjectRegionalGenerationCoordinator({
    compositionProfile: 'invoke-canvas-v1',
    gate: f.gate,
    models: f.models,
    orchestrator,
    projects: f.projects,
    scratchBasePath: f.scratch,
  })
  const consumed: RegionalWorkerInput[] = []
  const targets: Buffer[] = []
  const outputs: Buffer[] = []
  const runtime: ConstructorParameters<typeof GenerationDispatchCoordinator>[0] &
    ConstructorParameters<typeof ProjectGenerationActionController>[0]['runtime'] = {
    getStatus: async () => null,
    readQualifiedInferenceReady: async () => structuredClone(controls.ready),
    retryUnconfirmedGenerationExit: async () => true,
    withGenerationAdmission: async (_scratch, use) => await use(structuredClone(controls.ready)),
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
            assert.equal(input.request.type, 'generate-illustrious-outpaint')
            if (input.request.type !== 'generate-illustrious-outpaint') {
              assert.fail('Wrong outpaint command')
            }
            consumed.push(structuredClone(input))
            await controls.hold?.()
            const source = await readFile(input.request.job.target.path)
            targets.push(source)
            assert.equal(classifyTargetPngAlpha(source, 64, 64), 'outpaint')
            assert.deepEqual(
              input.request.job.conditioning,
              freezeAlphaOutpaintConditioning({
                bbox: input.recipe.bbox,
                sourceTargetSha256: regionalProjectDigest(source),
                targetPngBytes: source,
              }).context,
            )
            assert.deepEqual(input.request.job.infillResource, {
              ...LAMA_OUTPAINT_IDENTITY_V1,
              path: infillPath,
            })
            assert.equal(input.initializationProfile, undefined)
            if (controls.fail) {
              throw new Error('Controlled regional outpaint inference failure')
            }
            const alpha = deriveOutpaintContributionAlphaV1(
              decodeTargetPngAlpha(source, 64, 64),
              64,
              64,
            )
            const pngBytes = literalSmartPatchColorPng(
              64,
              64,
              Array.from({ length: 4096 }, (_, i) => [
                17,
                i % 251,
                91,
                controls.badAlpha ? 255 : alpha[i],
              ]).flat(),
              4,
            )
            outputs.push(pngBytes)
            onProgress?.({ step: 1, totalSteps: 1 })
            const result: RegionalWorkerResult = {
              output: {
                byteSize: pngBytes.length,
                colorSpace: 'srgb',
                height: 64,
                iccSha256: IGS_SRGB_ICC_SHA256,
                path: path.join(f.root, 'already-consumed.png'),
                sha256: regionalProjectDigest(pngBytes),
                width: 64,
              },
              pngBytes,
              seed: input.request.job.sampling.seed,
            }
            return result
          },
          ready: structuredClone(controls.ready),
        }),
        generate: async () => assert.fail('Regional outpaint must not enter ordinary dispatch.'),
      }),
  }
  const dispatch = new GenerationDispatchCoordinator(
    runtime,
    orchestrator,
    f.processor,
    f.scratch,
    undefined,
    coordinator,
  )
  const actions = new ProjectGenerationActionController({
    dispatch,
    gate: f.gate,
    infillResolver,
    models: f.models,
    orchestrator,
    processor: f.processor,
    projects: f.projects,
    queue: f.queue,
    regional: coordinator,
    runtime,
    scratchBasePath: f.scratch,
    staging: f.staging,
  })
  return {
    ...f,
    actions,
    consumed,
    controls,
    coordinator,
    counters,
    infillPath,
    orchestrator,
    outputs,
    sourceBytes,
    targets,
  }
}

async function withFixture(use: (f: Fixture) => Promise<void>) {
  const f = await fixture()
  try {
    await use(f)
  } finally {
    await f.actions.shutdown()
    await f.coordinator.shutdown()
    await f.close()
  }
}

async function select(f: Fixture, edit?: (document: IgsProjectDocumentV1) => void) {
  await f.edit((document) => {
    document.generationDraft.sampling.denoisingStrength = 0.5
    document.generationDraft.sampling.steps = 3
    document.generationDraft.sampling.sampler = 'Euler'
    document.generationDraft.sampling.scheduler = 'Normal'
    document.generationDraft.vae = null
    document.generationDraft.vaePrecision = 'FP16'
    document.generationDraft.cfgRescale = 0
    edit?.(document)
  })
  await f.projects.save(f.tabId)
  await f.projects.close(f.tabId)
  assert.equal((await f.projects.open(f.tabId)).kind, 'opened')
}

async function rows(f: Fixture) {
  return await f.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute()
}

async function snapshot(f: Fixture) {
  return {
    document: structuredClone(f.document()),
    package: regionalProjectDigest(await readFile(f.packagePath)),
    receipts: await f.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .orderBy('candidate_id')
      .execute(),
    rows: await rows(f),
    scratch: await readdir(f.scratch),
  }
}

async function queueOne(f: Fixture) {
  const result = await f.actions.generate(f.tabId, {
    documentId: f.document().documentId,
    iterations: 1,
  })
  if (result.kind !== 'queued') {
    assert.fail('Expected one source-bound regional outpaint job')
  }
  assert.equal(result.jobIds.length, 1)
  return result.jobIds[0]
}

async function settled(f: Fixture, id: string) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const state = await f.actions.getState(f.tabId)
    const row = (await rows(f)).find((value) => value.id === id)
    assert.ok(row)
    if (state.phase === 'idle' && ['canceled', 'completed', 'failed'].includes(row.status)) {
      return row
    }
    assert.notEqual(state.phase, 'blocked', state.error?.message ?? 'Admission blocked')
    await setImmediate()
  }
  assert.fail('Regional outpaint did not settle')
}

for (const [sampler, scheduler] of [
  ['Euler', 'Normal'],
  ['Euler a', 'Normal'],
  ['DPM++ 2M', 'Normal'],
  ['DPM++ 2M', 'Karras'],
] as const) {
  test(`public regional outpaint ${sampler}/${scheduler} retains actual source, contribution and accepted ordinary provenance`, async () => {
    await withFixture(async (f) => {
      await select(f, (document) => {
        document.generationDraft.sampling.sampler = sampler
        document.generationDraft.sampling.scheduler = scheduler
      })
      const before = structuredClone(f.document())
      const id = await queueOne(f)
      assert.equal((await settled(f, id)).status, 'completed')
      const frozen = await f.queue.loadVerifiedRegionalInput(id)
      assert.equal(frozen.payload.kind, OPERATION)
      if (frozen.payload.kind !== OPERATION) {
        assert.fail('Expected exact regional outpaint operation')
      }
      assert.equal(frozen.payload.context.kind, 'normal-outpaint-preparation')
      assert.deepEqual(frozen.payload.outpaintInfill, {
        ...LAMA_OUTPAINT_IDENTITY_V1,
        path: f.infillPath,
      })
      assert.deepEqual(f.consumed[0].recipe, frozen.input.recipe)
      assert.equal(f.consumed[0].initializationProfile, undefined)
      assert.ok((await readFile(frozen.targetPath)).equals(f.sourceBytes()))
      assert.ok(f.targets[0].equals(f.sourceBytes()))
      assert.equal((await f.queue.getManagerEntry(id)).operation, OPERATION)
      const candidate = (await f.staging.listVerifiedCandidates(f.tabId)).find(
        (value) => value.queueItemId === id,
      )
      assert.ok(candidate)
      assert.ok((await readFile(candidate.assetPath)).equals(f.outputs[0]))
      const accepted = parseAcceptedGenerationBaseV1(candidate.frozenPayloadJson)
      assert.equal(accepted.kind, 'illustrious-outpaint')
      assert.ok(!('regional' in accepted) && !('outpaintInfill' in accepted))
      assert.deepEqual(accepted.context, frozen.payload.context)
      const provenance = provenanceFromVerifiedRasterCandidate({
        acceptedAt: candidate.completedAt,
        candidate,
        imagePngBytes: Buffer.from(f.outputs[0]),
      })
      assert.equal(provenance.kind, 'illustrious-outpaint')
      assert.ok(!JSON.stringify(provenance).includes('regionalGuidance'))
      assert.deepEqual(f.document(), before)
    })
  })
}

test('regional outpaint capability requires ordinary outpaint and regional IMG and remains strictly transient', async () => {
  await withFixture(async (f) => {
    assert.equal(supportsInferenceRegionalOutpaint(f.controls.ready), true)
    for (const capability of [
      CAPABILITY,
      'illustrious-outpaint',
      'illustrious-regional-img2img-v1',
      'illustrious-regional-invoke-v1',
    ]) {
      assert.equal(
        supportsInferenceRegionalOutpaint({
          ...f.controls.ready,
          capabilities: f.controls.ready.capabilities.filter((value) => value !== capability),
        }),
        false,
      )
    }
    const state = await f.actions.getState(f.tabId)
    assert.equal(state.regionalOutpaintSupported, true)
    for (const value of [undefined, true, false]) {
      assert.equal(
        isProjectGenerationActionState({ ...state, regionalOutpaintSupported: value }),
        true,
      )
    }
    for (const value of [null, 1, 'true']) {
      assert.equal(
        isProjectGenerationActionState({ ...state, regionalOutpaintSupported: value }),
        false,
      )
    }
  })
})

test('missing regional outpaint capability refuses actual mixed alpha before infill resolution or SQL', async () => {
  await withFixture(async (f) => {
    await select(f)
    f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
      (value) => value !== CAPABILITY,
    )
    const before = await snapshot(f)
    await assert.rejects(queueOne(f), /outpaint with Regional Guidance/)
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.counters.infill, 0)
    assert.deepEqual(f.consumed, [])
  })
})

test('missing pinned infill refuses mixed-alpha Generate with no row receipt or source-scratch publication', async () => {
  await withFixture(async (f) => {
    await select(f)
    f.controls.failInfill = true
    const before = await snapshot(f)
    await assert.rejects(queueOne(f))
    assert.deepEqual(await snapshot(f), before)
    assert.equal(f.counters.infill, 1)
    assert.deepEqual(f.consumed, [])
  })
})

test('frozen regional outpaint Retry consumes original pixels, masks, sampler, strength and infill after saved authoring changes', async () => {
  await withFixture(async (f) => {
    await select(f, (document) => {
      document.generationDraft.sampling.sampler = 'DPM++ 2M'
      document.generationDraft.sampling.scheduler = 'Karras'
      document.generationDraft.cfgRescale = 0.7
    })
    f.controls.fail = true
    const id = await queueOne(f)
    const failed = await settled(f, id)
    assert.equal(failed.status, 'failed')
    const original = await f.queue.loadVerifiedRegionalInput(id)
    await select(f, (document) => {
      document.generationDraft.positivePrompt.text = 'Later authored global'
      document.generationDraft.sampling.denoisingStrength = 0.8
      document.generationDraft.seed = { policy: 'fixed', value: 124 }
      for (const region of document.regionalGuidance ?? []) {
        region.enabled = false
      }
    })
    f.controls.mode = 'txt2img'
    f.controls.marker = 1
    f.controls.fail = false
    await f.actions.retryJob({ id, statusSequence: failed.status_sequence })
    const next = (await rows(f)).find((value) => value.id !== id)
    assert.ok(next)
    assert.equal((await settled(f, next.id)).status, 'completed')
    const restored = await f.queue.loadVerifiedRegionalInput(next.id)
    assert.deepEqual(restored.payload, original.payload)
    assert.deepEqual(f.consumed[1].recipe, original.input.recipe)
    assert.ok(f.targets[1].equals(f.targets[0]))
    assert.equal(f.consumed[1].request.type, 'generate-illustrious-outpaint')
    assert.equal(f.consumed[1].request.job.sampling.scheduler, 'dpmpp_2m_k')
    assert.equal(f.consumed[1].request.job.sampling.cfgRescale, 0.7)
  })
})

for (const failure of ['capability', 'missing-infill', 'changed-infill', 'source'] as const) {
  test(`frozen regional outpaint Retry ${failure} refusal preserves exact rows and receipts before SQL`, async () => {
    await withFixture(async (f) => {
      await select(f)
      f.controls.fail = true
      const id = await queueOne(f)
      const failed = await settled(f, id)
      const frozen = await f.queue.loadVerifiedRegionalInput(id)
      if (failure === 'capability') {
        f.controls.ready.capabilities = f.controls.ready.capabilities.filter(
          (value) => value !== CAPABILITY,
        )
      }
      if (failure === 'missing-infill') {
        f.controls.failInfill = true
      }
      if (failure === 'changed-infill') {
        f.controls.infillPath = path.join(f.root, 'another-exact-resource.pt')
      }
      if (failure === 'source') {
        await writeFile(frozen.targetPath, f.targetBytes)
      }
      const before = await snapshot(f)
      const count = f.counters.infill
      await assert.rejects(f.actions.retryJob({ id, statusSequence: failed.status_sequence }))
      assert.deepEqual(await snapshot(f), before)
      assert.equal(f.consumed.length, 1)
      if (failure === 'capability' || failure === 'source') {
        assert.equal(f.counters.infill, count)
      }
    })
  })
}

test('wrong regional outpaint contribution alpha cannot complete and a fresh healthy request succeeds', async () => {
  await withFixture(async (f) => {
    await select(f)
    f.controls.badAlpha = true
    const failedId = await queueOne(f)
    assert.equal((await settled(f, failedId)).status, 'failed')
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [])
    assert.deepEqual(
      await f.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
      [],
    )
    f.controls.badAlpha = false
    const healthy = await queueOne(f)
    assert.equal((await settled(f, healthy)).status, 'completed')
    assert.equal((await f.staging.listVerifiedCandidates(f.tabId)).length, 1)
  })
})

test('regional outpaint cancellation routes to its regional owner and late completion creates no candidate', async () => {
  await withFixture(async (f) => {
    await select(f)
    let entered!: () => void
    let release!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    f.controls.hold = async () => {
      entered()
      await held
    }
    const id = await queueOne(f)
    await started
    const stopped = await f.orchestrator.cancelGenerationJob(id)
    assert.equal(stopped.status, 'canceled')
    release()
    const deadline = Date.now() + 10_000
    while (f.outputs.length === 0 && Date.now() < deadline) {
      await setImmediate()
    }
    assert.equal(f.outputs.length, 1, 'The controlled late completion must actually run')
    assert.equal((await settled(f, id)).status, 'canceled')
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [])
    assert.deepEqual(
      await f.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
      [],
    )
    f.controls.hold = null
    await f.actions.retryJob({
      id,
      statusSequence: (await f.queue.getManagerEntry(id)).statusSequence,
    })
    const next = (await rows(f)).find((value) => value.id !== id)
    assert.ok(next)
    assert.equal((await settled(f, next.id)).status, 'completed')
  })
})

test('regional outpaint candidate retains its independent source through queue pruning and recovery', async () => {
  await withFixture(async (f) => {
    await select(f)
    const id = await queueOne(f)
    const row = await settled(f, id)
    const [candidate] = await f.staging.listVerifiedCandidates(f.tabId)
    assert.ok(candidate)
    const sourcePath = path.join(
      path.dirname(path.dirname(candidate.assetPath)),
      'source-target.png',
    )
    assert.ok((await readFile(sourcePath)).equals(f.sourceBytes()))
    await f.queue.deleteTerminal(id, row.status_sequence)
    const opened = openAppDatabase(f.root, path.resolve('src/main/db/migrations'))
    try {
      const queue = new GenerationQueueRepository(opened.db, f.root)
      await queue.recoverAfterRestart()
      const staging = new GenerationStagingRepository(opened.db, f.root)
      assert.deepEqual(await staging.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 0 })
      assert.equal((await staging.listVerifiedCandidates(f.tabId)).length, 1)
      await writeFile(sourcePath, f.targetBytes)
      assert.deepEqual(await staging.listVerifiedCandidates(f.tabId), [])
    } finally {
      await opened.close()
    }
  })
})

for (const field of ['conditioning', 'infill', 'initialization'] as const) {
  test(`regional outpaint transport rejects mismatched ${field} without queue mutation`, async () => {
    await withFixture(async (f) => {
      await select(f)
      f.controls.fail = true
      const id = await queueOne(f)
      await settled(f, id)
      const input = structuredClone((await f.queue.loadVerifiedRegionalInput(id)).input)
      assert.equal(input.request.type, 'generate-illustrious-outpaint')
      if (input.request.type !== 'generate-illustrious-outpaint') {
        assert.fail('Wrong outpaint command')
      }
      if (field === 'conditioning') {
        Reflect.set(input.request.job.conditioning.bbox, 'x', 1)
      }
      if (field === 'infill') {
        Reflect.set(input.request.job.infillResource, 'sha256', 'a'.repeat(64))
      }
      if (field === 'initialization') {
        input.initializationProfile = 'invoke-cpu-f32-add-noise-v1'
      }
      const before = await snapshot(f)
      assert.throws(() => captureRegionalWorkerInput(input), { code: 'INVALID_REQUEST' })
      assert.deepEqual(await snapshot(f), before)
    })
  })
}

test('late invalid regional outpaint batch item publishes no partial rows or input directories', async () => {
  await withFixture(async (f) => {
    await select(f)
    f.controls.fail = true
    const id = await queueOne(f)
    await settled(f, id)
    const frozen = await f.queue.loadVerifiedRegionalInput(id)
    assert.equal(frozen.payload.kind, OPERATION)
    if (frozen.payload.kind !== OPERATION) {
      assert.fail('Wrong operation')
    }
    const { request, ...regional } = structuredClone(frozen.input)
    const prepared = {
      context: structuredClone(frozen.payload.context),
      targetPngBytes: await readFile(frozen.targetPath),
    }
    const second = structuredClone(request)
    second.requestId = randomUUID()
    second.job.sampling.seed++
    const before = await snapshot(f)
    await assert.rejects(
      f.queue.enqueueInvokeCanvasRegionalBatch({
        items: [
          { prepared, regional, request },
          { prepared, regional, request: second },
        ],
        preflight: async () => assert.fail('Invalid batch reached publication preflight'),
        projectPath: f.packagePath,
        stagingSessionId: randomUUID(),
      }),
    )
    assert.deepEqual(await snapshot(f), before)
  })
})
