import { ANIMA_SAMPLING_METHOD_KEYS } from '../../shared/projects/anima-sampling-method.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { isRasterGenerationConfigurationV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { AnimaProjectPreparationFixture } from './test-fixtures/anima-project-preparation.js'

import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'
import { ANIMA_BATCH_READY } from './test-fixtures/anima-batch.js'
import {
  animaFixtureSha256,
  animaProjectComposerAvailable,
  withAnimaProjectPreparationFixture,
} from './test-fixtures/anima-project-preparation.js'

const composer = { skip: !animaProjectComposerAvailable() }

function input(fixture: AnimaProjectPreparationFixture) {
  return {
    iterations: 2,
    modelService: fixture.modelService,
    ready: structuredClone(ANIMA_BATCH_READY),
    worker: fixture.worker,
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

async function durableState(fixture: AnimaProjectPreparationFixture) {
  return {
    cursor: await fixture.database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
    queue: await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute(),
    receipts: await fixture.database.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .execute(),
  }
}

async function seedCursor(
  fixture: AnimaProjectPreparationFixture,
  localProjectKey: string,
  documentId: string,
  seed: number,
) {
  await fixture.database.db
    .insertInto('generation_seed_cursor')
    .values({
      actual_seed: seed,
      candidate_id: randomUUID(),
      completion_order: 1,
      document_id: documentId,
      local_project_key: localProjectKey,
      updated_at: '2026-10-05T00:00:00.000Z',
    })
    .execute()
}

// Boundary: real Main Project capture -> scoped SQLite seed -> actual derivatives composition ->
// exact managed bundle/ordinary LoRA -> batch compilers -> scoped request files. Neighbor modes,
// methods and policies differ in one condition. Mutations must reveal live rereads, wrong seed
// ownership/zero handling, RNG per item, capability drift, partial callbacks or durable publication.
test(
  'Main Anima batch retains captured Project, raster, options and Reuse zero during a scoped seed await',
  composer,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const { first, lora, scratch, second, service } = fixture
      const opened = await fixture.importProject({
        draft: { seed: { policy: 'reuse', value: null } },
        lastActualSeedSnapshot: 91,
        raster: true,
      })
      await seedCursor(fixture, opened.tabId, opened.document.documentId, 0)
      const beforePackage = await readFile(opened.packagePath)
      const beforeDurable = await durableState(fixture)
      const sentinel = path.join(scratch, 'unrelated.txt')
      await writeFile(sentinel, 'keep this unrelated file')
      const entered = deferred()
      const resume = deferred()
      fixture.setSeedReadHook(async () => {
        entered.resolve()
        await resume.promise
      })
      const options = input(fixture)
      let observedAfterEdits: ReturnType<typeof service.getOpenDocumentForAcceptance>
      let requestStage = ''
      const pending = service.withPreparedAnimaGenerationBatch(
        opened.tabId,
        options,
        async ({ preparedBatch, requests }) => {
          const { context } = preparedBatch
          assert.deepEqual(context.generationDraft, opened.document.generationDraft)
          assert.deepEqual(context.bbox, opened.document.primaryBbox)
          assert.equal(context.documentId, opened.document.documentId)
          assert.equal(context.documentRevision, opened.document.documentRevision)
          assert.equal(context.sampling.seed, 0)
          assert.equal(context.sampling.requestedSeedPolicy, 'reuse')
          assert.equal(context.sampling.animaMethod, 'heun')
          assert.equal(context.mode, 'img2img')
          assert.equal(context.model.checkpoint.managedPath, first.managedPath)
          assert.deepEqual(context.model.checkpoint.reference, first.reference)
          assert.equal(context.loras[0].managedPath, lora.managedPath)
          assert.equal(context.loras[0].weight, -0.5)
          assert.equal(requests.length, 4)
          assert.deepEqual(
            preparedBatch.items.map((item) => item.seed),
            [0, 1, 0, 1],
          )
          assert.deepEqual(
            preparedBatch.items.map((item) => item.prompts.positive),
            ['(lantern:1.5) red', '(lantern:1.5) red', '(lantern:1.5) blue', '(lantern:1.5) blue'],
          )
          requestStage = requests[0].job.output.stagingRoot
          const png = await readFile(requests[0].job.target.path)
          assert.equal(animaFixtureSha256(png), context.target.sha256)
          assert.equal(context.target.iccSha256, IGS_SRGB_ICC_SHA256)
          assert.deepEqual(png, preparedBatch.targetPngBytes)
          assert.equal(png.readUInt32BE(16), 64)
          assert.equal(png.readUInt32BE(20), 64)
          for (const [index, request] of requests.entries()) {
            assert.equal(request.type, 'generate-anima-img2img')
            assert.deepEqual(request.job.bbox, opened.document.primaryBbox)
            assert.deepEqual(request.job.prompts, preparedBatch.items[index].compiledPrompts)
            assert.deepEqual(request.job.sampling, preparedBatch.items[index].samplingPlan)
            assert.equal(request.job.model.checkpoint.path, first.managedPath)
            assert.equal(request.job.loras[0].weight, -0.5)
            assert.equal(request.job.sampling.strength, 0.5)
          }
          assert.deepEqual(
            service.getOpenDocumentForAcceptance(opened.tabId)!.document,
            observedAfterEdits!.document,
          )
          return 'consumed'
        },
      )
      try {
        await Promise.race([
          entered.promise,
          pending.then(() =>
            assert.fail('The scoped Reuse reader must be reached before consumption'),
          ),
        ])
        assert.ok((await readdir(scratch)).some((entry) => entry.startsWith('project-target-')))
        await service.updateGenerationDraft(opened.tabId, {
          kind: 'positive-prompt',
          text: 'later live prompt',
        })
        await service.updateGenerationDraft(opened.tabId, {
          kind: 'negative-prompt',
          text: 'later live negative',
        })
        await service.updateGenerationDraft(opened.tabId, { kind: 'anima-method', value: 'lcm' })
        await service.updateGenerationDraft(opened.tabId, {
          kind: 'seed',
          policy: 'fixed',
          value: 765,
        })
        await service.updateGenerationDraft(opened.tabId, {
          kind: 'dynamic-prompt',
          value: { maxPrompts: 1, seedBehavior: 'per-prompt' },
        })
        await service.setPrimaryBbox(opened.tabId, { height: 72, width: 80, x: 700, y: -300 })
        await service.setGenerationModel(opened.tabId, second.reference)
        await service.updateRasterLayer(opened.tabId, opened.document.layers[0].id, {
          kind: 'visibility',
          visible: false,
        })
        await fixture.modelRepository.setDefaultVersion(
          first.reference.localModelId,
          second.reference.localVersionId,
        )
        options.iterations = 1
        options.ready.capabilities.length = 0
        observedAfterEdits = service.getOpenDocumentForAcceptance(opened.tabId)
        const afterEdits = structuredClone(observedAfterEdits!.document)
        resume.resolve()
        await assert.doesNotReject(
          pending,
          'The captured ready advertisement must survive caller edits',
        )
        assert.equal(await pending, 'consumed')
        assert.deepEqual(service.getOpenDocumentForAcceptance(opened.tabId)!.document, afterEdits)
        assert.deepEqual(fixture.seedReads, [
          { documentId: opened.document.documentId, localProjectKey: opened.tabId },
        ])
        assert.deepEqual(await readFile(opened.packagePath), beforePackage)
        assert.deepEqual(await durableState(fixture), beforeDurable)
        assert.equal(existsSync(requestStage), false)
        assert.deepEqual(await readdir(scratch), ['unrelated.txt'])
        assert.equal(await readFile(sentinel, 'utf8'), 'keep this unrelated file')
      } finally {
        resume.resolve()
        await pending.catch(() => undefined)
      }
    })
  },
)

test(
  'Main Anima requests retain original prompts, method, file and signed adapter while real model qualification awaits',
  composer,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const opened = await fixture.importProject()
      const entered = deferred()
      const resume = deferred()
      let calls = 0
      fixture.setQualificationHook(async () => {
        if (++calls === 1) {
          entered.resolve()
          await resume.promise
        }
      })
      const options = {
        ...input(fixture),
        randomUint32: () => assert.fail('Fixed must not consume Random'),
      }
      const pending = fixture.service.withPreparedAnimaGenerationBatch(
        opened.tabId,
        options,
        async ({ preparedBatch, requests }) => {
          assert.deepEqual(preparedBatch.context.generationDraft, opened.document.generationDraft)
          assert.deepEqual(
            preparedBatch.items.map((item) => item.seed),
            [0xff_ff_ff_ff, 0, 0xff_ff_ff_ff, 0],
          )
          assert.equal(requests[0].job.model.checkpoint.path, fixture.first.managedPath)
          assert.equal(requests[0].job.sampling.scheduler, 'heun')
          assert.equal(requests[0].job.sampling.totalSteps, 7)
          assert.equal(requests[0].job.loras[0].weight, -0.5)
          assert.equal(requests[0].job.prompts.positive.cleanedText, 'lantern red')
          assert.equal(requests[0].job.prompts.negative.cleanedText, 'blur')
        },
      )
      try {
        await Promise.race([
          entered.promise,
          pending.then(() =>
            assert.fail('The exact model qualifier must be reached before consumption'),
          ),
        ])
        await fixture.service.updateGenerationDraft(opened.tabId, {
          kind: 'positive-prompt',
          text: 'later qualification edit',
        })
        await fixture.service.updateGenerationDraft(opened.tabId, {
          kind: 'anima-method',
          value: 'euler',
        })
        await fixture.service.setGenerationModel(opened.tabId, fixture.second.reference)
        await fixture.service.updateGenerationDraft(opened.tabId, {
          kind: 'lora-weight',
          resourceId: fixture.lora.reference.localModelId,
          value: 2,
          versionId: fixture.lora.reference.localVersionId,
        })
        resume.resolve()
        await pending
        assert.deepEqual(fixture.seedReads, [])
        assert.deepEqual(await readdir(fixture.scratch), [])
      } finally {
        resume.resolve()
        await pending.catch(() => undefined)
      }
    })
  },
)

test(
  'Main Anima Random chooses one captured base for all concrete per-prompt items without reading or writing the cursor',
  composer,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const opened = await fixture.importProject({
        draft: {
          dynamicPrompt: { maxPrompts: 2, seedBehavior: 'per-prompt' },
          seed: { policy: 'random', value: null },
        },
      })
      const before = await durableState(fixture)
      const document = fixture.service.getOpenDocumentForAcceptance(opened.tabId)!.document
      let randomCalls = 0
      await fixture.service.withPreparedAnimaGenerationBatch(
        opened.tabId,
        {
          ...input(fixture),
          randomUint32: () => {
            randomCalls++
            return 0xff_ff_ff_ff
          },
        },
        async ({ preparedBatch, requests }) => {
          assert.equal(randomCalls, 1)
          assert.equal(preparedBatch.context.sampling.requestedSeedPolicy, 'random')
          assert.deepEqual(
            requests.map((request) => request.job.sampling.seed),
            [0xff_ff_ff_ff, 0, 1, 2],
          )
          assert.deepEqual(
            requests.map((request) => request.job.sampling.stepSeed),
            [0xff_ff_ff_ff, 0, 1, 2],
          )
        },
      )
      assert.equal(randomCalls, 1)
      assert.deepEqual(fixture.seedReads, [])
      assert.deepEqual(await durableState(fixture), before)
      assert.deepEqual(
        fixture.service.getOpenDocumentForAcceptance(opened.tabId)!.document,
        document,
      )
    })
  },
)

test(
  'Main Anima Reuse reads only its captured document then falls back to saved snapshot; missing/error refuses before pixels',
  composer,
  async (t) => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      for (const scenario of [
        'operational-zero',
        'other-document',
        'saved-zero',
        'missing',
        'reader-error',
      ] as const) {
        await t.test(scenario, async () => {
          const snapshot =
            scenario === 'other-document' || scenario === 'reader-error'
              ? 81
              : scenario === 'saved-zero'
                ? 0
                : null
          const opened = await fixture.importProject({
            draft: { seed: { policy: 'reuse', value: null } },
            lastActualSeedSnapshot: snapshot,
          })
          if (scenario === 'operational-zero' || scenario === 'other-document') {
            await seedCursor(
              fixture,
              opened.tabId,
              scenario === 'other-document' ? randomUUID() : opened.document.documentId,
              0,
            )
          }
          fixture.setSeedReadHook(
            scenario === 'reader-error'
              ? async () => {
                  throw new Error('operational read failed')
                }
              : undefined,
          )
          let composed = 0
          const options = {
            ...input(fixture),
            randomUint32: () => assert.fail('Reuse must not consume Random'),
            worker: {
              composeTarget: async (
                request: Parameters<typeof fixture.worker.composeTarget>[0],
              ) => {
                composed++
                return await fixture.worker.composeTarget(request)
              },
            },
          }
          const pending = fixture.service.withPreparedAnimaGenerationBatch(
            opened.tabId,
            options,
            async ({ preparedBatch }) => {
              assert.equal(
                preparedBatch.context.sampling.seed,
                scenario === 'other-document' ? 81 : 0,
              )
            },
          )
          if (scenario === 'missing') {
            await assert.rejects(pending, { code: 'GENERATION_SEED_UNAVAILABLE' })
          } else if (scenario === 'reader-error') {
            await assert.rejects(pending, /operational read failed/)
          } else {
            await pending
          }
          assert.equal(composed, scenario === 'missing' || scenario === 'reader-error' ? 0 : 1)
          assert.deepEqual(await readdir(fixture.scratch), [])
        })
      }
    })
  },
)

test(
  'Main Anima service composes both real alpha modes and all six explicit native methods',
  composer,
  async (t) => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      for (const raster of [false, true]) {
        for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
          await t.test(`${raster ? 'img2img' : 'txt2img'} ${method}`, async () => {
            const opened = await fixture.importProject({
              draft: {
                sampling: {
                  animaMethod: method,
                  cfgScale: 5,
                  denoisingStrength: raster ? 0.5 : null,
                  sampler: null,
                  scheduler: null,
                  steps: 4,
                },
              },
              raster,
            })
            await fixture.service.withPreparedAnimaGenerationBatch(
              opened.tabId,
              { ...input(fixture), iterations: 1 },
              async ({ preparedBatch, requests }) => {
                assert.equal(preparedBatch.context.mode, raster ? 'img2img' : 'txt2img')
                assert.equal(
                  requests[0].type,
                  raster ? 'generate-anima-img2img' : 'generate-anima-txt2img',
                )
                assert.equal(requests[0].job.sampling.scheduler, method)
                assert.equal(requests[0].job.sampling.strength, raster ? 0.5 : null)
                assert.equal(requests[0].job.target.width, 64)
                assert.equal(requests[0].job.target.height, 64)
                assert.equal(
                  requests[0].job.target.sha256,
                  animaFixtureSha256(await readFile(requests[0].job.target.path)),
                )
              },
            )
          })
        }
      }
      assert.deepEqual(await readdir(fixture.scratch), [])
    })
  },
)

test(
  'Main Anima known peer/iterations/options and cap32 failures refuse before composition with public Illustrious admission still closed',
  composer,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const opened = await fixture.importProject()
      let composed = 0
      let consumed = 0
      const options = {
        ...input(fixture),
        worker: {
          composeTarget: async (request: Parameters<typeof fixture.worker.composeTarget>[0]) => {
            composed++
            return await fixture.worker.composeTarget(request)
          },
        },
      }
      const consume = async () => {
        consumed++
      }
      await assert.rejects(
        fixture.service.withPreparedAnimaGenerationBatch(
          opened.tabId,
          { ...options, ready: { ...options.ready, workerVersion: '0.10.0' } },
          consume,
        ),
        { code: 'INFERENCE_UNAVAILABLE' },
      )
      await assert.rejects(
        fixture.service.withPreparedAnimaGenerationBatch(
          opened.tabId,
          { ...options, iterations: 0 },
          consume,
        ),
        { code: 'GENERATION_BATCH_INVALID' },
      )
      await assert.rejects(
        fixture.service.withPreparedAnimaGenerationBatch(
          opened.tabId,
          { ...options, iterations: 17 },
          consume,
        ),
        { code: 'BATCH_TOO_LARGE' },
      )
      await fixture.service.updateGenerationDraft(opened.tabId, { kind: 'cfg-rescale', value: 0.2 })
      await assert.rejects(
        fixture.service.withPreparedAnimaGenerationBatch(opened.tabId, options, consume),
        { code: 'GENERATION_ADVANCED_UNSUPPORTED' },
      )
      await fixture.service.updateGenerationDraft(opened.tabId, { kind: 'cfg-rescale', value: 0 })
      await fixture.service.updateGenerationDraft(opened.tabId, {
        kind: 'anima-method',
        value: null,
      })
      await assert.rejects(
        fixture.service.withPreparedAnimaGenerationBatch(opened.tabId, options, consume),
        { code: 'GENERATION_SAMPLING_REQUIRED' },
      )
      await fixture.service
        .prepareNormalGenerationContext(opened.tabId, options.worker, fixture.modelService)
        .then(
          () => assert.fail('Existing public preparation must continue to refuse Anima'),
          (error: unknown) => {
            assert.equal((error as { code: string }).code, 'GENERATION_MODEL_UNSUPPORTED')
          },
        )
      assert.equal(composed, 0)
      assert.equal(consumed, 0)
      assert.deepEqual(fixture.qualificationCalls, [])
      assert.deepEqual(await readdir(fixture.scratch), [])
    })
  },
)

test(
  'Main Anima verifies complete dynamic batches and cleans both leases after a callback failure',
  composer,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const opened = await fixture.importProject()
      const packageBytes = await readFile(opened.packagePath)
      const before = await durableState(fixture)
      let composed = 0
      const options = {
        ...input(fixture),
        worker: {
          composeTarget: async (request: Parameters<typeof fixture.worker.composeTarget>[0]) => {
            composed++
            return await fixture.worker.composeTarget(request)
          },
        },
      }
      await fixture.service.updateGenerationDraft(opened.tabId, {
        kind: 'positive-prompt',
        text: '{valid|(broken:2)++}',
      })
      let consumed = false
      await assert.rejects(
        fixture.service.withPreparedAnimaGenerationBatch(opened.tabId, options, async () => {
          consumed = true
        }),
        /operator|weight|syntax|attention/i,
      )
      assert.equal(consumed, false)
      assert.equal(composed, 0)
      assert.deepEqual(fixture.qualificationCalls, [])
      assert.deepEqual(await readdir(fixture.scratch), [])
      // The selected prefix is the existing planner's scope; malformed attention in an unselected
      // later branch is not sent or compiled. Dynamic brace grammar is still checked everywhere.
      await fixture.service.updateGenerationDraft(opened.tabId, {
        kind: 'positive-prompt',
        text: '{red|blue|(broken:2)++}',
      })
      await fixture.service.withPreparedAnimaGenerationBatch(
        opened.tabId,
        options,
        async ({ preparedBatch }) => {
          assert.equal(preparedBatch.truncated, true)
          assert.deepEqual(
            preparedBatch.items.map((item) => item.prompts.positive),
            ['red', 'red', 'blue', 'blue'],
          )
        },
      )
      assert.equal(composed, 1)
      await fixture.service.updateGenerationDraft(opened.tabId, {
        kind: 'positive-prompt',
        text: '{red|blue|green}',
      })
      const beforeDocument = fixture.service.getOpenDocumentForAcceptance(opened.tabId)!.document
      let stage = ''
      await assert.rejects(
        fixture.service.withPreparedAnimaGenerationBatch(
          opened.tabId,
          input(fixture),
          async ({ preparedBatch, requests }) => {
            assert.equal(preparedBatch.truncated, true)
            assert.equal(requests.length, 4)
            stage = requests[0].job.output.stagingRoot
            await writeFile(requests[0].job.output.pngPath, await acceptedOutputPngFixture(64, 64))
            throw new Error('controlled consumer failure')
          },
        ),
        /controlled consumer failure/,
      )
      assert.equal(existsSync(stage), false)
      assert.deepEqual(await readdir(fixture.scratch), [])
      assert.deepEqual(await durableState(fixture), before)
      assert.deepEqual(await readFile(opened.packagePath), packageBytes)
      assert.deepEqual(
        fixture.service.getOpenDocumentForAcceptance(opened.tabId)!.document,
        beforeDocument,
      )
    })
  },
)

test(
  'Main Anima refuses changed managed bytes between preparation and request publication without durable or portable side effects',
  composer,
  async () => {
    await withAnimaProjectPreparationFixture(async (fixture) => {
      const opened = await fixture.importProject()
      const before = await durableState(fixture)
      const packageBytes = await readFile(opened.packagePath)
      let calls = 0
      fixture.setQualificationHook(async () => {
        if (++calls === 2) {
          await unlink(fixture.qwen.managedPath)
        }
      })
      let consumed = false
      await assert.rejects(
        fixture.service.withPreparedAnimaGenerationBatch(opened.tabId, input(fixture), async () => {
          consumed = true
        }),
        { code: 'ANIMA_DEPENDENCY_UNAVAILABLE' },
      )
      assert.equal(consumed, false)
      assert.deepEqual(await readdir(fixture.scratch), [])
      assert.deepEqual(await durableState(fixture), before)
      assert.deepEqual(await readFile(opened.packagePath), packageBytes)
      const configuration = acceptedRasterProvenanceFixture(
        opened.document,
        await acceptedOutputPngFixture(64, 64),
        opened.document.primaryBbox,
      ).generationConfiguration
      assert.equal(isRasterGenerationConfigurationV1(configuration), true)
      assert.equal(fixture.first.reference.baseModelFamily, 'anima')
      assert.equal(fixture.first.reference.kind, 'checkpoint')
      assert.equal(fixture.first.reference.predictionType, null)
      const exactAnimaCheckpoint: Omit<
        typeof configuration.model,
        'baseModelFamily' | 'kind' | 'predictionType'
      > & {
        baseModelFamily: 'anima'
        kind: 'checkpoint'
        predictionType: null
      } = {
        ...fixture.first.reference,
        baseModelFamily: 'anima',
        kind: 'checkpoint',
        predictionType: null,
      }
      // @ts-expect-error Accepted provenance remains Illustrious-only at the type boundary too.
      configuration.model = exactAnimaCheckpoint
      assert.equal(isRasterGenerationConfigurationV1(configuration), false)
    })
  },
)
