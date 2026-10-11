/** Actual Main image preparation/admission/SQLite/provenance; no native inference or Add/Save. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { installedFixture, produce } from './illustrious-image-seed-replay-test-fixtures.mjs'

const positive = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const negative = '(blurry:0.7), low quality'
const max = 4294967295

// Boundary: real IMG/OUT preparation → real batch admission → durable verified input/provenance.
// Invariant: valid MAX/0 survives every owner as uint32, without another seed choice or late edits.
// Neighbors: Fixed0/1 and FixedMAX single change the base or the overflowing iteration only.
// Mutation: remove the planner's final modulo in an isolated actual TS copy. Wrap must fail
// the semantic admission assertion; both nonoverflow neighbors must continue to pass.
for (const objective of ['epsilon', 'v_prediction'])
  for (const mode of ['img2img', 'outpaint'])
    for (const scenario of [
      { name: 'wrap MAX to zero', seed: max, seeds: [max, 0] },
      { name: 'neighbor zero to one', seed: 0, seeds: [0, 1] },
      { name: 'neighbor single MAX', seed: max, seeds: [max] },
    ])
      test(`${objective}/${mode}: actual Main ${scenario.name}`, async () => {
        let actual
        await assert.doesNotReject(async () => {
          actual = await produce(installedFixture(), objective, mode, 'fixed', scenario.seed, {
            concretePair: true,
            batch: {
              iterations: scenario.seeds.length,
              maxPrompts: 1,
              seedBehavior: 'per-prompt',
            },
          })
        }, `Actual Main must admit the valid ${scenario.name} uint32 image batch.`)
        assert.equal(actual.preparedSeed, scenario.seed)
        assert.equal(actual.picks, 0)
        assert.equal(actual.rows.length, scenario.seeds.length)
        assert.equal(actual.configs.length, scenario.seeds.length)
        assert.equal(new Set(actual.rows.map(({ id }) => id)).size, scenario.seeds.length)
        const expectedKind = `illustrious-${mode}`
        const expectedContext =
          mode === 'outpaint' ? 'normal-outpaint-preparation' : 'normal-img2img-preparation'
        const payloads = actual.rows.map(({ frozen_payload_json }) =>
          JSON.parse(frozen_payload_json),
        )
        assert.deepEqual(
          payloads.map(({ context }) => context.sampling.seed),
          scenario.seeds,
        )
        assert.deepEqual(
          payloads.map(({ workerJob }) => workerJob.sampling.seed),
          scenario.seeds,
        )
        assert.deepEqual(
          actual.configs.map(({ sampling }) => sampling.actualSeed),
          scenario.seeds,
        )
        for (const [index, payload] of payloads.entries()) {
          assert.equal(payload.kind, expectedKind)
          assert.equal(payload.context.kind, expectedContext)
          assert.deepEqual(payload.context.bbox, {
            x: mode === 'outpaint' ? 64 : 0,
            y: 0,
            width: 256,
            height: 256,
          })
          assert.deepEqual(payload.context.prompts, { positive, negative })
          assert.deepEqual(payload.workerJob.prompts, { positive, negative })
          assert.equal(payload.context.sampling.requestedSeedPolicy, 'fixed')
          assert.equal(payload.context.sampling.seedBehavior, 'per-prompt')
          assert.equal(payload.workerJob.checkpoint.predictionType, objective)
          assert.equal(
            payload.workerJob.sampling.noiseProfile.rescaleBetasZeroSnr,
            objective === 'v_prediction',
          )
          assert.equal(payload.workerJob.sampling.denoisingStrength, 0.5)
          assert.equal(payload.workerJob.loras[0].weight, -0.5)
          const config = actual.configs[index]
          assert.equal(config.positivePrompt.text, positive)
          assert.equal(config.negativePrompt.text, negative)
          assert.equal(config.sampling.requestedSeedPolicy, 'fixed')
          assert.equal(config.sampling.seedBehavior, 'per-prompt')
        }
      })
