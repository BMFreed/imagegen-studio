import { ANIMA_SAMPLING_METHOD_KEYS } from '../../shared/projects/anima-sampling-method.js'

import assert from 'node:assert/strict'
import test from 'node:test'

import { AnimaGenerationBatchError, prepareAnimaGenerationBatch } from './anima-generation-batch.js'
import { withAnimaBatchFixture } from './test-fixtures/anima-batch.js'

// Boundary: real cap32 planner, both prompt compilers and complete six-method sampling plans.
// Invariant: authored pair-prefix policy and concrete seeds survive with no hidden job truncation.
// Neighbors alter seed policy, one method/mode, prefix, malformed prompt or admission count.
// Semantic mutations: use per-prompt unconditionally, drop negative weighting or replace native
// method with Euler. These tests do not qualify GPU throughput or persistent queue admission.

test('Anima batch expands both signs in stable pair order and preserves per-iteration seed zero', async () => {
  await withAnimaBatchFixture(async ({ prepared }) => {
    const original = structuredClone(prepared.context)
    const batch = prepareAnimaGenerationBatch({ iterations: 2, prepared })
    assert.equal(batch.truncated, false)
    assert.deepEqual(
      batch.items.map((item) => [item.promptPairIndex, item.iteration, item.seed]),
      [
        [0, 0, 0],
        [0, 1, 1],
        [1, 0, 0],
        [1, 1, 1],
        [2, 0, 0],
        [2, 1, 1],
        [3, 0, 0],
        [3, 1, 1],
      ],
    )
    assert.deepEqual(
      batch.items.filter((item) => item.iteration === 0).map((item) => item.prompts),
      [
        { negative: '(bad:0.5)', positive: '(cat:2)' },
        { negative: 'worse--', positive: '(cat:2)' },
        { negative: '(bad:0.5)', positive: 'dog++' },
        { negative: 'worse--', positive: 'dog++' },
      ],
    )
    assert.deepEqual(batch.items[0].compiledPrompts.positive, {
      cleanedText: 'cat',
      spans: [{ end: 3, start: 0, weight: 2 }],
      version: 'anima-prompt-weighting-v1',
    })
    assert.deepEqual(batch.items[0].compiledPrompts.negative, {
      cleanedText: 'bad',
      spans: [{ end: 3, start: 0, weight: 0.5 }],
      version: 'anima-prompt-weighting-v1',
    })
    assert.equal(batch.items[0].samplingPlan.seed, 0)
    assert.equal(batch.items[0].samplingPlan.stepSeed, 0)
    assert.deepEqual(prepared.context, original)
    assert.notEqual(batch.targetPngBytes, prepared.targetPngBytes)
    prepared.targetPngBytes.fill(0)
    prepared.context.prompts.positive = 'changed'
    assert.equal(batch.context.prompts.positive, '{(cat:2)|dog++}')
    assert.ok(batch.targetPngBytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    assert.ok(Object.isFrozen(batch.context.generationDraft.sampling))
    assert.ok(Object.isFrozen(batch.items[0].samplingPlan.sigmas))
  })
})

test('Anima per-prompt seed schedule wraps uint32 and prefix truncation stays explicit', async () => {
  await withAnimaBatchFixture(async ({ prepared }) => {
    prepared.context.dynamic = { maxPrompts: 3, seedBehavior: 'per-prompt' }
    prepared.context.generationDraft.dynamicPrompt = { ...prepared.context.dynamic }
    prepared.context.sampling.seed = 0xff_ff_ff_ff
    prepared.context.generationDraft.seed = { policy: 'fixed', value: 0xff_ff_ff_ff }
    const batch = prepareAnimaGenerationBatch({ iterations: 2, prepared })
    assert.equal(batch.truncated, true)
    assert.equal(batch.items.length, 6)
    assert.deepEqual(
      batch.items.map((item) => item.seed),
      [0xff_ff_ff_ff, 0, 1, 2, 3, 4],
    )
    assert.deepEqual(
      batch.items.map((item) => item.samplingPlan.stepSeed),
      [0xff_ff_ff_ff, 0, 1, 2, 3, 4],
    )
    assert.equal(batch.context.dynamic.seedBehavior, 'per-prompt')
    assert.equal(batch.items.at(-1)!.prompts.positive, 'dog++')
    assert.equal(batch.items.at(-1)!.prompts.negative, '(bad:0.5)')
  })
})

test('Anima batch compiles all six native methods and exact clipping in both modes', async () => {
  for (const opaque of [false, true]) {
    await withAnimaBatchFixture(
      async ({ prepared }) => {
        for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
          prepared.context.sampling.animaMethod = method
          prepared.context.generationDraft.sampling.animaMethod = method
          const batch = prepareAnimaGenerationBatch({ iterations: 2, prepared })
          for (const item of batch.items) {
            assert.equal(item.samplingPlan.scheduler, method)
            assert.equal(item.samplingPlan.mode, opaque ? 'img2img' : 'txt2img')
            assert.equal(item.samplingPlan.strength, opaque ? 0.5 : null)
            assert.equal(item.samplingPlan.stepSeed, item.seed)
            assert.equal(
              item.samplingPlan.posteriorSeed,
              opaque ? (item.seed ^ 0x9e_37_79_b9) >>> 0 : null,
            )
            assert.equal(
              item.samplingPlan.totalSteps,
              method === 'heun' ? (opaque ? 3 : 7) : opaque ? 2 : 4,
            )
            assert.equal(item.samplingPlan.sigmas.at(-1), 0)
          }
        }
      },
      { opaque },
    )
  }
})

test('Anima rejects cap32 overflow, invalid iterations and bad selected concrete prompts atomically', async () => {
  await withAnimaBatchFixture(async ({ prepared }) => {
    assert.equal(prepareAnimaGenerationBatch({ iterations: 8, prepared }).items.length, 32)
    assert.throws(() => prepareAnimaGenerationBatch({ iterations: 9, prepared }), {
      code: 'BATCH_TOO_LARGE',
    })
    for (const iterations of [0, -1, 1.5, NaN, 101, Number.MAX_SAFE_INTEGER]) {
      assert.throws(
        () => prepareAnimaGenerationBatch({ iterations, prepared }),
        AnimaGenerationBatchError,
      )
    }
    prepared.context.prompts.positive = '{valid|broken:0.5)}'
    prepared.context.generationDraft.positivePrompt.text = prepared.context.prompts.positive
    assert.throws(() => prepareAnimaGenerationBatch({ iterations: 1, prepared }))
    prepared.context.prompts.positive = '{valid|other}'
    prepared.context.generationDraft.positivePrompt.text = prepared.context.prompts.positive
    prepared.context.prompts.negative = '{valid|(bad:no)}'
    prepared.context.generationDraft.negativePrompt.text = prepared.context.prompts.negative
    assert.throws(() => prepareAnimaGenerationBatch({ iterations: 1, prepared }))
  })
})
