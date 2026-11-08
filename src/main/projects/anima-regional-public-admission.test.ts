import { ANIMA_SAMPLING_METHOD_KEYS } from '../../shared/projects/anima-sampling-method.js'

import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { RegionalProjectFixture } from './test-fixtures/regional-project.js'

import { LAMA_OUTPAINT_ARTIFACT } from '../runtime/lama-manifest.js'
import { ProjectGenerationActionController } from './generation-action-controller.js'
import { GenerationOrchestrator } from './generation-orchestrator.js'
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
        infillAvailable: boolean
        infillPath: string
        ready: ReturnType<RegionalProjectFixture['input']>['ready']
      }
      coordinator: ProjectRegionalGenerationCoordinator
    },
  ) => Promise<void>,
) {
  await withAnimaBatchFixture(async (anima) => {
    const fixture = await createRegionalProjectFixture()
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
    const controls = {
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
      withGenerationPreparation: async (_scratch, callback) =>
        await callback({
          inferenceReady: structuredClone(controls.ready),
          targetWorker: fixture.compositionWorker,
        }),
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

test('new Generate refuses ordinary-only runtime and inherited nonempty negatives before publishing any job', async () => {
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
      /turn off Use global negative prompt/,
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
