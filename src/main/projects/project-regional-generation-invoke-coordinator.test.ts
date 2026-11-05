import assert from 'node:assert/strict'
import { access, readdir } from 'node:fs/promises'
import test from 'node:test'

import type { ProjectRegionalInvokeGenerationSubmission } from './project-regional-generation-coordinator.js'
import type { RegionalProjectFixture } from './test-fixtures/regional-project.js'

import { ProjectRegionalGenerationCoordinator } from './project-regional-generation-coordinator.js'
import {
  createRegionalProjectFixture,
  regionalProjectDeferred,
} from './test-fixtures/regional-project.js'

async function withPublic(
  use: (
    f: RegionalProjectFixture,
    coordinator: ProjectRegionalGenerationCoordinator,
  ) => Promise<void>,
) {
  const f = await createRegionalProjectFixture()
  const coordinator = new ProjectRegionalGenerationCoordinator({
    compositionProfile: 'invoke-canvas-v1',
    gate: f.gate,
    models: f.models,
    orchestrator: f.orchestrator,
    projects: f.projects,
    scratchBasePath: f.scratch,
  })
  try {
    await use(f, coordinator)
  } finally {
    await coordinator.shutdown()
    await f.close()
  }
}

function submission(f: RegionalProjectFixture): ProjectRegionalInvokeGenerationSubmission {
  return {
    ...f.owner(),
    withPreparation: async (use) => {
      const original = f.input().ready
      const ready = {
        ...original,
        capabilities: [...original.capabilities, 'illustrious-regional-invoke-v1'],
      }
      return await use({ inferenceReady: ready, targetWorker: f.compositionWorker })
    },
  }
}

async function rows(f: RegionalProjectFixture) {
  return await f.db.selectFrom('generation_queue_item').selectAll().orderBy('created_at').execute()
}

test('public submission reuses the owned gate and genuine capture without recursive admission', async () => {
  await withPublic(async (f, coordinator) => {
    const before = structuredClone(f.document())
    const run = f.gate.run.bind(f.gate)
    let gateEntries = 0
    f.gate.run = async (tabId, use) => {
      assert.equal(++gateEntries, 1, 'A recursive reservation would deadlock the public caller.')
      return await run(tabId, use)
    }
    const queued = await f.gate.run(
      f.tabId,
      async () => await coordinator.submitInvokeUnderGate(f.tabId, submission(f)),
    )
    assert.equal(gateEntries, 1)
    const saved = await f.queue.loadVerifiedRegionalInput(queued.id)
    assert.equal(saved.payload.kind, 'illustrious-regional-txt2img')
    assert.equal(saved.input.compositionProfile, 'invoke-canvas-v1')
    assert.deepEqual(saved.input.globalNegativeCoverage, { kind: 'everywhere' })
    assert.deepEqual(saved.input.globalPositiveCoverage, { kind: 'everywhere' })
    assert.equal(saved.input.negativePooledSourceId, 'current-canvas')
    assert.equal(saved.input.positivePooledSourceId, 'current-canvas')
    assert.equal(saved.input.layout, 'cfg-negative-first')
    assert.equal(saved.input.recipe.item.seed, 123)
    assert.ok(
      Buffer.from(saved.input.recipe.regions[0].coverage.alpha).equals(Buffer.from(f.alpha)),
    )
    assert.deepEqual(f.document(), before)
    assert.equal(f.calls.compose.length, 1)
    for (const composed of f.calls.compose) {
      await assert.rejects(access(composed.stagingRoot), { code: 'ENOENT' })
    }
  })
})

test('public finite-profile refusal precedes capture, runtime, target and model work', async () => {
  await withPublic(async (f, coordinator) => {
    await f.edit((document) => {
      document.generationDraft.sampling.cfgScale = 1
    })
    let captures = 0
    const capture = f.projects.withCapturedCurrentCanvasRegionalGenerationInput.bind(f.projects)
    f.projects.withCapturedCurrentCanvasRegionalGenerationInput = async (...args) => {
      captures++
      return await capture(...args)
    }
    const input = submission(f)
    input.withPreparation = async () => assert.fail('The finite profile refuses before runtime.')
    await assert.rejects(coordinator.submitInvokeUnderGate(f.tabId, input), /CFG greater than 1/)
    assert.equal(captures, 0)
    assert.equal(f.calls.checkpoint, 0)
    assert.equal(f.calls.compose.length, 0)
    assert.equal((await rows(f)).length, 0)
    await assert.rejects(f.coordinator.submitInvokeUnderGate(f.tabId, submission(f)), {
      code: 'UNSUPPORTED',
    })
  })
})

for (const change of ['edit-undo', 'close-reopen'] as const) {
  test(`Service capture precedes runtime await and preserves ${change} ABA rejection`, async () => {
    await withPublic(async (f, coordinator) => {
      const entered = regionalProjectDeferred()
      const release = regionalProjectDeferred()
      const capture = f.projects.withCapturedCurrentCanvasRegionalGenerationInput.bind(f.projects)
      let captured = false
      f.projects.withCapturedCurrentCanvasRegionalGenerationInput = async (...args) => {
        captured = true
        return await capture(...args)
      }
      const input = submission(f)
      const prepare = input.withPreparation
      input.withPreparation = async (use) => {
        assert.equal(captured, true)
        entered.resolve()
        await release.promise
        return await prepare(use)
      }
      const original = f.projects.getOpenDocumentForAcceptance(f.tabId)
      const owner = f.owner()
      const operation = coordinator.submitInvokeUnderGate(f.tabId, input)
      const rejected = assert.rejects(operation)
      try {
        await Promise.race([
          entered.promise,
          operation.then(() => assert.fail('Submission skipped the held runtime preparation.')),
        ])
        if (change === 'edit-undo') {
          await f.edit((document) => {
            document.regionalGuidance![0].name = 'Temporary ABA'
          })
          await f.projects.undo(f.tabId)
        } else {
          await f.projects.close(f.tabId)
          assert.equal((await f.projects.open(f.tabId)).kind, 'opened')
          assert.notEqual(f.projects.getOpenDocumentForAcceptance(f.tabId), original)
        }
        assert.deepEqual(f.owner(), owner, 'Revision equality alone must not admit the old owner.')
      } finally {
        release.resolve()
      }
      await rejected
      assert.equal(f.calls.compose.length, 0)
      assert.equal((await rows(f)).length, 0)
      assert.equal((await readdir(f.scratch)).length, 0)
    })
  })
}

test('null runtime preparation and missing explicit capability refuse without target work', async () => {
  await withPublic(async (f, coordinator) => {
    const unavailable = submission(f)
    unavailable.withPreparation = async () => null
    await assert.rejects(coordinator.submitInvokeUnderGate(f.tabId, unavailable), {
      code: 'INFERENCE_UNAVAILABLE',
    })
    const legacy = submission(f)
    legacy.withPreparation = async (use) =>
      await use({
        inferenceReady: f.input().ready,
        targetWorker: f.compositionWorker,
      })
    await assert.rejects(coordinator.submitInvokeUnderGate(f.tabId, legacy), {
      code: 'INFERENCE_UNAVAILABLE',
    })
    assert.equal(f.calls.compose.length, 0)
    assert.equal(f.calls.checkpoint, 0)
    assert.equal((await rows(f)).length, 0)
  })
})

test('publication callbacks receive only the real durable new row and preserve prior work', async () => {
  await withPublic(async (f, coordinator) => {
    const old = await f.coordinator.submit(f.tabId, f.input())
    const input = submission(f)
    const callbacks: string[] = []
    input.beforePublication = async () => {
      callbacks.push('before')
      assert.deepEqual(
        (await rows(f)).map((row) => row.id),
        [old.id],
      )
    }
    input.afterPublication = async (item, assertCurrent) => {
      callbacks.push('after')
      assertCurrent()
      assert.notEqual(item.id, old.id)
      const owned = await f.queue.loadVerifiedRegionalInput(item.id)
      assert.equal(owned.payload.kind, 'illustrious-regional-txt2img')
      assert.equal(owned.input.recipe.documentId, f.document().documentId)
      assert.equal((await rows(f)).find((row) => row.id === item.id)?.status, 'pending')
    }
    const queued = await coordinator.submitInvokeUnderGate(f.tabId, input)
    assert.deepEqual(callbacks, ['before', 'after'])
    assert.equal((await rows(f)).find((row) => row.id === old.id)?.status, 'pending')
    assert.equal((await rows(f)).find((row) => row.id === queued.id)?.status, 'pending')
  })
})

test('failed post-publication callback cancels only the newly durable public row', async () => {
  await withPublic(async (f, coordinator) => {
    const old = await f.coordinator.submit(f.tabId, f.input())
    const input = submission(f)
    input.afterPublication = async () => {
      throw new Error('reviewed impact changed')
    }
    await assert.rejects(
      coordinator.submitInvokeUnderGate(f.tabId, input),
      /reviewed impact changed/,
    )
    const saved = await rows(f)
    assert.equal(saved.find((row) => row.id === old.id)?.status, 'pending')
    assert.equal(saved.find((row) => row.id !== old.id)?.status, 'canceled')
  })
})

for (const failure of ['runtime-release', 'capture-release'] as const) {
  test(`late ${failure} rejection cancels the already admitted exact row`, async () => {
    await withPublic(async (f, coordinator) => {
      const input = submission(f)
      const capture = f.projects.withCapturedCurrentCanvasRegionalGenerationInput.bind(f.projects)
      const message = `explicit ${failure} failure`
      if (failure === 'runtime-release') {
        const prepare = input.withPreparation
        input.withPreparation = async (use) => {
          await prepare(use)
          throw new Error(message)
        }
      } else {
        f.projects.withCapturedCurrentCanvasRegionalGenerationInput = async (...args) => {
          await capture(...args)
          throw new Error(message)
        }
      }
      await assert.rejects(coordinator.submitInvokeUnderGate(f.tabId, input), new RegExp(message))
      assert.deepEqual(
        (await rows(f)).map((row) => row.status),
        ['canceled'],
      )
      f.projects.withCapturedCurrentCanvasRegionalGenerationInput = capture
      const next = await coordinator.submitInvokeUnderGate(f.tabId, submission(f))
      assert.equal((await rows(f)).find((row) => row.id === next.id)?.status, 'pending')
    })
  })
}

test('unconfirmed cancellation after late runtime failure retains the admission fence', async () => {
  await withPublic(async (f, coordinator) => {
    const input = submission(f)
    const prepare = input.withPreparation
    const cancel = f.queue.cancel.bind(f.queue)
    input.withPreparation = async (use) => {
      await prepare(use)
      f.queue.cancel = async () => {
        throw new Error('explicit cancellation uncertainty')
      }
      throw new Error('late runtime release')
    }
    try {
      await assert.rejects(coordinator.submitInvokeUnderGate(f.tabId, input), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      const composed = f.calls.compose.length
      await assert.rejects(coordinator.submitInvokeUnderGate(f.tabId, submission(f)), {
        code: 'PROJECT_GENERATION_CLOSING',
      })
      assert.equal(f.calls.compose.length, composed)
      assert.deepEqual(
        (await rows(f)).map((row) => row.status),
        ['pending'],
      )
    } finally {
      f.queue.cancel = cancel
      for (const row of await rows(f)) {
        await cancel(row.id)
      }
    }
  })
})

/**
 * Current InvokeAI a61ac4fb keeps the authored scheduler on the denoise graph while adding regions.
 * Studio derives the frozen initialization identity from that owned capture, never a caller field.
 */
test('public Euler a derives the exact initialization from capture and ignores a caller substitution', async () => {
  await withPublic(async (f, coordinator) => {
    await f.edit((document) => {
      document.generationDraft.sampling.sampler = 'Euler a'
    })
    const authored = structuredClone(f.document())
    const input = Object.assign(submission(f), {
      initializationProfile: 'caller-selected initialization is not authority',
    })
    input.withPreparation = async (use) => {
      const original = f.input().ready
      return await use({
        inferenceReady: {
          ...original,
          capabilities: [
            ...original.capabilities,
            'illustrious-regional-invoke-v1',
            'illustrious-regional-invoke-init-v1',
          ],
        },
        targetWorker: f.compositionWorker,
      })
    }
    const queued = await coordinator.submitInvokeUnderGate(f.tabId, input)
    const frozen = await f.queue.loadVerifiedRegionalInput(queued.id)
    assert.equal(frozen.payload.kind, 'illustrious-regional-txt2img')
    assert.equal(frozen.payload.initializationProfile, 'invoke-cpu-f32-add-noise-v1')
    assert.equal(frozen.input.initializationProfile, 'invoke-cpu-f32-add-noise-v1')
    assert.equal(frozen.input.compositionProfile, 'invoke-canvas-v1')
    assert.equal(frozen.input.request.job.sampling.scheduler, 'euler_a')
    assert.equal(frozen.input.request.job.sampling.seed, 123)
    assert.equal(frozen.payload.context.sampling.sampler, 'Euler a')
    assert.equal(f.calls.compose.length, 1)
    assert.deepEqual(f.document(), authored)
  })
})

test('public Euler a capability gate precedes target checkpoint and publication while legacy Euler remains available', async () => {
  await withPublic(async (f, coordinator) => {
    await f.edit((document) => {
      document.generationDraft.sampling.sampler = 'Euler a'
    })
    const authored = structuredClone(f.document())
    const input = submission(f)
    let beforePublication = 0
    let afterPublication = 0
    input.beforePublication = async () => {
      beforePublication++
    }
    input.afterPublication = async () => {
      afterPublication++
    }
    await assert.rejects(coordinator.submitInvokeUnderGate(f.tabId, input), {
      code: 'INFERENCE_UNAVAILABLE',
    })
    assert.equal(f.calls.compose.length, 0)
    assert.equal(f.calls.checkpoint, 0)
    assert.deepEqual(await rows(f), [])
    assert.equal(beforePublication, 0)
    assert.equal(afterPublication, 0)
    assert.deepEqual(f.document(), authored)
    await f.edit((document) => {
      document.generationDraft.sampling.sampler = 'Euler'
    })
    const legacy = await coordinator.submitInvokeUnderGate(f.tabId, submission(f))
    const saved = await f.queue.loadVerifiedRegionalInput(legacy.id)
    assert.equal(saved.input.request.job.sampling.scheduler, 'euler')
    assert.equal(Object.hasOwn(saved.input, 'initializationProfile'), false)
    assert.equal(Object.hasOwn(saved.payload, 'initializationProfile'), false)
    assert.equal(f.calls.compose.length, 1)
  })
})

test('public legacy Euler capture cannot acquire initialization from an extra caller field', async () => {
  await withPublic(async (f, coordinator) => {
    const input = Object.assign(submission(f), {
      initializationProfile: 'invoke-cpu-f32-add-noise-v1',
    })
    const queued = await coordinator.submitInvokeUnderGate(f.tabId, input)
    const frozen = await f.queue.loadVerifiedRegionalInput(queued.id)
    assert.equal(frozen.input.request.job.sampling.scheduler, 'euler')
    assert.equal(Object.hasOwn(frozen.input, 'initializationProfile'), false)
    assert.equal(Object.hasOwn(frozen.payload, 'initializationProfile'), false)
    assert.equal(frozen.input.compositionProfile, 'invoke-canvas-v1')
  })
})
