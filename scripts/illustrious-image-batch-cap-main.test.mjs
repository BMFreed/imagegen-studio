/**
 * Real Main IMG/OUT preparation → orchestrator → SQLite/input verification/provenance.
 * Exact-resource resolution, staging capacity and verified candidate pixels are test preconditions.
 * No native inference, real temporary-result preservation, ProjectService/Undo or Add/Save claim.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { installedFixture, produce } from './illustrious-image-seed-replay-test-fixtures.mjs'

const red = 'a (red:1.3) ceramic cup on a wooden table, studio photograph'
const blue = 'a (blue:1.3) ceramic cup on a wooden table, studio photograph'
const blurry = '(blurry:0.7), low quality'
const noisy = '(noisy:0.7), low quality'

// Handwritten [positive, negative, seed, iteration, pair] expectations. No planner oracle.
const boundary32 = [
  [red, blurry, 0, 0, 0],
  [red, blurry, 1, 1, 0],
  [red, blurry, 2, 2, 0],
  [red, blurry, 3, 3, 0],
  [red, blurry, 4, 4, 0],
  [red, blurry, 5, 5, 0],
  [red, blurry, 6, 6, 0],
  [red, blurry, 7, 7, 0],
  [red, noisy, 0, 0, 1],
  [red, noisy, 1, 1, 1],
  [red, noisy, 2, 2, 1],
  [red, noisy, 3, 3, 1],
  [red, noisy, 4, 4, 1],
  [red, noisy, 5, 5, 1],
  [red, noisy, 6, 6, 1],
  [red, noisy, 7, 7, 1],
  [blue, blurry, 0, 0, 2],
  [blue, blurry, 1, 1, 2],
  [blue, blurry, 2, 2, 2],
  [blue, blurry, 3, 3, 2],
  [blue, blurry, 4, 4, 2],
  [blue, blurry, 5, 5, 2],
  [blue, blurry, 6, 6, 2],
  [blue, blurry, 7, 7, 2],
  [blue, noisy, 0, 0, 3],
  [blue, noisy, 1, 1, 3],
  [blue, noisy, 2, 2, 3],
  [blue, noisy, 3, 3, 3],
  [blue, noisy, 4, 4, 3],
  [blue, noisy, 5, 5, 3],
  [blue, noisy, 6, 6, 3],
  [blue, noisy, 7, 7, 3],
]
const prefix6 = [
  [red, blurry, 0, 0, 0],
  [red, blurry, 1, 1, 0],
  [red, noisy, 2, 0, 1],
  [red, noisy, 3, 1, 1],
  [blue, blurry, 4, 0, 2],
  [blue, blurry, 5, 1, 2],
]
const concrete31Seeds = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
  27, 28, 29, 30,
]
const scenarios = [
  {
    name: 'boundary32',
    batch: { iterations: 8, maxPrompts: 4, seedBehavior: 'per-iteration' },
    expected: boundary32,
    truncated: false,
  },
  {
    name: 'prefix6',
    batch: { iterations: 2, maxPrompts: 3, seedBehavior: 'per-prompt' },
    expected: prefix6,
    truncated: true,
  },
  {
    name: 'concrete31 neighbor',
    batch: { iterations: 31, maxPrompts: 1, seedBehavior: 'per-iteration' },
    expected: concrete31Seeds.map((seed) => [red, blurry, seed, seed, 0]),
    concretePair: true,
    truncated: false,
  },
  {
    name: 'concrete1 neighbor',
    batch: { iterations: 1, maxPrompts: 1, seedBehavior: 'per-iteration' },
    expected: [[red, blurry, 0, 0, 0]],
    concretePair: true,
    truncated: false,
  },
]

// Boundary: actual production planner through durable Main admission and per-item projection.
// Invariant:32 is admitted completely;3 selected pairs expand into6 ordered jobs with truncation.
// Neighbors: concrete31/1 have one pair and stay below the public admission ceiling.
// Isolated source faults: public32→33 affects only refusal33; truncated:false affects prefix6.
// Those each yield4 semantic RED/16 neighboring GREEN. Overflow>→>= affects boundary32 and
// concrete31 (1 pair equals floor(32/31)), yielding8 RED/12 GREEN without import/setup failures.
for (const objective of ['epsilon', 'v_prediction'])
  for (const mode of ['img2img', 'outpaint']) {
    for (const scenario of scenarios)
      test(`${objective}/${mode}: actual Main ${scenario.name}`, async () => {
        let actual
        await assert.doesNotReject(async () => {
          actual = await produce(installedFixture(), objective, mode, 'fixed', 0, {
            batch: { ...scenario.batch },
            concretePair: scenario.concretePair === true,
          })
        }, `Actual Main must admit the valid ${scenario.name} image batch.`)
        assert.equal(actual.preparedSeed, 0)
        assert.equal(actual.picks, 0)
        assert.equal(actual.edits, 1)
        assert.equal(actual.capacityPreflights, 1)
        assert.equal(actual.plan.truncated, scenario.truncated)
        assert.equal(actual.rows.length, scenario.expected.length)
        assert.equal(actual.configs.length, scenario.expected.length)
        assert.equal(new Set(actual.rows.map(({ id }) => id)).size, scenario.expected.length)
        assert.deepEqual(
          actual.plan.items.map(({ prompts, seed, iteration, promptPairIndex }) => [
            prompts.positive,
            prompts.negative,
            seed,
            iteration,
            promptPairIndex,
          ]),
          scenario.expected,
        )
        const payloads = actual.rows.map(({ frozen_payload_json }) =>
          JSON.parse(frozen_payload_json),
        )
        for (const [index, [positive, negative, seed]] of scenario.expected.entries()) {
          const payload = payloads[index]
          assert.equal(payload.kind, `illustrious-${mode}`)
          assert.equal(
            payload.context.kind,
            mode === 'outpaint' ? 'normal-outpaint-preparation' : 'normal-img2img-preparation',
          )
          assert.deepEqual(payload.context.bbox, {
            x: mode === 'outpaint' ? 64 : 0,
            y: 0,
            width: 256,
            height: 256,
          })
          assert.deepEqual(payload.context.prompts, { positive, negative })
          assert.deepEqual(payload.workerJob.prompts, { positive, negative })
          assert.equal(payload.context.sampling.seed, seed)
          assert.equal(payload.workerJob.sampling.seed, seed)
          assert.equal(payload.context.sampling.requestedSeedPolicy, 'fixed')
          assert.equal(payload.context.sampling.seedBehavior, scenario.batch.seedBehavior)
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
          assert.equal(config.sampling.actualSeed, seed)
          assert.equal(config.sampling.requestedSeedPolicy, 'fixed')
          assert.equal(config.sampling.seedBehavior, scenario.batch.seedBehavior)
        }
      })

    test(`${objective}/${mode}: actual Main refusal33 preserves admission state`, async () => {
      const actual = await produce(installedFixture(), objective, mode, 'fixed', 0, {
        batch: { iterations: 33, maxPrompts: 1, seedBehavior: 'per-iteration' },
        concretePair: true,
        observeRefusal: true,
      })
      assert.equal(actual.refusal?.name, 'GenerationBatchPlanError')
      assert.equal(actual.refusal?.code, 'BATCH_TOO_LARGE')
      assert.equal(
        actual.refusal?.message,
        'The planned jobs exceed the supplied batch admission limit.',
      )
      assert.equal(actual.preparedSeed, 0)
      assert.equal(actual.picks, 0)
      assert.equal(actual.edits, 0)
      assert.equal(actual.capacityPreflights, 0)
      for (const rows of Object.values(actual.admissionStateBefore.tables))
        assert.deepEqual(rows, [])
      assert.deepEqual(actual.admissionStateBefore.document.layers, [])
      assert.equal(actual.admissionStateBefore.privateFiles.scratch.kind, 'directory')
      assert.deepEqual(
        actual.admissionStateAfter,
        actual.admissionStateBefore,
        'Actual refused33 admission must preserve SQLite, seed cursor, source document, identity file and scratch/private files.',
      )
    })
  }
