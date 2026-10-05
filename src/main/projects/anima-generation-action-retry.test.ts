import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'

import type { AnimaGenerationModelResolver } from './anima-generation-preparation.js'
import type { AnimaStagingFixture } from './test-fixtures/anima-staging.js'

import {
  ProjectGenerationActionController,
  toProjectGenerationActionApiError,
} from './generation-action-controller.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { ANIMA_BATCH_READY } from './test-fixtures/anima-batch.js'
import { enqueueAnimaStagingBatch, withAnimaStagingFixture } from './test-fixtures/anima-staging.js'

/** Actual action/queue/staging/fs ownership; worker admission and open-tab identity are controlled. */
function actionOwner(
  fixture: AnimaStagingFixture,
  options: { models?: Partial<AnimaGenerationModelResolver>; ready?: unknown } = {},
) {
  const documentId = fixture.prepared.context.documentId
  const identity = { documentId }
  const counters = { admitted: 0, canceled: 0, dispatched: 0, drafts: 0 }
  const legacyRefusal = async (): Promise<never> => {
    assert.fail('Anima Retry must not invoke the Illustrious resolver.')
  }
  const controller = new ProjectGenerationActionController({
    dispatch: {
      runNext: async () => {
        counters.dispatched++
        return { kind: 'idle' }
      },
      shutdown: async () => {},
    },
    gate: new ProjectGenerationOperationGate(),
    models: {
      assertNoUnboundGenerationEmbeddings: legacyRefusal,
      resolveVerifiedGenerationCheckpointForPlan: legacyRefusal,
      resolveVerifiedGenerationEmbeddingForPlan: legacyRefusal,
      resolveVerifiedGenerationLoraForPlan: legacyRefusal,
      resolveVerifiedGenerationVaeForPlan: legacyRefusal,
      ...(options.models ?? fixture.modelService),
    },
    orchestrator: { enqueuePreparedBatch: legacyRefusal },
    processor: {
      cancelAndWait: async (id) => {
        counters.canceled++
        return await fixture.queue.cancel(id)
      },
      onChanged: () => () => {},
    },
    projects: {
      getOpenDocumentId: () => identity.documentId,
      withCapturedNormalGenerationInput: async () => {
        counters.drafts++
        assert.fail('Retry must not compose or read the current Project draft.')
      },
    },
    queue: fixture.queue,
    runtime: {
      getStatus: async () => ({}),
      readQualifiedInferenceReady: async () => ANIMA_BATCH_READY,
      withGenerationAdmission: async (_scratch, use) => {
        counters.admitted++
        // Controlled advertisement at the admission boundary, independently parsed by Retry.
        return await use((options.ready ?? ANIMA_BATCH_READY) as typeof ANIMA_BATCH_READY)
      },
      withGenerationPreparation: legacyRefusal,
    },
    scratchBasePath: fixture.scratch,
    staging: fixture.staging,
  })
  return { controller, counters, identity }
}

for (const opaque of [false, true]) {
  test(`actual action Retry publishes frozen Anima ${opaque ? 'img2img' : 'txt2img'} without Project preparation or worker inference`, async () => {
    await withAnimaStagingFixture(
      async (fixture) => {
        const { items } = await enqueueAnimaStagingBatch(fixture)
        const canceled = await fixture.queue.cancel(items[0].id, items[0].statusSequence)
        const source = await fixture.queue.loadVerifiedRetryInput(canceled.id)
        const beforeFiles = await readdir(fixture.scratch)
        const owner = actionOwner(fixture)
        try {
          fixture.prepared.context.prompts.positive = 'today unrelated draft'
          fixture.prepared.context.sampling.seed = 57
          await owner.controller.retryJob({
            id: canceled.id,
            statusSequence: canceled.statusSequence,
          })
          const page = await fixture.queue.listManagerPage()
          const copy = page.items.find((entry) => entry.id !== canceled.id)!
          assert.ok(copy)
          assert.equal(copy.status, 'pending')
          assert.notEqual(copy.stagingSessionId, canceled.stagingSessionId)
          const restored = await fixture.queue.loadVerifiedRetryInput(copy.id)
          assert.deepEqual(restored.payload, source.payload)
          assert.deepEqual(restored.targetPngBytes, source.targetPngBytes)
          assert.equal(restored.payload.context.sampling.seed, 0)
          assert.equal((await fixture.queue.getManagerEntry(canceled.id)).status, 'canceled')
          assert.equal(owner.counters.drafts, 0)
          assert.equal(owner.counters.canceled, 0)
          assert.equal(owner.counters.admitted, 1)
          assert.deepEqual(await readdir(fixture.scratch), beforeFiles)
          assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
        } finally {
          await owner.controller.shutdown()
        }
      },
      { opaque },
    )
  })
}

test('actual action Retry keeps original Anima rows and files for missing methods, incomplete runtime, changed companion and changed document', async (t) => {
  for (const failure of ['resolver', 'runtime', 'bundle', 'document'] as const) {
    await t.test(failure, async () => {
      await withAnimaStagingFixture(async (fixture) => {
        const { items } = await enqueueAnimaStagingBatch(fixture)
        const canceled = await fixture.queue.cancel(items[0].id, items[0].statusSequence)
        const before = await fixture.queue.listManagerPage()
        const files = await readdir(fixture.scratch)
        let owner: ReturnType<typeof actionOwner>
        let calls = 0
        const models: AnimaGenerationModelResolver = {
          ...fixture.modelService,
          resolveVerifiedGenerationAnimaBundleForPlan: async (reference) => {
            const bundle =
              await fixture.modelService.resolveVerifiedGenerationAnimaBundleForPlan(reference)
            calls++
            if (failure === 'bundle') {
              return { ...bundle, vae: { ...bundle.vae, byteSize: bundle.vae.byteSize + 1 } }
            }
            if (failure === 'document' && calls === 2) {
              owner.identity.documentId = 'changed'
            }
            return bundle
          },
        }
        owner = actionOwner(fixture, {
          models: failure === 'resolver' ? {} : models,
          ready: failure === 'runtime' ? { ...ANIMA_BATCH_READY, capabilities: [] } : undefined,
        })
        const code = {
          bundle: 'QUEUE_INPUT_INVALID',
          document: 'GENERATION_DOCUMENT_CHANGED',
          resolver: 'GENERATION_MODEL_UNAVAILABLE',
          runtime: 'INFERENCE_UNAVAILABLE',
        }[failure]
        try {
          await assert.rejects(
            owner.controller.retryJob({ id: canceled.id, statusSequence: canceled.statusSequence }),
            (error: unknown) => {
              assert.equal(toProjectGenerationActionApiError(error).code, code)
              return true
            },
          )
          assert.deepEqual(await fixture.queue.listManagerPage(), before)
          assert.deepEqual(await readdir(fixture.scratch), files)
          assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
          assert.equal(owner.counters.canceled, 0)
          assert.equal(owner.counters.dispatched, 0)
          assert.equal(owner.counters.drafts, 0)
        } finally {
          await owner.controller.shutdown()
        }
      })
    })
  }
})
