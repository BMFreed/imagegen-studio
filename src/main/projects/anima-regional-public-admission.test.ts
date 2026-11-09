import { ANIMA_SAMPLING_METHOD_KEYS } from '../../shared/projects/anima-sampling-method.js'

import assert from 'node:assert/strict'
import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { AnimaGenerationModelResolver } from './anima-generation-preparation.js'
import type { AnimaRegionalWorkerInput } from './anima-regional-worker-request.js'
import type { RegionalProjectFixture } from './test-fixtures/regional-project.js'

import { openAppDatabase } from '../db/database.js'
import { LAMA_OUTPAINT_ARTIFACT } from '../runtime/lama-manifest.js'
import { prepareAnimaRegionalWorkerRequest } from './anima-regional-worker-request.js'
import { ProjectGenerationActionController } from './generation-action-controller.js'
import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationWorkerClient, GenerationWorkerError } from './generation-worker-client.js'
import { ProjectRegionalGenerationCoordinator } from './project-regional-generation-coordinator.js'
import { parseAcceptedGenerationBaseV1 } from './regional-queued-generation.js'
import {
  ANIMA_BATCH_READY,
  animaFixturePng,
  withAnimaBatchFixture,
} from './test-fixtures/anima-batch.js'
import {
  createRegionalProjectFixture,
  regionalProjectDigest,
} from './test-fixtures/regional-project.js'

type Actions = ConstructorParameters<typeof ProjectGenerationActionController>[0]

/**
 * Real Project/capture/queue/recipe/request leases; exact tiny model resolver and compositor
 * doubles.
 */
async function withPublicAnima(
  use: (
    fixture: RegionalProjectFixture & {
      actions: ProjectGenerationActionController
      controls: {
        afterPreparation?: () => Promise<void>
        beforePreparation?: () => Promise<void>
        infillAvailable: boolean
        infillPath: string
        ready: ReturnType<RegionalProjectFixture['input']>['ready']
      }
      coordinator: ProjectRegionalGenerationCoordinator
    },
  ) => Promise<void>,
  options: Parameters<typeof createRegionalProjectFixture>[0] = {},
) {
  await withAnimaBatchFixture(async (anima) => {
    const fixture = await createRegionalProjectFixture(options)
    const models = Object.assign(fixture.models, anima.modelService)
    await fixture.edit((document) => {
      document.generationDraft = structuredClone(anima.prepared.context.generationDraft)
      document.generationDraft.positivePrompt = {
        embeddingRefs: [],
        text: '(one white cat)0, studio',
      }
      document.generationDraft.negativePrompt = { embeddingRefs: [], text: '' }
      document.generationDraft.loras = document.generationDraft.loras.map((entry) => ({
        ...entry,
        enabled: false,
      }))
      document.generationDraft.seed = { policy: 'fixed', value: 123 }
    })
    const controls: {
      afterPreparation?: () => Promise<void>
      beforePreparation?: () => Promise<void>
      infillAvailable: boolean
      infillPath: string
      ready: ReturnType<RegionalProjectFixture['input']>['ready']
    } = {
      infillAvailable: true,
      infillPath: path.join(fixture.root, 'explicit-structural-LaMa-resolver-substitute.pt'),
      ready: {
        ...ANIMA_BATCH_READY,
        capabilities: [
          ...ANIMA_BATCH_READY.capabilities,
          'illustrious-outpaint',
          'anima-regional-txt2img-v1',
        ],
        workerVersion: '0.14.0',
      },
    }
    // Metadata-only exact resource resolver substitute; no LaMa load/download is claimed.
    const orchestrator = new GenerationOrchestrator(
      fixture.projects,
      fixture.index,
      models,
      fixture.queue,
      fixture.staging,
      fixture.processor,
      fixture.scratch,
      {
        resolveVerifiedOutpaintInfill: async () => {
          if (!controls.infillAvailable) {
            throw new Error('Explicit LaMa resource unavailable')
          }
          return {
            byteSize: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
            managedPath: controls.infillPath,
            role: 'outpaint-infill',
            sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
          }
        },
      },
    )
    const coordinator = new ProjectRegionalGenerationCoordinator({
      compositionProfile: 'invoke-canvas-v1',
      gate: fixture.gate,
      models,
      orchestrator,
      projects: fixture.projects,
      scratchBasePath: fixture.scratch,
    })
    const runtime: Actions['runtime'] = {
      getStatus: async () => null,
      readQualifiedInferenceReady: async () => structuredClone(controls.ready),
      withGenerationAdmission: async (_scratch, callback) =>
        await callback(structuredClone(controls.ready)),
      withGenerationPreparation: async (_scratch, callback) => {
        await controls.beforePreparation?.()
        const result = await callback({
          inferenceReady: structuredClone(controls.ready),
          targetWorker: fixture.compositionWorker,
        })
        await controls.afterPreparation?.()
        return result
      },
    }
    const actions = new ProjectGenerationActionController({
      dispatch: { runNext: async () => ({ kind: 'idle' }), shutdown: async () => {} },
      gate: fixture.gate,
      models,
      orchestrator,
      processor: fixture.processor,
      projects: fixture.projects,
      queue: fixture.queue,
      regional: coordinator,
      runtime,
      scratchBasePath: fixture.scratch,
      staging: fixture.staging,
    })
    try {
      await use({ ...fixture, actions, controls, coordinator, orchestrator })
    } finally {
      await actions.shutdown()
      await coordinator.shutdown()
      await fixture.close()
    }
  })
}

async function useOpaqueTarget(fixture: RegionalProjectFixture, alpha = 255): Promise<void> {
  const compose = fixture.compositionWorker.composeTarget.bind(fixture.compositionWorker)
  const bytes = await animaFixturePng(alpha)
  fixture.compositionWorker.composeTarget = async (request) => {
    const captured = await compose(request)
    await writeFile(request.targetPngPath, bytes)
    return {
      ...captured,
      composite: {
        ...captured.composite,
        byteSize: bytes.length,
        sha256: regionalProjectDigest(bytes),
      },
      mode: alpha === 255 ? 'img2img' : 'outpaint',
    }
  }
}

for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
  test(`opaque regional ${method} NEW requires the image capability and freezes the exact image plan`, async () => {
    await withPublicAnima(async (fixture) => {
      fixture.controls.ready.capabilities = [
        ...fixture.controls.ready.capabilities,
        'anima-regional-sampling-v1',
      ]
      await useOpaqueTarget(fixture)
      await fixture.edit((document) => {
        document.generationDraft.sampling.animaMethod = method
        document.generationDraft.sampling.steps = 20
        document.generationDraft.sampling.denoisingStrength = 0.5
      })
      const before = structuredClone(fixture.document())
      const saved = await readFile(fixture.packagePath)
      await assert.rejects(
        fixture.actions.generate(fixture.tabId, { documentId: before.documentId, iterations: 1 }),
        /Anima Regional Guidance img2img/,
      )
      assert.equal((await fixture.queue.listManagerPage()).items.length, 0)
      assert.equal(
        (await fixture.actions.getState(fixture.tabId)).animaRegionalImg2ImgSupported,
        false,
      )
      fixture.controls.ready.capabilities = [
        ...fixture.controls.ready.capabilities,
        'anima-regional-img2img-v1',
      ]
      const result = await fixture.actions.generate(fixture.tabId, {
        documentId: before.documentId,
        iterations: 1,
      })
      if (result.kind !== 'queued') {
        assert.fail('Expected one frozen opaque regional job.')
      }
      const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(result.jobIds[0])
      assert.equal(frozen.payload.kind, 'anima-regional-img2img')
      assert.equal(frozen.input.request.type, 'generate-anima-img2img')
      assert.equal(frozen.input.request.job.sampling.mode, 'img2img')
      assert.equal(frozen.input.request.job.sampling.strength, 0.5)
      assert.equal(frozen.input.request.job.sampling.posteriorSeed, (123 ^ 0x9e_37_79_b9) >>> 0)
      assert.equal(frozen.input.request.job.sampling.totalSteps, method === 'heun' ? 19 : 10)
      assert.deepEqual(frozen.input.request.job.sampling, frozen.payload.workerJob.sampling)
      const details = (await fixture.queue.listManagerPage()).items[0]
      assert.equal(details.operation, 'anima-regional-img2img')
      assert.equal(details.details?.sampling.denoisingStrength, 0.5)
      assert.equal(details.details?.sampling.animaMethod, method)
      assert.deepEqual(fixture.document(), before)
      assert.ok((await readFile(fixture.packagePath)).equals(saved))
    })
  })

  test(`opaque regional ${method} Retry uses frozen source strength and method after saved current edits`, async () => {
    await withPublicAnima(async (fixture) => {
      fixture.controls.ready.capabilities = [
        ...fixture.controls.ready.capabilities,
        'anima-regional-img2img-v1',
        'anima-regional-sampling-v1',
      ]
      await useOpaqueTarget(fixture)
      await fixture.edit((document) => {
        document.generationDraft.sampling.animaMethod = method
        document.generationDraft.sampling.denoisingStrength = 0.5
      })
      const result = await fixture.actions.generate(fixture.tabId, {
        documentId: fixture.document().documentId,
        iterations: 1,
      })
      if (result.kind !== 'queued') {
        assert.fail('Expected one image queue job.')
      }
      const id = result.jobIds[0]
      await fixture.orchestrator.cancelGenerationJob(id)
      const source = await fixture.queue.getManagerEntry(id)
      const before = await fixture.queue.loadVerifiedAnimaRegionalInput(id)
      const bytes = await readFile(before.targetPath)
      const original = await fixture.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
      await fixture.edit((document) => {
        document.generationDraft.model = null
        document.generationDraft.seed = { policy: 'fixed', value: 999 }
        document.generationDraft.sampling.animaMethod = method === 'euler' ? 'heun' : 'euler'
        document.generationDraft.sampling.denoisingStrength = 0.2
        document.generationDraft.positivePrompt.text = 'later source and settings'
        document.regionalGuidance!.forEach((region) => {
          region.enabled = false
        })
      })
      // A changed current source must never replace the frozen opaque target.
      fixture.compositionWorker.composeTarget = async () => {
        throw new Error('Retry recomposed the edited current source')
      }
      const edited = structuredClone(fixture.document())
      fixture.controls.ready.capabilities = fixture.controls.ready.capabilities.filter(
        (cap) => cap !== 'anima-regional-img2img-v1',
      )
      await assert.rejects(
        fixture.actions.retryJob({ id, statusSequence: source.statusSequence }),
        { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
      )
      assert.equal((await fixture.queue.listManagerPage()).items.length, 1)
      fixture.controls.ready.capabilities = [
        ...fixture.controls.ready.capabilities,
        'anima-regional-img2img-v1',
      ]
      await fixture.actions.retryJob({ id, statusSequence: source.statusSequence })
      const rows = await fixture.db.selectFrom('generation_queue_item').selectAll().execute()
      assert.equal(rows.length, 2)
      const clone = rows.find((row) => row.id !== id)!
      assert.equal(clone.frozen_payload_json, original.frozen_payload_json)
      const after = await fixture.queue.loadVerifiedAnimaRegionalInput(clone.id)
      assert.ok((await readFile(after.targetPath)).equals(bytes))
      assert.deepEqual(after.input.recipe, before.input.recipe)
      assert.deepEqual(after.input.request.job.sampling, before.input.request.job.sampling)
      assert.deepEqual(fixture.document(), edited)
    })
  })
}

test('opaque regional admission retains mixed-alpha refusal with the new capability', async () => {
  await withPublicAnima(async (fixture) => {
    fixture.controls.ready.capabilities = [
      ...fixture.controls.ready.capabilities,
      'anima-regional-img2img-v1',
    ]
    await fixture.edit((document) => {
      document.generationDraft.sampling.denoisingStrength = 0.5
    })
    await useOpaqueTarget(fixture, 127)
    await assert.rejects(
      fixture.actions.generate(fixture.tabId, {
        documentId: fixture.document().documentId,
        iterations: 1,
      }),
      /Anima Regional Guidance outpaint/,
    )
    assert.equal((await fixture.queue.listManagerPage()).items.length, 0)
  })
})

test('existing Generate admits one original Anima regional job without Illustrious model calls or Project mutation', async () => {
  await withPublicAnima(async (fixture) => {
    const before = structuredClone(fixture.document())
    const saved = await readFile(fixture.packagePath)
    const result = await fixture.actions.generate(fixture.tabId, {
      documentId: before.documentId,
      iterations: 1,
    })
    assert.equal(result.kind, 'queued')
    if (result.kind !== 'queued') {
      assert.fail('Expected one actual queue admission.')
    }
    assert.equal(result.jobIds.length, 1)
    const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(result.jobIds[0])
    assert.equal(frozen.payload.kind, 'anima-regional-txt2img')
    assert.equal(frozen.input.compositionProfile, 'invoke-krea2-global-support-v1')
    assert.equal(frozen.input.promptInterpretation, 'invoke-fragments-v1')
    assert.equal(frozen.input.recipe.family, 'anima')
    assert.equal(frozen.input.recipe.item.seed, 123)
    assert.equal(
      frozen.input.recipe.globalPrompts.positive.text,
      before.generationDraft.positivePrompt.text,
    )
    assert.deepEqual(frozen.input.recipe.regions[0].coverage.alpha, fixture.alpha)
    assert.equal(frozen.input.compiledPrompts[2].text, 'regional subject')
    assert.equal(
      frozen.payload.context.loraStack.every((entry) => !entry.enabled),
      true,
    )
    assert.deepEqual(frozen.payload.context.loraStack, before.generationDraft.loras)
    assert.equal(fixture.calls.checkpoint, 0)
    assert.equal(fixture.calls.embedding, 0)
    assert.equal(fixture.calls.compose.length, 1)
    assert.equal((await fixture.actions.getState(fixture.tabId)).animaRegionalSupported, true)
    assert.deepEqual(fixture.document(), before)
    assert.ok((await readFile(fixture.packagePath)).equals(saved))
  })
})

test('new Generate refuses ordinary-only and negative-unsupported peers before publishing any job', async () => {
  await withPublicAnima(async (fixture) => {
    const documentId = fixture.document().documentId
    fixture.controls.ready.capabilities = fixture.controls.ready.capabilities.filter(
      (entry) => entry !== 'anima-regional-txt2img-v1',
    )
    await assert.rejects(
      fixture.actions.generate(fixture.tabId, { documentId, iterations: 1 }),
      /Repair or update/,
    )
    assert.equal(fixture.calls.compose.length, 0)
    assert.equal(
      (await fixture.db.selectFrom('generation_queue_item').selectAll().execute()).length,
      0,
    )
    fixture.controls.ready.capabilities = [
      ...fixture.controls.ready.capabilities,
      'anima-regional-txt2img-v1',
    ]
    await fixture.edit((document) => {
      document.generationDraft.negativePrompt.text = 'bad anatomy'
    })
    const before = structuredClone(fixture.document())
    await assert.rejects(
      fixture.actions.generate(fixture.tabId, { documentId, iterations: 1 }),
      /Repair or update/,
    )
    assert.deepEqual(fixture.document(), before)
    assert.equal(fixture.calls.compose.length, 0)
    assert.equal(
      (await fixture.db.selectFrom('generation_queue_item').selectAll().execute()).length,
      0,
    )
  })
})

test('frozen Anima regional Retry survives later Illustrious draft and disabled regions but requires its current capability', async () => {
  await withPublicAnima(async (fixture) => {
    const result = await fixture.actions.generate(fixture.tabId, {
      documentId: fixture.document().documentId,
      iterations: 1,
    })
    if (result.kind !== 'queued') {
      assert.fail('Expected one actual queue admission.')
    }
    const id = result.jobIds[0]
    await fixture.orchestrator.cancelGenerationJob(id)
    const source = await fixture.queue.getManagerEntry(id)
    const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(id)
    await fixture.edit((document) => {
      document.generationDraft.model!.baseModelFamily = 'illustrious'
      document.generationDraft.model!.predictionType = 'epsilon'
      document.generationDraft.positivePrompt.text = 'later draft'
      document.regionalGuidance = document.regionalGuidance!.map((region) => ({
        ...region,
        enabled: false,
      }))
    })
    fixture.controls.ready.capabilities = fixture.controls.ready.capabilities.filter(
      (entry) => entry !== 'anima-regional-txt2img-v1',
    )
    await assert.rejects(
      fixture.actions.retryJob({ id, statusSequence: source.statusSequence }),
      /retry Anima Regional Guidance/,
    )
    assert.equal(
      (await fixture.db.selectFrom('generation_queue_item').selectAll().execute()).length,
      1,
    )
    fixture.controls.ready.capabilities = [
      ...fixture.controls.ready.capabilities,
      'anima-regional-txt2img-v1',
    ]
    await fixture.actions.retryJob({ id, statusSequence: source.statusSequence })
    const entries = await fixture.db.selectFrom('generation_queue_item').selectAll().execute()
    assert.equal(entries.length, 2)
    const retried = entries.find((entry) => entry.id !== id)!
    const saved = await fixture.queue.loadVerifiedAnimaRegionalInput(retried.id)
    assert.deepEqual(saved.input.recipe, frozen.input.recipe)
    assert.deepEqual(saved.input.compiledPrompts, frozen.input.compiledPrompts)
    assert.equal(saved.input.request.job.sampling.seed, 123)
    assert.equal(fixture.calls.compose.length, 1)
  })
})

test('actual opaque composed pixels require the new Anima regional image capability before durable admission', async () => {
  await withPublicAnima(async (fixture) => {
    const compose = fixture.compositionWorker.composeTarget.bind(fixture.compositionWorker)
    const opaqueBytes = await animaFixturePng(255)
    fixture.compositionWorker.composeTarget = async (request) => {
      const transparent = await compose(request)
      await writeFile(request.targetPngPath, opaqueBytes)
      return {
        ...transparent,
        composite: {
          ...transparent.composite,
          byteSize: opaqueBytes.length,
          sha256: regionalProjectDigest(opaqueBytes),
        },
        mode: 'img2img',
      }
    }
    const before = structuredClone(fixture.document())
    await assert.rejects(
      fixture.actions.generate(fixture.tabId, { documentId: before.documentId, iterations: 1 }),
      /Anima Regional Guidance img2img/,
    )
    assert.equal(fixture.calls.compose.length, 1)
    assert.equal(
      (await fixture.db.selectFrom('generation_queue_item').selectAll().execute()).length,
      0,
    )
    assert.deepEqual(fixture.document(), before)
  })
})

for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
  test(`public regional ${method} preserves its actual flow plan and requires a new peer only for non-Euler`, async () => {
    await withPublicAnima(async (fixture) => {
      await fixture.edit((document) => {
        document.generationDraft.sampling.animaMethod = method
        document.generationDraft.sampling.steps = 20
      })
      const document = structuredClone(fixture.document())
      const saved = await readFile(fixture.packagePath)
      assert.equal(
        (await fixture.actions.getState(fixture.tabId)).animaRegionalSamplingSupported,
        false,
      )
      if (method !== 'euler') {
        await assert.rejects(
          fixture.actions.generate(fixture.tabId, {
            documentId: document.documentId,
            iterations: 1,
          }),
          { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
        )
        assert.equal(fixture.calls.compose.length, 0)
        assert.equal((await fixture.queue.listManagerPage()).items.length, 0)
        void (fixture.controls.ready.capabilities as string[]).push('anima-regional-sampling-v1')
        assert.equal(
          (await fixture.actions.getState(fixture.tabId)).animaRegionalSamplingSupported,
          true,
        )
      }
      const result = await fixture.actions.generate(fixture.tabId, {
        documentId: document.documentId,
        iterations: 1,
      })
      if (result.kind !== 'queued') {
        assert.fail('Expected one regional queue job.')
      }
      const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(result.jobIds[0])
      assert.equal(frozen.payload.context.sampling.animaMethod, method)
      assert.equal(frozen.payload.workerJob.sampling.scheduler, method)
      assert.equal(frozen.input.request.job.sampling.scheduler, method)
      assert.deepEqual(frozen.input.request.job.sampling, frozen.payload.workerJob.sampling)
      assert.equal(frozen.input.request.job.sampling.totalSteps, method === 'heun' ? 39 : 20)
      assert.equal(
        (await fixture.queue.listManagerPage()).items[0].details?.sampling.animaMethod,
        method,
      )
      assert.equal(fixture.calls.compose.length, 1)
      assert.deepEqual(fixture.document(), document)
      assert.ok((await readFile(fixture.packagePath)).equals(saved))
    })
  })

  test(`frozen regional ${method} Retry gates the saved method after opposite current edits`, async () => {
    await withPublicAnima(async (fixture) => {
      void (fixture.controls.ready.capabilities as string[]).push('anima-regional-sampling-v1')
      await fixture.edit((document) => {
        document.generationDraft.sampling.animaMethod = method
      })
      const result = await fixture.actions.generate(fixture.tabId, {
        documentId: fixture.document().documentId,
        iterations: 1,
      })
      if (result.kind !== 'queued') {
        assert.fail('Expected one regional queue job.')
      }
      const id = result.jobIds[0]
      await fixture.orchestrator.cancelGenerationJob(id)
      const source = await fixture.queue.getManagerEntry(id)
      const before = await fixture.queue.loadVerifiedAnimaRegionalInput(id)
      const sourceRow = await fixture.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
      await fixture.edit((document) => {
        document.generationDraft.model = null
        document.generationDraft.sampling.animaMethod = method === 'euler' ? 'heun' : 'euler'
        document.generationDraft.seed = { policy: 'fixed', value: 999 }
        document.generationDraft.positivePrompt.text = 'later current text'
        document.regionalGuidance!.forEach((region) => {
          region.enabled = false
        })
      })
      const edited = structuredClone(fixture.document())
      fixture.controls.ready.capabilities = fixture.controls.ready.capabilities.filter(
        (entry) => entry !== 'anima-regional-sampling-v1',
      )
      if (method !== 'euler') {
        await assert.rejects(
          fixture.actions.retryJob({ id, statusSequence: source.statusSequence }),
          { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
        )
        assert.equal((await fixture.queue.listManagerPage()).items.length, 1)
        void (fixture.controls.ready.capabilities as string[]).push('anima-regional-sampling-v1')
      }
      await fixture.actions.retryJob({ id, statusSequence: source.statusSequence })
      const rows = await fixture.db.selectFrom('generation_queue_item').selectAll().execute()
      assert.equal(rows.length, 2)
      const clone = rows.find((entry) => entry.id !== id)!
      const after = await fixture.queue.loadVerifiedAnimaRegionalInput(clone.id)
      assert.equal(clone.frozen_payload_json, sourceRow.frozen_payload_json)
      assert.notEqual(clone.staging_session_id, sourceRow.staging_session_id)
      assert.deepEqual(after.input.recipe, before.input.recipe)
      assert.deepEqual(after.input.compiledPrompts, before.input.compiledPrompts)
      assert.deepEqual(after.input.request.job.sampling, before.input.request.job.sampling)
      assert.equal(fixture.calls.compose.length, 1)
      assert.deepEqual(fixture.document(), edited)
    })
  })
}

test('genuine Anima regional admission retains dormant authored references with empty effective references', async () => {
  await withPublicAnima(async (fixture) => {
    await fixture.edit((document) => {
      const prompts = document.regionalGuidance![0].prompts!
      prompts.positive!.embeddingRefs = [structuredClone(fixture.embedding)]
      prompts.useGlobalNegativePrompt = false
      prompts.negative = { embeddingRefs: [structuredClone(fixture.embedding)], text: '' }
    })
    const before = structuredClone(fixture.document())
    const saved = await readFile(fixture.packagePath)
    const result = await fixture.actions.generate(fixture.tabId, {
      documentId: before.documentId,
      iterations: 1,
    })
    assert.equal(result.kind, 'queued')
    if (result.kind !== 'queued') {
      assert.fail('Expected one captured dormant-reference admission.')
    }
    const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(result.jobIds[0])
    const region = frozen.input.recipe.regions[0]
    assert.deepEqual(region.authoredPrompts, before.regionalGuidance![0].prompts)
    assert.deepEqual(region.authoredPrompts!.positive!.embeddingRefs, [fixture.embedding])
    assert.deepEqual(region.authoredPrompts!.negative!.embeddingRefs, [fixture.embedding])
    assert.deepEqual(region.positive!.embeddingRefs, [])
    assert.deepEqual(region.negative.prompt.embeddingRefs, [])
    assert.equal(region.negative.source, 'regional')
    assert.equal(region.negative.prompt.text, '')
    assert.equal(fixture.calls.embedding, 0)
    assert.equal(fixture.calls.compose.length, 1)
    const reread = await fixture.queue.loadVerifiedAnimaRegionalInput(result.jobIds[0])
    assert.deepEqual(reread.input.recipe, frozen.input.recipe)
    assert.deepEqual(reread.input.compiledPrompts, frozen.input.compiledPrompts)
    assert.deepEqual(fixture.document(), before)
    assert.ok((await readFile(fixture.packagePath)).equals(saved))
  })
})

function enableRegionalOutpaint(
  fixture: Parameters<Parameters<typeof withPublicAnima>[0]>[0],
): void {
  fixture.controls.ready.capabilities = [
    ...fixture.controls.ready.capabilities,
    'anima-outpaint',
    'anima-regional-img2img-v1',
    'anima-regional-outpaint-v1',
    'anima-regional-sampling-v1',
  ]
}

for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
  test(`mixed-alpha regional ${method} NEW freezes OUT source alpha infill and native plan`, async () => {
    await withPublicAnima(async (fixture) => {
      enableRegionalOutpaint(fixture)
      await useOpaqueTarget(fixture, 127)
      await fixture.edit((document) => {
        document.generationDraft.sampling.animaMethod = method
        document.generationDraft.sampling.steps = 20
        document.generationDraft.sampling.denoisingStrength = 0.5
      })
      const before = structuredClone(fixture.document())
      const saved = await readFile(fixture.packagePath)
      fixture.controls.ready.capabilities = fixture.controls.ready.capabilities.filter(
        (cap) => cap !== 'anima-regional-outpaint-v1',
      )
      await assert.rejects(
        fixture.actions.generate(fixture.tabId, { documentId: before.documentId, iterations: 1 }),
        /Anima Regional Guidance outpaint/,
      )
      assert.equal((await fixture.queue.listManagerPage()).items.length, 0)
      assert.equal(
        (await fixture.actions.getState(fixture.tabId)).animaRegionalOutpaintSupported,
        false,
      )
      ;(fixture.controls.ready.capabilities as string[]).push('anima-regional-outpaint-v1')
      const result = await fixture.actions.generate(fixture.tabId, {
        documentId: before.documentId,
        iterations: 1,
      })
      if (result.kind !== 'queued') {
        assert.fail('Expected one frozen regional OUT job')
      }
      const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(result.jobIds[0])
      assert.equal(frozen.payload.kind, 'anima-regional-outpaint')
      assert.equal(frozen.input.request.type, 'generate-anima-outpaint')
      if (
        frozen.payload.kind !== 'anima-regional-outpaint' ||
        frozen.input.request.type !== 'generate-anima-outpaint'
      ) {
        assert.fail('Expected exact OUT variants')
      }
      assert.equal(frozen.payload.context.kind, 'anima-outpaint-preparation')
      const mismatched = structuredClone(frozen.payload)
      mismatched.outpaintInfill.sha256 = 'f'.repeat(64)
      assert.throws(() => parseAcceptedGenerationBaseV1(JSON.stringify(mismatched)), {
        code: 'QUEUE_INPUT_INVALID',
      })
      assert.equal(frozen.payload.outpaintInfill.path, fixture.controls.infillPath)
      assert.deepEqual(frozen.input.request.job.infillResource, frozen.payload.outpaintInfill)
      assert.deepEqual(frozen.input.request.job.conditioning, frozen.payload.context.conditioning)
      assert.equal(frozen.input.request.job.sampling.mode, 'img2img')
      assert.equal(frozen.input.request.job.sampling.strength, 0.5)
      assert.equal(frozen.input.request.job.sampling.totalSteps, method === 'heun' ? 19 : 10)
      assert.equal(frozen.payload.context.conditioning.keepMask.polarity, 'keep')
      assert.equal(
        frozen.payload.context.conditioning.keepMask.sha256,
        regionalProjectDigest(Buffer.alloc(64 * 64, 127)),
      )
      assert.deepEqual(frozen.payload.workerJob.sampling, frozen.input.request.job.sampling)
      const ordinary = parseAcceptedGenerationBaseV1(JSON.stringify(frozen.payload))
      assert.equal(ordinary.kind, 'anima-outpaint')
      for (const field of [
        'regional',
        'compositionProfile',
        'promptInterpretation',
        'outpaintInfill',
      ]) {
        assert.equal(field in ordinary, false)
      }
      const details = (await fixture.queue.listManagerPage()).items[0]
      assert.equal(details.operation, 'anima-regional-outpaint')
      assert.equal(details.details?.sampling.animaMethod, method)
      assert.deepEqual(fixture.document(), before)
      assert.ok((await readFile(fixture.packagePath)).equals(saved))
    })
  })

  test(`mixed-alpha regional ${method} Retry retains frozen OUT source infill and method after saved edits`, async () => {
    await withPublicAnima(async (fixture) => {
      enableRegionalOutpaint(fixture)
      await useOpaqueTarget(fixture, 127)
      await fixture.edit((document) => {
        document.generationDraft.sampling.animaMethod = method
        document.generationDraft.sampling.denoisingStrength = 0.5
      })
      const result = await fixture.actions.generate(fixture.tabId, {
        documentId: fixture.document().documentId,
        iterations: 1,
      })
      if (result.kind !== 'queued') {
        assert.fail('Expected OUT queue job')
      }
      const id = result.jobIds[0]
      await fixture.orchestrator.cancelGenerationJob(id)
      const before = await fixture.queue.loadVerifiedAnimaRegionalInput(id)
      const png = await readFile(before.targetPath)
      const source = await fixture.queue.getManagerEntry(id)
      const row = await fixture.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
      await fixture.edit((document) => {
        document.generationDraft.model = null
        document.generationDraft.seed = { policy: 'fixed', value: 999 }
        document.generationDraft.sampling.animaMethod = method === 'euler' ? 'heun' : 'euler'
        document.generationDraft.sampling.denoisingStrength = 1
        document.regionalGuidance!.forEach((region) => {
          region.enabled = false
        })
      })
      await fixture.projects.save(fixture.tabId)
      const edited = structuredClone(fixture.document())
      const saved = await readFile(fixture.packagePath)
      fixture.compositionWorker.composeTarget = async () => {
        throw new Error('OUT Retry recomposed current source')
      }
      fixture.controls.ready.capabilities = fixture.controls.ready.capabilities.filter(
        (cap) => cap !== 'anima-regional-outpaint-v1',
      )
      await assert.rejects(
        fixture.actions.retryJob({ id, statusSequence: source.statusSequence }),
        { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
      )
      assert.equal((await fixture.queue.listManagerPage()).items.length, 1)
      ;(fixture.controls.ready.capabilities as string[]).push('anima-regional-outpaint-v1')
      await fixture.actions.retryJob({ id, statusSequence: source.statusSequence })
      const rows = await fixture.db.selectFrom('generation_queue_item').selectAll().execute()
      assert.equal(rows.length, 2)
      const next = rows.find((entry) => entry.id !== id)!
      assert.equal(next.frozen_payload_json, row.frozen_payload_json)
      const after = await fixture.queue.loadVerifiedAnimaRegionalInput(next.id)
      assert.ok((await readFile(after.targetPath)).equals(png))
      assert.deepEqual(after.input.recipe, before.input.recipe)
      assert.deepEqual(after.input.request.job, {
        ...before.input.request.job,
        output: after.input.request.job.output,
        target: after.input.request.job.target,
      })
      assert.deepEqual(fixture.document(), edited)
      assert.ok((await readFile(fixture.packagePath)).equals(saved))
    })
  })
}

for (const failure of ['missing', 'changed-path'] as const) {
  test(`regional OUT ${failure} infill refuses NEW or frozen Retry without partial SQL`, async () => {
    await withPublicAnima(async (fixture) => {
      enableRegionalOutpaint(fixture)
      await useOpaqueTarget(fixture, 127)
      await fixture.edit((document) => {
        document.generationDraft.sampling.denoisingStrength = 0.5
      })
      const before = structuredClone(fixture.document())
      const saved = await readFile(fixture.packagePath)
      if (failure === 'missing') {
        fixture.controls.infillAvailable = false
        await assert.rejects(
          fixture.actions.generate(fixture.tabId, { documentId: before.documentId, iterations: 1 }),
          /LaMa resource unavailable/,
        )
        assert.equal((await fixture.queue.listManagerPage()).items.length, 0)
      } else {
        const result = await fixture.actions.generate(fixture.tabId, {
          documentId: before.documentId,
          iterations: 1,
        })
        if (result.kind !== 'queued') {
          assert.fail('Expected OUT queue job')
        }
        const id = result.jobIds[0]
        await fixture.orchestrator.cancelGenerationJob(id)
        const row = await fixture.queue.getManagerEntry(id)
        fixture.controls.infillPath += '-changed'
        await assert.rejects(
          fixture.actions.retryJob({ id, statusSequence: row.statusSequence }),
          /infill resource changed/,
        )
        assert.equal((await fixture.queue.listManagerPage()).items.length, 1)
      }
      assert.deepEqual(fixture.document(), before)
      assert.ok((await readFile(fixture.packagePath)).equals(saved))
    })
  })
}

type PublicAnimaFixture = Parameters<Parameters<typeof withPublicAnima>[0]>[0]
type BatchMode = 'img2img' | 'outpaint' | 'txt2img'
type SeedBehavior = 'per-iteration' | 'per-prompt'

async function selectConcreteBatch(
  fixture: PublicAnimaFixture,
  options: {
    maxPrompts?: number
    method?: (typeof ANIMA_SAMPLING_METHOD_KEYS)[number]
    mode?: BatchMode
    positive?: string
    seed?: number
    seedBehavior?: SeedBehavior
  } = {},
): Promise<void> {
  const mode = options.mode ?? 'txt2img'
  enableRegionalOutpaint(fixture)
  if (mode !== 'txt2img') {
    await useOpaqueTarget(fixture, mode === 'img2img' ? 255 : 127)
  }
  await fixture.edit((document) => {
    document.generationDraft.dynamicPrompt = {
      maxPrompts: options.maxPrompts ?? 2,
      seedBehavior: options.seedBehavior ?? 'per-iteration',
    }
    document.generationDraft.positivePrompt = {
      embeddingRefs: [],
      text: options.positive ?? '{red cat|blue dog}',
    }
    document.generationDraft.seed = { policy: 'fixed', value: options.seed ?? 123 }
    document.generationDraft.sampling.animaMethod = options.method ?? 'heun'
    document.generationDraft.sampling.steps = 20
    document.generationDraft.sampling.denoisingStrength = mode === 'txt2img' ? null : 0.5
  })
}

async function queuedConcreteBatch(fixture: PublicAnimaFixture, iterations: number) {
  const result = await fixture.actions.generate(fixture.tabId, {
    documentId: fixture.document().documentId,
    iterations,
  })
  if (result.kind !== 'queued') {
    assert.fail('Expected one complete concrete Anima batch.')
  }
  return result
}

async function concreteRows(fixture: PublicAnimaFixture) {
  return await fixture.db.selectFrom('generation_queue_item').selectAll().execute()
}

async function fixtureFileTree(root: string): Promise<{ path: string; sha256: string }[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
  const files: { path: string; sha256: string }[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      for (const child of await fixtureFileTree(path.join(root, entry.name))) {
        files.push({ path: path.join(entry.name, child.path), sha256: child.sha256 })
      }
    } else {
      assert.equal(entry.isFile(), true, 'Only actual fixture-owned regular files are expected.')
      files.push({
        path: entry.name,
        sha256: regionalProjectDigest(await readFile(path.join(root, entry.name))),
      })
    }
  }
  return files
}

async function assertUnpublishedBatch(fixture: PublicAnimaFixture): Promise<void> {
  assert.deepEqual(await concreteRows(fixture), [])
  assert.deepEqual(await fixtureFileTree(path.join(fixture.root, 'generation-inputs')), [])
  assert.deepEqual(await fixtureFileTree(fixture.scratch), [])
  assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), [])
}

function inspectConcreteInput(
  input: AnimaRegionalWorkerInput,
  expected: { iteration: number; mode: BatchMode; pair: number; positive: string; seed: number },
): void {
  assert.deepEqual(input.recipe.item, {
    iteration: expected.iteration,
    promptPairIndex: expected.pair,
    prompts: { negative: '', positive: expected.positive },
    seed: expected.seed,
  })
  assert.deepEqual(input.recipe.globalPrompts, {
    negative: { embeddingRefs: [], text: '' },
    positive: { embeddingRefs: [], text: expected.positive },
  })
  assert.equal(input.request.type, `generate-anima-${expected.mode}`)
  assert.equal(input.request.job.sampling.seed, expected.seed)
  assert.equal(input.request.job.sampling.stepSeed, expected.seed)
  assert.equal(input.request.job.sampling.mode, expected.mode === 'txt2img' ? 'txt2img' : 'img2img')
  assert.equal(
    input.request.job.sampling.posteriorSeed,
    expected.mode === 'txt2img' ? null : (expected.seed ^ 0x9e_37_79_b9) >>> 0,
  )
  assert.equal(input.compiledPrompts[0].text, expected.positive)
  assert.deepEqual(input.request.job.prompts.positive, {
    cleanedText: expected.positive,
    spans: [{ end: expected.positive.length, start: 0, weight: 1 }],
    version: 'anima-prompt-weighting-v1',
  })
  assert.equal(input.compiledPrompts[2].text, 'regional subject')
}

for (const seedBehavior of ['per-iteration', 'per-prompt'] as const) {
  for (const seed of [123, 0xff_ff_ff_ff]) {
    test(`Anima concrete positive batch binds every item for ${seedBehavior} seed ${seed}`, async () => {
      await withPublicAnima(async (fixture) => {
        await selectConcreteBatch(fixture, { seed, seedBehavior })
        const document = structuredClone(fixture.document())
        const saved = await readFile(fixture.packagePath)
        const result = await queuedConcreteBatch(fixture, 2)
        assert.equal(result.truncated, false)
        assert.equal(result.jobIds.length, 4)
        const rows = await concreteRows(fixture)
        assert.equal(rows.length, 4)
        assert.equal(new Set(rows.map((row) => row.batch_id)).size, 1)
        assert.equal(rows[0].batch_id, result.batchId)
        assert.equal(new Set(rows.map((row) => row.staging_session_id)).size, 1)
        assert.equal(new Set(result.jobIds).size, 4)
        const offsets = seedBehavior === 'per-iteration' ? [0, 1, 0, 1] : [0, 1, 2, 3]
        const requestIds: string[] = []
        const outputs: string[] = []
        for (const [index, id] of result.jobIds.entries()) {
          const concreteSeed = (seed + offsets[index]) % 0x1_00_00_00_00
          const loaded = await fixture.queue.loadVerifiedAnimaRegionalInput(id)
          requestIds.push(loaded.input.request.requestId)
          outputs.push(loaded.input.request.job.output.pngPath)
          inspectConcreteInput(loaded.input, {
            iteration: index % 2,
            mode: 'txt2img',
            pair: Math.floor(index / 2),
            positive: index < 2 ? 'red cat' : 'blue dog',
            seed: concreteSeed,
          })
          assert.equal(loaded.payload.context.sampling.seed, concreteSeed)
          assert.deepEqual(loaded.payload.context.prompts, loaded.input.recipe.item.prompts)
          assert.deepEqual(loaded.input.recipe.regions[0].coverage.alpha, fixture.alpha)
          assert.deepEqual(loaded.payload.workerJob.sampling, loaded.input.request.job.sampling)
        }
        assert.equal(new Set(requestIds).size, 4)
        assert.equal(new Set(outputs).size, 4)
        assert.equal(fixture.calls.compose.length, 1)
        assert.deepEqual(fixture.document(), document)
        assert.ok(
          (await readFile(fixture.packagePath)).equals(saved),
          'Queue admission cannot Save.',
        )
      })
    })
  }
}

for (const [index, method] of ANIMA_SAMPLING_METHOD_KEYS.entries()) {
  const mode = (['txt2img', 'img2img', 'outpaint'] as const)[index % 3]
  test(`Anima concrete ${method} ${mode} batch preserves every clipped native plan`, async () => {
    await withPublicAnima(async (fixture) => {
      await selectConcreteBatch(fixture, { method, mode, seedBehavior: 'per-prompt' })
      const result = await queuedConcreteBatch(fixture, 2)
      assert.equal(result.jobIds.length, 4)
      for (const [i, id] of result.jobIds.entries()) {
        const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(id)
        inspectConcreteInput(frozen.input, {
          iteration: i % 2,
          mode,
          pair: Math.floor(i / 2),
          positive: i < 2 ? 'red cat' : 'blue dog',
          seed: 123 + i,
        })
        const native = frozen.input.request.job.sampling
        assert.equal(native.scheduler, method)
        const completed = mode === 'txt2img' ? 20 : 10
        assert.equal(native.totalSteps, method === 'heun' ? completed * 2 - 1 : completed)
        assert.deepEqual(frozen.payload.workerJob.sampling, native)
        if (frozen.payload.kind === 'anima-regional-outpaint') {
          assert.equal(
            frozen.payload.context.conditioning.keepMask.sha256,
            regionalProjectDigest(Buffer.alloc(4096, 127)),
          )
          assert.equal(frozen.payload.outpaintInfill.path, fixture.controls.infillPath)
        }
      }
      assert.equal(fixture.calls.compose.length, 1)
    })
  })
}

for (const mode of ['txt2img', 'img2img', 'outpaint'] as const) {
  test(`Anima ${mode} maxPrompts prefix selects complete jobs and reports actual truncation`, async () => {
    await withPublicAnima(async (fixture) => {
      await selectConcreteBatch(fixture, {
        maxPrompts: 1,
        mode,
        positive: '{first|second|third}',
      })
      const result = await queuedConcreteBatch(fixture, 2)
      assert.equal(result.jobIds.length, 2)
      assert.equal(result.truncated, true)
      for (const [iteration, id] of result.jobIds.entries()) {
        const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(id)
        inspectConcreteInput(frozen.input, {
          iteration,
          mode,
          pair: 0,
          positive: 'first',
          seed: 123 + iteration,
        })
      }
      assert.equal(fixture.document().generationDraft.positivePrompt.text, '{first|second|third}')
    })
  })

  test(`Anima ${mode} admits32 concrete jobs but rejects33 without truncation or side effects`, async () => {
    await withPublicAnima(async (fixture) => {
      await selectConcreteBatch(fixture, { maxPrompts: 1, mode, positive: 'same subject' })
      const document = structuredClone(fixture.document())
      const saved = await readFile(fixture.packagePath)
      await assert.rejects(queuedConcreteBatch(fixture, 33), { code: 'GENERATION_INVALID_REQUEST' })
      await assertUnpublishedBatch(fixture)
      assert.equal(fixture.calls.compose.length, 0)
      const result = await queuedConcreteBatch(fixture, 32)
      assert.equal(result.jobIds.length, 32)
      assert.equal(result.truncated, false)
      const seeds = []
      for (const id of result.jobIds) {
        const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(id)
        seeds.push(frozen.input.recipe.item.seed)
      }
      assert.deepEqual(
        seeds,
        Array.from({ length: 32 }, (_, i) => 123 + i),
      )
      assert.deepEqual(fixture.document(), document)
      assert.ok((await readFile(fixture.packagePath)).equals(saved))
    })
  })
}

// Mutation target: supplying the first planned seed/recipe to later same-text members
// must fail this independent identity oracle. The single-item neighbor below stays GREEN.
test('regional Anima concrete batch keeps distinct member seeds red', async () => {
  await withPublicAnima(async (fixture) => {
    await selectConcreteBatch(fixture, { maxPrompts: 1, positive: 'same literal text' })
    const result = await queuedConcreteBatch(fixture, 2)
    assert.equal(result.jobIds.length, 2)
    const entries = await Promise.all(
      result.jobIds.map((id) => fixture.queue.loadVerifiedAnimaRegionalInput(id)),
    )
    assert.deepEqual(
      entries.map((entry) => entry.input.recipe.item.seed),
      [123, 124],
    )
    assert.deepEqual(
      entries.map((entry) => entry.input.request.job.sampling.seed),
      [123, 124],
    )
    assert.deepEqual(
      entries.map((entry) => entry.payload.context.sampling.seed),
      [123, 124],
    )
    assert.deepEqual(
      entries.map((entry) => entry.input.recipe.item.iteration),
      [0, 1],
    )
    assert.deepEqual(
      entries.map((entry) => entry.input.recipe.item.prompts.positive),
      ['same literal text', 'same literal text'],
    )
  })
})

test('regional Anima single concrete item control green', async () => {
  await withPublicAnima(async (fixture) => {
    await selectConcreteBatch(fixture, { maxPrompts: 1, positive: 'same literal text' })
    const result = await queuedConcreteBatch(fixture, 1)
    assert.equal(result.jobIds.length, 1)
    const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(result.jobIds[0])
    inspectConcreteInput(frozen.input, {
      iteration: 0,
      mode: 'txt2img',
      pair: 0,
      positive: 'same literal text',
      seed: 123,
    })
  })
})

for (const failure of ['late-seed', 'late-mode', 'late-coverage'] as const) {
  test(`Anima batch ${failure} mismatch refuses before publishing any member or file`, async () => {
    await withPublicAnima(async (fixture) => {
      await selectConcreteBatch(fixture)
      const original = fixture.orchestrator.enqueuePreparedAnimaRegionalBatch.bind(
        fixture.orchestrator,
      )
      let intercepted = 0
      fixture.orchestrator.enqueuePreparedAnimaRegionalBatch = async (tabId, input) => {
        intercepted++
        const regionalInputs = structuredClone(input.regionalInputs)
        const last = regionalInputs.at(-1)!
        assert.equal(regionalInputs.length, 4)
        if (failure === 'late-seed') {
          last.recipe.item = { ...last.recipe.item, seed: 999 }
        } else if (failure === 'late-mode') {
          ;(last.request as { type: string }).type = 'generate-anima-img2img'
        } else {
          last.recipe.regions[0].coverage.alpha[0] = 255
        }
        return await original(tabId, { ...input, regionalInputs })
      }
      const before = structuredClone(fixture.document())
      const saved = await readFile(fixture.packagePath)
      try {
        await assert.rejects(queuedConcreteBatch(fixture, 2), (error: unknown) => {
          assert.ok(error instanceof Error && 'code' in error)
          assert.ok(
            ['GENERATION_BATCH_INVALID', 'INVALID_REQUEST', 'QUEUE_INPUT_INVALID'].includes(
              String(error.code),
            ),
          )
          return true
        })
        assert.equal(
          intercepted,
          1,
          'The complete valid plan must reach the intended late boundary.',
        )
        await assertUnpublishedBatch(fixture)
        assert.deepEqual(fixture.document(), before)
        assert.ok((await readFile(fixture.packagePath)).equals(saved))
      } finally {
        fixture.orchestrator.enqueuePreparedAnimaRegionalBatch = original
      }
      const healthy = await queuedConcreteBatch(fixture, 2)
      assert.equal(healthy.jobIds.length, 4, 'Refusal must release admission/capture ownership.')
    })
  })
}

test('Anima batch synchronously owns mutable regional sidecars before awaiting publication', async () => {
  await withPublicAnima(async (fixture) => {
    await selectConcreteBatch(fixture)
    const original = fixture.orchestrator.enqueuePreparedAnimaRegionalBatch.bind(
      fixture.orchestrator,
    )
    let mutated = false
    fixture.orchestrator.enqueuePreparedAnimaRegionalBatch = async (tabId, input) => {
      const pending = original(tabId, input)
      const borrowed = input.regionalInputs.at(-1)!
      borrowed.recipe.item = { ...borrowed.recipe.item, seed: 999 }
      borrowed.recipe.regions[0].coverage.alpha.fill(255)
      mutated = true
      return await pending
    }
    try {
      const result = await queuedConcreteBatch(fixture, 2)
      assert.equal(mutated, true)
      assert.equal(result.jobIds.length, 4)
      for (const [index, id] of result.jobIds.entries()) {
        const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(id)
        assert.equal(frozen.input.recipe.item.seed, 123 + (index % 2))
        assert.deepEqual(frozen.input.recipe.regions[0].coverage.alpha, fixture.alpha)
      }
    } finally {
      fixture.orchestrator.enqueuePreparedAnimaRegionalBatch = original
    }
  })
})

for (const failure of ['runtime-release', 'capture-release'] as const) {
  test(`Anima dynamic batch late ${failure} failure cancels every admitted group member`, async () => {
    await withPublicAnima(async (fixture) => {
      await selectConcreteBatch(fixture)
      const capture = fixture.projects.withCapturedCurrentCanvasRegionalGenerationInput.bind(
        fixture.projects,
      )
      const sentinel = new Error(`Controlled Anima batch ${failure}`)
      if (failure === 'runtime-release') {
        fixture.controls.afterPreparation = async () => {
          throw sentinel
        }
      } else {
        fixture.projects.withCapturedCurrentCanvasRegionalGenerationInput = async (...args) => {
          await capture(...args)
          throw sentinel
        }
      }
      try {
        await assert.rejects(queuedConcreteBatch(fixture, 2), sentinel)
        const rows = await concreteRows(fixture)
        assert.equal(rows.length, 4)
        assert.equal(new Set(rows.map((row) => row.batch_id)).size, 1)
        assert.ok(rows.every((row) => row.status === 'canceled'))
        assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), [])
        for (const row of rows) {
          assert.equal(
            (await fixture.queue.loadVerifiedAnimaRegionalInput(row.id)).item.status,
            'canceled',
          )
        }
      } finally {
        fixture.controls.afterPreparation = undefined
        fixture.projects.withCapturedCurrentCanvasRegionalGenerationInput = capture
      }
      assert.equal((await queuedConcreteBatch(fixture, 2)).jobIds.length, 4)
    })
  })
}

test('Anima dynamic batch rejects an ABA-changed capture before composing or publishing', async () => {
  await withPublicAnima(async (fixture) => {
    await selectConcreteBatch(fixture)
    const before = structuredClone(fixture.document())
    fixture.controls.beforePreparation = async () => {
      await fixture.edit((document) => {
        document.regionalGuidance![0].name = 'Temporary capture edit'
      })
      await fixture.projects.undo(fixture.tabId)
      assert.notEqual(fixture.document().documentRevision, before.documentRevision)
      assert.deepEqual({ ...fixture.document(), documentRevision: before.documentRevision }, before)
    }
    await assert.rejects(queuedConcreteBatch(fixture, 2), { code: 'PROJECT_CHANGED' })
    assert.equal(fixture.calls.compose.length, 0)
    await assertUnpublishedBatch(fixture)
    fixture.controls.beforePreparation = undefined
    assert.equal((await queuedConcreteBatch(fixture, 2)).jobIds.length, 4)
  })
})

test('Anima batch files become visible before one atomic transaction and never as partial SQL', async () => {
  let published = 0
  let inspect = async (): Promise<number> =>
    assert.fail('Independent SQLite reader is not installed.')
  const visible: number[] = []
  await withPublicAnima(
    async (fixture) => {
      const observer = openAppDatabase(fixture.root, path.resolve('src/main/db/migrations'))
      inspect = async () =>
        (await observer.db.selectFrom('generation_queue_item').select('id').execute()).length
      try {
        await selectConcreteBatch(fixture)
        const result = await queuedConcreteBatch(fixture, 2)
        assert.equal(result.jobIds.length, 4)
        assert.equal(published, 4)
        assert.deepEqual(visible, [0, 0, 0, 0, 0])
        assert.equal(await inspect(), 4)
      } finally {
        await observer.close()
      }
    },
    {
      queueHooks: {
        afterInputPublish: async () => {
          published++
          visible.push(await inspect())
        },
        beforeBatchCommit: async () => {
          visible.push(await inspect())
        },
      },
    },
  )
})

test('Anima dynamic batch rolls back all files after a second-item publication failure', async () => {
  let published = 0
  const sentinel = new Error('Controlled second Anima input publication failure')
  await withPublicAnima(
    async (fixture) => {
      await selectConcreteBatch(fixture)
      const before = structuredClone(fixture.document())
      await assert.rejects(queuedConcreteBatch(fixture, 2), sentinel)
      assert.equal(published, 2)
      await assertUnpublishedBatch(fixture)
      assert.deepEqual(fixture.document(), before)
      assert.equal((await queuedConcreteBatch(fixture, 2)).jobIds.length, 4)
    },
    {
      queueHooks: {
        afterInputPublish: async () => {
          published++
          if (published === 2) {
            throw sentinel
          }
        },
      },
    },
  )
})

test('Anima dynamic batch aggregate staging refusal leaves no first-member publication', async () => {
  await withPublicAnima(async (fixture) => {
    await selectConcreteBatch(fixture)
    const preflight = fixture.staging.preflightRegionalBatchCapacity.bind(fixture.staging)
    const sentinel = new Error('Controlled aggregate Anima capacity refusal')
    let checked = 0
    fixture.staging.preflightRegionalBatchCapacity = async (input) => {
      checked++
      assert.equal(input.entries.length, 4)
      await preflight(input)
      throw sentinel
    }
    try {
      await assert.rejects(queuedConcreteBatch(fixture, 2), sentinel)
      assert.equal(checked, 1)
      await assertUnpublishedBatch(fixture)
    } finally {
      fixture.staging.preflightRegionalBatchCapacity = preflight
    }
    assert.equal((await queuedConcreteBatch(fixture, 2)).jobIds.length, 4)
  })
})

test('Anima selected dynamic OUT member Retry reloads only its frozen concrete input after saved edits', async () => {
  await withPublicAnima(async (fixture) => {
    await selectConcreteBatch(fixture, { mode: 'outpaint', seedBehavior: 'per-prompt' })
    const admitted = await queuedConcreteBatch(fixture, 2)
    assert.equal(admitted.jobIds.length, 4)
    for (const id of admitted.jobIds) {
      await fixture.orchestrator.cancelGenerationJob(id)
    }
    const sourceId = admitted.jobIds[2]
    const source = await fixture.queue.getManagerEntry(sourceId)
    const before = await fixture.queue.loadVerifiedAnimaRegionalInput(sourceId)
    const rowsBefore = await concreteRows(fixture)
    const rowBefore = rowsBefore.find((row) => row.id === sourceId)!
    const originalPng = await readFile(before.targetPath)
    inspectConcreteInput(before.input, {
      iteration: 0,
      mode: 'outpaint',
      pair: 1,
      positive: 'blue dog',
      seed: 125,
    })
    await fixture.edit((document) => {
      document.generationDraft.model = null
      document.generationDraft.dynamicPrompt = { maxPrompts: 1, seedBehavior: 'per-iteration' }
      document.generationDraft.positivePrompt.text = '{changed|authoring}'
      document.generationDraft.seed = { policy: 'fixed', value: 999 }
      document.generationDraft.sampling.animaMethod = 'euler'
      document.generationDraft.sampling.denoisingStrength = 1
      for (const region of document.regionalGuidance!) {
        region.enabled = false
      }
    })
    await fixture.projects.save(fixture.tabId)
    const edited = structuredClone(fixture.document())
    const saved = await readFile(fixture.packagePath)
    await fixture.projects.close(fixture.tabId)
    assert.equal((await fixture.projects.open(fixture.tabId)).kind, 'opened')
    const reloadedQueue = new GenerationQueueRepository(fixture.db, fixture.root)
    await reloadedQueue.recoverAfterRestart()
    const reloaded = await reloadedQueue.loadVerifiedAnimaRegionalInput(sourceId)
    assert.deepEqual(reloaded.input, before.input)
    fixture.compositionWorker.composeTarget = async () => {
      throw new Error('Frozen member Retry recomposed current source')
    }
    await fixture.actions.retryJob({ id: sourceId, statusSequence: source.statusSequence })
    const afterRows = await concreteRows(fixture)
    assert.equal(afterRows.length, 5)
    const clone = afterRows.find((row) => !admitted.jobIds.includes(row.id))!
    assert.equal(clone.frozen_payload_json, rowBefore.frozen_payload_json)
    assert.notEqual(clone.staging_session_id, rowBefore.staging_session_id)
    const after = await fixture.queue.loadVerifiedAnimaRegionalInput(clone.id)
    assert.ok((await readFile(after.targetPath)).equals(originalPng))
    assert.deepEqual(after.input.recipe, before.input.recipe)
    assert.deepEqual(after.input.compiledPrompts, before.input.compiledPrompts)
    assert.deepEqual(after.input.request.job.sampling, before.input.request.job.sampling)
    assert.equal(after.input.request.job.sampling.seed, 125)
    const sourceAfter = afterRows.find((row) => row.id === sourceId)!
    assert.equal(
      sourceAfter.status_sequence,
      rowBefore.status_sequence + 1,
      'Retry consumes the reviewed source sequence once.',
    )
    assert.deepEqual(
      {
        ...sourceAfter,
        status_sequence: rowBefore.status_sequence,
        updated_at: rowBefore.updated_at,
      },
      rowBefore,
    )
    assert.deepEqual(
      afterRows.filter((row) => admitted.jobIds.includes(row.id) && row.id !== sourceId),
      rowsBefore.filter((row) => row.id !== sourceId),
    )
    assert.deepEqual(fixture.document(), edited)
    assert.ok((await readFile(fixture.packagePath)).equals(saved))
  })
})

test('Anima malformed authoring Images values refuse before target capture or durable admission', async () => {
  await withPublicAnima(async (fixture) => {
    await selectConcreteBatch(fixture)
    const before = structuredClone(fixture.document())
    for (const iterations of [0, -1, 1.5, 101, Number.NaN, Number.POSITIVE_INFINITY, true, '2']) {
      await assert.rejects(queuedConcreteBatch(fixture, iterations as unknown as number), {
        code: 'GENERATION_INVALID_REQUEST',
      })
      assert.equal(fixture.calls.compose.length, 0)
      await assertUnpublishedBatch(fixture)
      assert.deepEqual(fixture.document(), before)
    }
  })
})

for (const branch of ['global-negative', 'regional-positive', 'regional-negative'] as const) {
  test(`Anima public dynamic batch keeps ${branch} static without partial publication`, async () => {
    await withPublicAnima(async (fixture) => {
      await selectConcreteBatch(fixture)
      await fixture.edit((document) => {
        const prompts = document.regionalGuidance![0].prompts!
        prompts.useGlobalNegativePrompt = false
        prompts.negative = { embeddingRefs: [], text: '' }
        if (branch === 'global-negative') {
          document.generationDraft.negativePrompt.text = '{bad|worse}'
        }
        if (branch === 'regional-positive') {
          prompts.positive!.text = '{red|blue}'
        }
        if (branch === 'regional-negative') {
          prompts.negative.text = '{bad|worse}'
        }
      })
      const before = structuredClone(fixture.document())
      const saved = await readFile(fixture.packagePath)
      await assert.rejects(
        queuedConcreteBatch(fixture, 2),
        /static global negative and regional|local negative/,
      )
      assert.equal(fixture.calls.compose.length, 0)
      await assertUnpublishedBatch(fixture)
      assert.deepEqual(fixture.document(), before)
      assert.ok((await readFile(fixture.packagePath)).equals(saved))
    })
  })
}

/** Exact-resource fixture doubles; real capture, planner, files, SQLite and frozen reload. */
async function enableRegionalLoraStack(
  fixture: PublicAnimaFixture,
  mode: BatchMode,
): Promise<void> {
  await selectConcreteBatch(fixture, { mode, positive: 'one fixed scene' })
  fixture.controls.ready.capabilities = [
    ...fixture.controls.ready.capabilities,
    'anima-regional-lora-v1',
  ]
  await fixture.edit((document) => {
    for (const entry of document.generationDraft.loras) {
      entry.enabled = true
    }
  })
}

for (const mode of ['txt2img', 'img2img', 'outpaint'] as const) {
  test(`Anima regional ${mode} freezes exact signed and zero LoRAs independently for every concrete member`, async () => {
    await withPublicAnima(async (fixture) => {
      await enableRegionalLoraStack(fixture, mode)
      const before = structuredClone(fixture.document())
      const saved = await readFile(fixture.packagePath)
      const result = await queuedConcreteBatch(fixture, 2)
      assert.equal(result.jobIds.length, 2)
      const payloads = []
      for (const [iteration, id] of result.jobIds.entries()) {
        const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(id)
        assert.equal(frozen.input.recipe.item.iteration, iteration)
        assert.deepEqual(frozen.payload.context.loraStack, before.generationDraft.loras)
        assert.deepEqual(
          frozen.payload.context.loras.map((entry) => entry.weight),
          [-0.7, 0, 1.2],
        )
        assert.equal(frozen.input.request.job.loras.length, 3)
        for (const [index, resource] of frozen.input.request.job.loras.entries()) {
          const bytes = await readFile(resource.path)
          assert.equal(resource.byteSize, bytes.length)
          assert.equal(resource.sha256, regionalProjectDigest(bytes))
          assert.equal(resource.sha256, before.generationDraft.loras[index].resource.fileSha256)
          assert.equal(resource.weight, before.generationDraft.loras[index].weight)
          assert.deepEqual(
            frozen.payload.context.loras[index].reference,
            before.generationDraft.loras[index].resource,
          )
        }
        const details = await fixture.queue.getManagerEntry(id)
        assert.equal(details.details?.requiresRegionalLora, true)
        payloads.push(frozen)
      }
      assert.notEqual(payloads[0].input.request.requestId, payloads[1].input.request.requestId)
      assert.equal((await fixture.actions.getState(fixture.tabId)).animaRegionalLoraSupported, true)
      assert.deepEqual(fixture.document(), before)
      assert.ok((await readFile(fixture.packagePath)).equals(saved))
    })
  })

  test(`Anima regional ${mode} enabled zero requires the new peer before composition; disabled-only preserves legacy admission`, async () => {
    await withPublicAnima(async (fixture) => {
      await enableRegionalLoraStack(fixture, mode)
      fixture.controls.ready.capabilities = fixture.controls.ready.capabilities.filter(
        (cap) => cap !== 'anima-regional-lora-v1',
      )
      await fixture.edit((document) => {
        document.generationDraft.loras.forEach((entry, index) => {
          entry.enabled = index === 1
        })
      })
      assert.equal(fixture.document().generationDraft.loras[1].weight, 0)
      await assert.rejects(queuedConcreteBatch(fixture, 1), /runtime|Regional Guidance/i)
      assert.equal(fixture.calls.compose.length, 0)
      await assertUnpublishedBatch(fixture)
      assert.equal(
        (await fixture.actions.getState(fixture.tabId)).animaRegionalLoraSupported,
        false,
      )
      await fixture.edit((document) => {
        document.generationDraft.loras.forEach((entry) => {
          entry.enabled = false
        })
      })
      const result = await queuedConcreteBatch(fixture, 1)
      const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(result.jobIds[0])
      assert.deepEqual(frozen.input.request.job.loras, [])
      assert.equal(
        (await fixture.queue.getManagerEntry(result.jobIds[0])).details?.requiresRegionalLora,
        undefined,
      )
      assert.equal(frozen.payload.context.loraStack.length, 3)
    })
  })

  test(`Anima regional ${mode} frozen LoRA Retry ignores current cleared or changed stack and gates the saved resources`, async () => {
    await withPublicAnima(async (fixture) => {
      await enableRegionalLoraStack(fixture, mode)
      const admitted = await queuedConcreteBatch(fixture, 1)
      const id = admitted.jobIds[0]
      const original = await fixture.queue.loadVerifiedAnimaRegionalInput(id)
      await fixture.orchestrator.cancelGenerationJob(id)
      const reviewed = await fixture.queue.getManagerEntry(id)
      await fixture.edit((document) => {
        document.generationDraft.loras = []
        document.generationDraft.sampling.animaMethod = 'euler'
        document.generationDraft.positivePrompt.text = 'later unrelated authoring'
        document.regionalGuidance = []
      })
      await fixture.projects.save(fixture.tabId)
      const current = structuredClone(fixture.document())
      const saved = await readFile(fixture.packagePath)
      fixture.controls.ready.capabilities = fixture.controls.ready.capabilities.filter(
        (cap) => cap !== 'anima-regional-lora-v1',
      )
      await assert.rejects(
        fixture.actions.retryJob({ id, statusSequence: reviewed.statusSequence }),
        /runtime|Anima Regional Guidance/i,
      )
      assert.equal((await concreteRows(fixture)).length, 1)
      fixture.controls.ready.capabilities = [
        ...fixture.controls.ready.capabilities,
        'anima-regional-lora-v1',
      ]
      await fixture.actions.retryJob({ id, statusSequence: reviewed.statusSequence })
      const rows = await concreteRows(fixture)
      assert.equal(rows.length, 2)
      const retryId = rows.find((row) => row.id !== id)!.id
      const retry = await fixture.queue.loadVerifiedAnimaRegionalInput(retryId)
      assert.deepEqual(retry.payload.context, original.payload.context)
      assert.deepEqual(retry.input.recipe, original.input.recipe)
      assert.deepEqual(retry.input.compiledPrompts, original.input.compiledPrompts)
      assert.deepEqual(retry.input.request.job.loras, original.input.request.job.loras)
      assert.equal(
        (await fixture.queue.getManagerEntry(retryId)).details?.requiresRegionalLora,
        true,
      )
      assert.deepEqual(fixture.document(), current)
      assert.ok((await readFile(fixture.packagePath)).equals(saved))
    })
  })

  test(`Anima regional ${mode} later LoRA resolution failure publishes no member or sidecar`, async () => {
    await withPublicAnima(async (fixture) => {
      await enableRegionalLoraStack(fixture, mode)
      const models = fixture.models as AnimaGenerationModelResolver & typeof fixture.models
      const resolve = models.resolveVerifiedAnimaGenerationLoraForPlan.bind(models)
      const last = fixture.document().generationDraft.loras[2].resource.localVersionId
      const calls: (string | null)[] = []
      models.resolveVerifiedAnimaGenerationLoraForPlan = async (reference) => {
        calls.push(reference.localVersionId)
        if (reference.localVersionId === last) {
          throw new Error('later exact LoRA resolution failure')
        }
        return await resolve(reference)
      }
      const before = structuredClone(fixture.document())
      const saved = await readFile(fixture.packagePath)
      await assert.rejects(queuedConcreteBatch(fixture, 2), /later exact LoRA resolution failure/)
      assert.deepEqual(
        calls,
        before.generationDraft.loras.map((entry) => entry.resource.localVersionId),
      )
      await assertUnpublishedBatch(fixture)
      assert.deepEqual(fixture.document(), before)
      assert.ok((await readFile(fixture.packagePath)).equals(saved))
    })
  })
}

for (const location of ['scratch', 'target', 'output'] as const) {
  test(`Anima regional LoRA transport refuses a descriptor overlapping its ${location}`, async () => {
    await withPublicAnima(async (fixture) => {
      await enableRegionalLoraStack(fixture, 'txt2img')
      const admitted = await queuedConcreteBatch(fixture, 1)
      const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(admitted.jobIds[0])
      const original = frozen.input.request
      const request = {
        ...original,
        job: {
          ...original.job,
          loras: original.job.loras.map((entry, index) =>
            index === 0
              ? {
                  ...entry,
                  path:
                    location === 'scratch'
                      ? path.join(fixture.scratch, 'unsafe-resource.safetensors')
                      : location === 'target'
                        ? original.job.target.path
                        : original.job.output.pngPath,
                }
              : { ...entry },
          ),
        },
      } as AnimaRegionalWorkerInput['request']
      const before = await fixtureFileTree(fixture.scratch)
      await assert.rejects(
        prepareAnimaRegionalWorkerRequest({ ...frozen.input, request }, fixture.scratch),
        /Anima regional input is invalid/,
      )
      assert.deepEqual(await fixtureFileTree(fixture.scratch), before)
    })
  })
}

test('actual regional dispatch refuses enabled zero LoRA on an otherwise qualified legacy peer before sending a request', async () => {
  await withPublicAnima(async (fixture) => {
    await enableRegionalLoraStack(fixture, 'txt2img')
    await fixture.edit((document) => {
      document.generationDraft.loras.forEach((entry, index) => {
        entry.enabled = index === 1
      })
    })
    const admitted = await queuedConcreteBatch(fixture, 1)
    const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(admitted.jobIds[0])
    const root = path.join(fixture.root, 'controlled-dispatch-peer')
    await mkdir(root)
    const executable = path.join(root, 'python')
    const requestLog = path.join(root, 'requests')
    const ready = {
      ...fixture.controls.ready,
      capabilities: fixture.controls.ready.capabilities
        .filter((cap) => cap !== 'anima-regional-lora-v1')
        .concat('linux-owned-inference-v1'),
      pythonVersion: '3.12.13',
      type: 'ready',
    }
    await writeFile(
      executable,
      `#!${process.execPath}\nconst fs=require('node:fs');\nprocess.stdout.write(${JSON.stringify(`${JSON.stringify(ready)}\n`)});\nprocess.stdin.on('data', chunk=>fs.appendFileSync(${JSON.stringify(requestLog)},chunk));\nprocess.stdin.resume();\nprocess.on('SIGTERM',()=>process.exit(0));\n`,
    )
    await chmod(executable, 0o700)
    const client = await GenerationWorkerClient.start({
      pythonExecutable: executable,
      runtimeRoot: root,
      scratchBasePath: fixture.scratch,
    })
    try {
      await assert.rejects(
        client.executeCurrentCanvasRegional(frozen.input),
        (error) =>
          error instanceof GenerationWorkerError && error.code === 'WORKER_VERSION_MISMATCH',
      )
      assert.equal((await readdir(root)).includes('requests'), false)
      assert.deepEqual(await fixtureFileTree(fixture.scratch), [])
    } finally {
      await client.close()
    }
  })
})

async function selectSignedNegativeFixture(
  fixture: PublicAnimaFixture,
  mode: BatchMode,
  method: (typeof ANIMA_SAMPLING_METHOD_KEYS)[number] = 'euler',
): Promise<void> {
  await selectConcreteBatch(fixture, { method, mode, positive: 'one fixed signed scene' })
  await fixture.edit((document) => {
    document.generationDraft.negativePrompt = { embeddingRefs: [], text: '(blur)0.75, noise' }
    for (const [index, region] of document.regionalGuidance!.entries()) {
      region.prompts!.useGlobalNegativePrompt = index !== 0
      region.prompts!.negative = {
        embeddingRefs: [],
        text: index === 0 ? '(red scarf)1.5' : '{dormant|negative}',
      }
    }
  })
}

for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
  for (const mode of ['txt2img', 'img2img', 'outpaint'] as const) {
    test(`Anima regional ${mode} ${method} signed negatives require actual capability before publication`, async () => {
      await withPublicAnima(async (fixture) => {
        await selectSignedNegativeFixture(fixture, mode, method)
        await fixture.edit((document) => {
          document.generationDraft.sampling.cfgScale = method === 'euler' ? 1 : 4
        })
        const before = structuredClone(fixture.document())
        const saved = await readFile(fixture.packagePath)
        await assert.rejects(queuedConcreteBatch(fixture, 1), {
          code: 'GENERATION_RUNTIME_UNAVAILABLE',
        })
        assert.equal(fixture.calls.compose.length, 0)
        await assertUnpublishedBatch(fixture)
        assert.equal(
          (await fixture.actions.getState(fixture.tabId)).animaRegionalNegativeSupported,
          false,
        )
        ;(fixture.controls.ready.capabilities as string[]).push('anima-regional-negative-v1')
        const queued = await queuedConcreteBatch(fixture, 1)
        assert.equal(queued.jobIds.length, 1)
        const frozen = await fixture.queue.loadVerifiedAnimaRegionalInput(queued.jobIds[0])
        const negatives = frozen.input.compiledPrompts.filter(
          (entry) => entry.sourceId !== 'current-canvas' && entry.polarity === 'negative',
        )
        assert.equal(
          negatives.length,
          before.regionalGuidance!.filter((region) => region.enabled).length,
        )
        assert.equal(negatives[0].text, '(red scarf)1.5')
        assert.ok(negatives.slice(1).every((entry) => entry.text === '(blur)0.75, noise'))
        assert.equal(frozen.input.request.job.sampling.scheduler, method)
        assert.equal(frozen.input.request.job.sampling.guidanceScale, method === 'euler' ? 1 : 4)
        assert.equal(frozen.input.recipe.regions[0].negative.source, 'regional')
        assert.ok(
          frozen.input.recipe.regions
            .slice(1)
            .every((region) => region.negative.source === 'current-canvas'),
        )
        assert.equal(Object.hasOwn(frozen.payload, 'negativeProfile'), false)
        assert.equal(Object.hasOwn(frozen.input, 'negativeProfile'), false)
        assert.equal(
          (await fixture.actions.getState(fixture.tabId)).animaRegionalNegativeSupported,
          true,
        )
        assert.deepEqual(fixture.document(), before)
        assert.ok((await readFile(fixture.packagePath)).equals(saved))
      })
    })
  }
}

for (const mode of ['txt2img', 'img2img', 'outpaint'] as const) {
  test(`Anima regional ${mode} signed frozen Retry gates saved negatives after current text and masks are cleared`, async () => {
    await withPublicAnima(async (fixture) => {
      await selectSignedNegativeFixture(fixture, mode, 'heun')
      ;(fixture.controls.ready.capabilities as string[]).push('anima-regional-negative-v1')
      const queued = await queuedConcreteBatch(fixture, 1)
      const id = queued.jobIds[0]
      const original = await fixture.queue.loadVerifiedAnimaRegionalInput(id)
      await fixture.orchestrator.cancelGenerationJob(id)
      const reviewed = await fixture.queue.getManagerEntry(id)
      await fixture.edit((document) => {
        document.generationDraft.negativePrompt.text = ''
        document.generationDraft.positivePrompt.text = 'later unrelated scene'
        document.generationDraft.sampling.animaMethod = 'euler'
        document.generationDraft.sampling.denoisingStrength = 0.2
        document.regionalGuidance = []
      })
      await fixture.projects.save(fixture.tabId)
      const current = structuredClone(fixture.document())
      const saved = await readFile(fixture.packagePath)
      fixture.compositionWorker.composeTarget = async () =>
        assert.fail('Signed frozen Retry must not recompose current text or source')
      fixture.controls.ready.capabilities = fixture.controls.ready.capabilities.filter(
        (capability) => capability !== 'anima-regional-negative-v1',
      )
      await assert.rejects(
        fixture.actions.retryJob({ id, statusSequence: reviewed.statusSequence }),
        { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
      )
      assert.equal((await concreteRows(fixture)).length, 1)
      ;(fixture.controls.ready.capabilities as string[]).push('anima-regional-negative-v1')
      await fixture.actions.retryJob({ id, statusSequence: reviewed.statusSequence })
      const rows = await concreteRows(fixture)
      assert.equal(rows.length, 2)
      const retried = await fixture.queue.loadVerifiedAnimaRegionalInput(
        rows.find((row) => row.id !== id)!.id,
      )
      assert.deepEqual(retried.payload.context, original.payload.context)
      assert.deepEqual(retried.input.recipe, original.input.recipe)
      assert.deepEqual(retried.input.compiledPrompts, original.input.compiledPrompts)
      assert.deepEqual(retried.input.request.job.sampling, original.input.request.job.sampling)
      assert.deepEqual(fixture.document(), current)
      assert.ok((await readFile(fixture.packagePath)).equals(saved))
    })
  })

  test(`Anima regional ${mode} old empty-negative Retry ignores later signed draft without a new capability`, async () => {
    await withPublicAnima(async (fixture) => {
      await selectConcreteBatch(fixture, {
        method: 'euler',
        mode,
        positive: 'old ordinary negative control',
      })
      const queued = await queuedConcreteBatch(fixture, 1)
      const id = queued.jobIds[0]
      await fixture.orchestrator.cancelGenerationJob(id)
      const reviewed = await fixture.queue.getManagerEntry(id)
      await fixture.edit((document) => {
        document.generationDraft.negativePrompt.text = 'later inherited negative'
        for (const region of document.regionalGuidance!) {
          region.prompts!.negative = { embeddingRefs: [], text: 'later local negative' }
          region.prompts!.useGlobalNegativePrompt = false
        }
      })
      assert.equal(
        fixture.controls.ready.capabilities.includes('anima-regional-negative-v1'),
        false,
      )
      await fixture.actions.retryJob({ id, statusSequence: reviewed.statusSequence })
      const rows = await concreteRows(fixture)
      assert.equal(rows.length, 2)
      const retried = await fixture.queue.loadVerifiedAnimaRegionalInput(
        rows.find((row) => row.id !== id)!.id,
      )
      assert.equal(
        retried.input.compiledPrompts.filter(
          (entry) => entry.sourceId !== 'current-canvas' && entry.polarity === 'negative',
        ).length,
        0,
      )
    })
  })
}
