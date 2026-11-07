import {
  ANIMA_PROMPT_INTERPRETATION,
  compileAnimaPromptWeighting,
} from '../../shared/projects/anima-prompt-weighting.js'
import type { AnimaWorkerRequest } from '../../shared/projects/anima-worker-request.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  FrozenQueuedAnimaGenerationV1,
  FrozenQueuedAnimaOutpaintV1,
} from './anima-queued-generation.js'
import type { AnimaBatchFixture } from './test-fixtures/anima-batch.js'

import { prepareAnimaGenerationBatch } from './anima-generation-batch.js'
import { withAnimaGenerationBatchRequests } from './anima-generation-request.js'
import {
  buildFrozenQueuedAnimaGenerationV1,
  buildFrozenQueuedAnimaOutpaintV1,
  parseFrozenQueuedAnimaGenerationV1,
  parseFrozenQueuedAnimaOutpaintV1,
  reverifyFrozenQueuedAnimaGeneration,
} from './anima-queued-generation.js'
import { freezeAlphaOutpaintConditioning } from './outpaint-conditioning.js'
import { ANIMA_BATCH_READY, withAnimaBatchFixture } from './test-fixtures/anima-batch.js'

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> }

// Retained pre-fragment-joining bytes, authored independently from either compiler mode.
const legacyFragmentPrompt = {
  cleanedText: 'a,b',
  spans: [{ end: 3, start: 0, weight: 2 }],
  version: 'anima-prompt-weighting-v1' as const,
}
const currentFragmentPrompt = {
  cleanedText: 'a , b',
  spans: [
    { end: 1, start: 0, weight: 2 },
    { end: 2, start: 1, weight: 1 },
    { end: 3, start: 2, weight: 2 },
    { end: 4, start: 3, weight: 1 },
    { end: 5, start: 4, weight: 2 },
  ],
  version: 'anima-prompt-weighting-v1' as const,
}

function assertFragmentInterpretations(
  payload: FrozenQueuedAnimaGenerationV1 | FrozenQueuedAnimaOutpaintV1,
  parse: (json: string) => FrozenQueuedAnimaGenerationV1 | FrozenQueuedAnimaOutpaintV1,
): void {
  assert.equal(payload.context.animaPromptInterpretation, ANIMA_PROMPT_INTERPRETATION)
  assert.deepEqual(parse(JSON.stringify(payload)), payload)
  for (const polarity of ['positive', 'negative'] as const) {
    assert.equal(payload.context.prompts[polarity], '(a,b)2')
    assert.deepEqual(payload.workerJob.prompts[polarity], currentFragmentPrompt)
  }
  const legacy = structuredClone(payload) as Mutable<typeof payload>
  delete legacy.context.animaPromptInterpretation
  legacy.workerJob.prompts = {
    negative: structuredClone(legacyFragmentPrompt),
    positive: structuredClone(legacyFragmentPrompt),
  }
  const reopenedLegacy = parse(JSON.stringify(legacy))
  assert.deepEqual(reopenedLegacy, legacy)
  assert.equal('animaPromptInterpretation' in reopenedLegacy.context, false)

  const refused = (source: typeof payload, change: (changed: Mutable<typeof payload>) => void) => {
    const changed = structuredClone(source) as Mutable<typeof payload>
    change(changed)
    assert.throws(() => parse(JSON.stringify(changed)), { code: 'QUEUE_INPUT_INVALID' })
  }
  refused(payload, (changed) => {
    delete changed.context.animaPromptInterpretation
  })
  refused(legacy, (changed) => {
    changed.context.animaPromptInterpretation = ANIMA_PROMPT_INTERPRETATION
  })
  refused(payload, (changed) => {
    Object.assign(changed.context, { animaPromptInterpretation: 'unknown-fragments-v2' })
  })
  refused(legacy, (changed) => {
    Object.assign(changed.context, { animaPromptInterpretation: 'legacy' })
  })
  for (const polarity of ['positive', 'negative'] as const) {
    refused(legacy, (changed) => {
      changed.workerJob.prompts[polarity] = structuredClone(currentFragmentPrompt)
    })
    refused(payload, (changed) => {
      changed.workerJob.prompts[polarity] = structuredClone(legacyFragmentPrompt)
    })
    refused(legacy, (changed) => {
      changed.workerJob.prompts[polarity].spans[0].weight = 3
    })
    refused(payload, (changed) => {
      changed.workerJob.prompts[polarity].spans[1].weight = 2
    })
  }
}

for (const mode of ['txt2img', 'img2img', 'outpaint'] as const) {
  test(`durable Anima ${mode} declares new fragment joining and reloads undeclared legacy signs without reinterpretation`, async () => {
    await withAnimaBatchFixture(
      async (fixture) => {
        const { context } = fixture.prepared
        context.prompts = { negative: '(a,b)2', positive: '(a,b)2' }
        context.generationDraft.positivePrompt.text = '(a,b)2'
        context.generationDraft.negativePrompt.text = '(a,b)2'
        if (mode === 'outpaint') {
          const conditioning = freezeAlphaOutpaintConditioning({
            bbox: context.bbox,
            sourceTargetSha256: context.target.sha256,
            targetPngBytes: fixture.prepared.targetPngBytes,
          })
          const payload = buildFrozenQueuedAnimaOutpaintV1(
            {
              ...context,
              conditioning: conditioning.context,
              kind: 'anima-outpaint-preparation',
              mode: 'outpaint',
              sampling: { ...context.sampling, denoisingStrength: 0.5 },
            },
            '00000000-0000-4000-8000-000000000000',
          )
          context.prompts = { negative: 'later negative', positive: 'later positive' }
          context.generationDraft.positivePrompt.text = 'later authoring'
          assertFragmentInterpretations(payload, parseFrozenQueuedAnimaOutpaintV1)
          assert.deepEqual(payload.context.conditioning, conditioning.context)
          return
        }
        await withPayload(fixture, async (payload) => {
          context.prompts = { negative: 'later negative', positive: 'later positive' }
          context.generationDraft.positivePrompt.text = 'later authoring'
          assertFragmentInterpretations(payload, parseFrozenQueuedAnimaGenerationV1)
          await reverifyFrozenQueuedAnimaGeneration(payload, fixture.modelService)
        })
      },
      { opaque: mode !== 'txt2img', ...(mode === 'outpaint' ? { alpha: 128 } : {}) },
    )
  })
}

async function withPayload(
  fixture: AnimaBatchFixture,
  use: (payload: FrozenQueuedAnimaGenerationV1, request: AnimaWorkerRequest) => Promise<void>,
) {
  const batch = prepareAnimaGenerationBatch({ iterations: 1, prepared: fixture.prepared })
  await withAnimaGenerationBatchRequests({
    modelService: fixture.modelService,
    prepared: batch,
    ready: ANIMA_BATCH_READY,
    scratchBasePath: fixture.scratch,
    use: async (requests) =>
      await use(
        buildFrozenQueuedAnimaGenerationV1({
          context: batch.context,
          item: batch.items[0],
          request: requests[0],
        }),
        requests[0],
      ),
  })
}

for (const opaque of [false, true]) {
  for (const method of ['euler', 'heun', 'dpmpp_2m', 'dpmpp_2m_sde', 'er_sde', 'lcm'] as const) {
    test(`durable Anima ${opaque ? 'img2img' : 'txt2img'} ${method} freezes concrete signs, full native grid and exact resource stack`, async () => {
      await withAnimaBatchFixture(
        async (fixture) => {
          const { context } = fixture.prepared
          context.sampling.animaMethod = method
          context.generationDraft.sampling.animaMethod = method
          context.generationDraft.cfgRescale = 0
          context.generationDraft.vaePrecision = 'Auto'
          context.generationDraft.loras.splice(1, 0, {
            enabled: false,
            resource: {
              ...context.loras[0].reference,
              baseModelFamily: 'illustrious',
              localModelId: 'unavailable-disabled',
              localVersionId: 'unavailable-disabled-version',
              predictionType: 'epsilon',
            },
            weight: -9,
          })
          await withPayload(fixture, async (payload, request) => {
            const restored = parseFrozenQueuedAnimaGenerationV1(JSON.stringify(payload))
            assert.deepEqual(restored, payload)
            assert.equal(payload.kind, opaque ? 'anima-img2img' : 'anima-txt2img')
            assert.deepEqual(payload.context.prompts, {
              negative: '(bad:0.5)',
              positive: '(cat:2)',
            })
            assert.equal(payload.context.sampling.seed, 0)
            assert.equal(payload.context.sampling.requestedSeedPolicy, 'fixed')
            assert.equal(payload.context.sampling.seedBehavior, 'per-iteration')
            assert.equal(payload.context.cfgRescale, 0)
            assert.equal(payload.context.vaePrecision, 'Auto')
            assert.deepEqual(payload.context.loraStack, context.generationDraft.loras)
            assert.deepEqual(payload.context.loras, context.loras)
            assert.deepEqual(payload.context.model, context.model)
            assert.deepEqual(payload.workerJob.prompts, request.job.prompts)
            assert.deepEqual(payload.workerJob.sampling, request.job.sampling)
            assert.equal('generationDraft' in payload.context, false)
            assert.equal('dynamic' in payload.context, false)
            assert.equal('output' in payload.workerJob, false)
            assert.equal('path' in payload.workerJob.target, false)
            assert.equal('sampler' in payload.context.sampling, false)
            assert.equal('scheduler' in payload.context.sampling, false)
            await reverifyFrozenQueuedAnimaGeneration(payload, fixture.modelService)
          })
        },
        { opaque },
      )
    })
  }
}

test('durable Anima parser refuses interpretation, plan, family, target, configured-stack and exact bundle disagreement', async () => {
  await withAnimaBatchFixture(
    async (fixture) =>
      await withPayload(fixture, async (payload) => {
        const mutate = (change: (value: Mutable<typeof payload>) => void) => {
          const changed = structuredClone(payload) as Mutable<typeof payload>
          change(changed)
          assert.throws(() => parseFrozenQueuedAnimaGenerationV1(JSON.stringify(changed)), {
            code: 'QUEUE_INPUT_INVALID',
          })
        }
        mutate((value) => {
          value.workerJob.prompts.positive.cleanedText = 'substitution'
        })
        mutate((value) => {
          value.workerJob.prompts.negative.spans = []
        })
        mutate((value) => {
          value.workerJob.prompts.positive.spans[0].weight += 1
        })
        mutate((value) => {
          value.workerJob.sampling.sigmas[1] += 0.01
        })
        mutate((value) => {
          value.workerJob.sampling.timesteps[0] += 1
        })
        mutate((value) => {
          value.workerJob.sampling.stepSeed += 1
        })
        mutate((value) => {
          value.context.sampling.seed = 12
        })
        mutate((value) => {
          value.context.sampling.animaMethod = 'lcm'
        })
        mutate((value) => {
          value.workerJob.model.vae.sha256 = 'a'.repeat(64)
        })
        mutate((value) => {
          value.workerJob.model.qwen3Encoder.path = value.workerJob.model.vae.path
        })
        mutate((value) => {
          value.workerJob.target.byteSize += 1
        })
        mutate((value) => {
          value.context.bbox.x += 8
        })
        mutate((value) => {
          value.context.loraStack[0].enabled = false
        })
        mutate((value) => {
          value.context.loraStack.at(-1)!.enabled = false
        })
        mutate((value) => {
          value.context.loraStack.reverse()
        })
        mutate((value) => {
          value.workerJob.loras.reverse()
        })
        mutate((value) => {
          value.context.model.checkpoint.reference.baseModelFamily = 'illustrious'
        })
        mutate((value) => {
          value.context.model.checkpoint.reference.predictionType = 'epsilon'
        })
        mutate((value) => {
          Object.assign(value.context, {
            generationDraft: fixture.prepared.context.generationDraft,
          })
        })
        mutate((value) => {
          Object.assign(value.workerJob, {
            output: { pngPath: '/old/result.png', stagingRoot: '/old' },
          })
        })
        mutate((value) => {
          Object.assign(value, { kind: 'anima-img2img' })
        })
        mutate((value) => {
          Object.assign(value.context.sampling, { seedBehavior: 'unsupported' })
        })
        for (const json of [
          '{',
          'null',
          JSON.stringify({ ...payload, schemaVersion: 2 }),
          ' '.repeat(131_073),
        ]) {
          assert.throws(() => parseFrozenQueuedAnimaGenerationV1(json), {
            code: 'QUEUE_INPUT_INVALID',
          })
        }
      }),
  )
})

test('durable Anima preserves maxstep escaped and Unicode concrete prompts within payload ceiling without copying raw draft', async () => {
  for (const prompt of ['\\'.repeat(16_384), '😀'.repeat(4096), '"'.repeat(10_240)]) {
    await withAnimaBatchFixture(async (fixture) => {
      const { context } = fixture.prepared
      context.prompts = { negative: prompt, positive: prompt }
      context.generationDraft.positivePrompt.text = prompt
      context.generationDraft.negativePrompt.text = prompt
      context.sampling.animaMethod = 'heun'
      context.generationDraft.sampling.animaMethod = 'heun'
      context.sampling.steps = 200
      context.generationDraft.sampling.steps = 200
      await withPayload(fixture, async (payload, request) => {
        assert.ok(Buffer.byteLength(`${JSON.stringify(request)}\n`) <= 65_536)
        assert.ok(Buffer.byteLength(JSON.stringify(payload)) <= 131_072)
        assert.deepEqual(payload.context.prompts, { negative: prompt, positive: prompt })
        assert.deepEqual(parseFrozenQueuedAnimaGenerationV1(JSON.stringify(payload)), payload)
        assert.ok(
          Buffer.byteLength(JSON.stringify({ ...payload, context })) > 131_072 ||
            prompt.startsWith('😀'),
        )
      })
    })
  }
})

test('durable Anima rejects oversized configured disabled history and malformed source command before publication', async () => {
  await withAnimaBatchFixture(async (fixture) => {
    const batch = prepareAnimaGenerationBatch({ iterations: 1, prepared: fixture.prepared })
    await withAnimaGenerationBatchRequests({
      modelService: fixture.modelService,
      prepared: batch,
      ready: ANIMA_BATCH_READY,
      scratchBasePath: fixture.scratch,
      use: async (requests) => {
        const request = structuredClone(requests[0])
        Object.assign(request.job, { arbitraryOption: true })
        assert.throws(
          () =>
            buildFrozenQueuedAnimaGenerationV1({
              context: batch.context,
              item: batch.items[0],
              request,
            }),
          { code: 'QUEUE_INPUT_INVALID' },
        )
        const context = structuredClone(batch.context)
        context.generationDraft.loras.push(
          ...Array.from({ length: 1000 }, (_, index) => ({
            enabled: false,
            resource: { ...context.loras[0].reference, localModelId: `disabled-${index}` },
            weight: 0,
          })),
        )
        assert.throws(
          () =>
            buildFrozenQueuedAnimaGenerationV1({
              context,
              item: batch.items[0],
              request: requests[0],
            }),
          { code: 'QUEUE_INPUT_INVALID' },
        )
      },
    })
  })
})

test('durable Anima requalification compares all pinned companions and copies mutable caller before await', async () => {
  await withAnimaBatchFixture(
    async (fixture) =>
      await withPayload(fixture, async (payload) => {
        for (const part of ['checkpoint', 'qwen3Encoder', 'vae'] as const) {
          await assert.rejects(
            reverifyFrozenQueuedAnimaGeneration(payload, {
              ...fixture.modelService,
              resolveVerifiedGenerationAnimaBundleForPlan: async (ref) => {
                const bundle =
                  await fixture.modelService.resolveVerifiedGenerationAnimaBundleForPlan(ref)
                bundle[part].byteSize += 1
                return bundle
              },
            }),
            { code: 'QUEUE_INPUT_INVALID' },
          )
        }
        let entered!: () => void, release!: () => void
        const barrier = new Promise<void>((resolve) => {
          entered = resolve
        })
        const waiting = new Promise<void>((resolve) => {
          release = resolve
        })
        const verifying = reverifyFrozenQueuedAnimaGeneration(payload, {
          ...fixture.modelService,
          resolveVerifiedGenerationAnimaBundleForPlan: async (ref) => {
            entered()
            await waiting
            return await fixture.modelService.resolveVerifiedGenerationAnimaBundleForPlan(ref)
          },
        })
        await barrier
        payload.context.model.qwen3Encoder.byteSize += 1
        payload.context.loras.reverse()
        release()
        await assert.doesNotReject(verifying)
      }),
  )
})

test('durable Anima admission refuses a valid compiled command above64KiB even when its compact payload fits128KiB', async () => {
  await withAnimaBatchFixture(async (fixture) => {
    const batch = prepareAnimaGenerationBatch({ iterations: 1, prepared: fixture.prepared })
    await withAnimaGenerationBatchRequests({
      modelService: fixture.modelService,
      prepared: batch,
      ready: ANIMA_BATCH_READY,
      scratchBasePath: fixture.scratch,
      use: async (requests) => {
        const raw = '(a:2)b'.repeat(600)
        const context = structuredClone(batch.context)
        context.prompts = { negative: raw, positive: raw }
        context.generationDraft.positivePrompt.text = raw
        context.generationDraft.negativePrompt.text = raw
        const item = {
          ...batch.items[0],
          compiledPrompts: {
            negative: compileAnimaPromptWeighting(raw),
            positive: compileAnimaPromptWeighting(raw),
          },
          prompts: { negative: raw, positive: raw },
        }
        const request = {
          ...requests[0],
          job: { ...requests[0].job, prompts: item.compiledPrompts },
        } as AnimaWorkerRequest
        assert.ok(Buffer.byteLength(`${JSON.stringify(request)}\n`) > 64 * 1024)
        assert.ok(Buffer.byteLength(JSON.stringify(request)) + raw.length * 2 + 6000 < 128 * 1024)
        assert.throws(() => buildFrozenQueuedAnimaGenerationV1({ context, item, request }), {
          code: 'QUEUE_INPUT_INVALID',
        })
      },
    })
  })
})
