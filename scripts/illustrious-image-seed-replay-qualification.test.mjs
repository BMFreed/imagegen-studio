/** Real preparation/admission/configuration producers; resource verifier doubles, no inference. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertIllustriousImageSeedReplayConfiguration as configuration,
  assertIllustriousImageSeedReplayFrozen as frozen,
  literalIllustriousImageSeedReplayPlan as literal,
  normalizeIllustriousImageSeedReplayNativeInputs as native,
  normalizeIllustriousImageSeedReplayReferenceInputs as execution,
  resolveIllustriousImageSeedReplayPlan as resolve,
  validateIllustriousImageSeedReplayFixture as validate,
} from './illustrious-image-seed-replay-qualification.mjs'
import {
  envelope,
  installedFixture,
  produce,
} from './illustrious-image-seed-replay-test-fixtures.mjs'

for (const objective of ['epsilon', 'v_prediction'])
  for (const mode of ['img2img', 'outpaint'])
    test(`${objective}/${mode}: actual crypto Random preparation and numeric Fixed admission retain policy and exact native inputs`, async () => {
      const reference = installedFixture()
      const random = await produce(reference, objective, mode, 'random')
      const randomPlan = resolve(literal('random', objective, mode), random.rows)
      assert.equal(randomPlan.baseSeed, random.preparedSeed)
      assert.equal(random.picks, 1)
      assert.deepEqual(
        randomPlan.items.map(({ seed }) => seed),
        [0, 1, 2, 3, 4, 5, 6, 7].map((offset) => (random.preparedSeed + offset) % 4294967296),
      )
      const replay = await produce(reference, objective, mode, 'fixed', random.preparedSeed)
      const fixture = envelope('replay', objective, mode, random.preparedSeed)
      const replayPlan = resolve(validate(fixture), replay.rows)
      assert.equal(replay.picks, 0)
      for (let index = 0; index < 8; index++) {
        const original = JSON.parse(random.rows[index].frozen_payload_json)
        const repeated = JSON.parse(replay.rows[index].frozen_payload_json)
        frozen(original, randomPlan.items[index], reference)
        frozen(repeated, replayPlan.items[index], reference)
        configuration(random.configs[index], randomPlan.items[index], reference)
        configuration(replay.configs[index], replayPlan.items[index], reference)
        assert.equal(random.configs[index].sampling.requestedSeedPolicy, 'random')
        assert.equal(replay.configs[index].sampling.requestedSeedPolicy, 'fixed')
        assert.notDeepEqual(native(original), native(repeated))
        const context = { fixture, plan: replayPlan }
        const projected = native(original)
        delete projected.context.sampling.requestedSeedPolicy
        assert.deepEqual(execution(original, context), projected)
        assert.deepEqual(execution(original, context), execution(repeated, context))
        assert.equal(execution(original, context).context.sampling.seedBehavior, 'per-prompt')
        assert.equal(
          execution(original, context).context.sampling.seed,
          replayPlan.items[index].seed,
        )
        assert.deepEqual(execution(original, context).workerJob, original.workerJob)
        for (const mutate of [
          (v) => {
            v.context.sampling.seed = (v.context.sampling.seed + 1) % 4294967296
          },
          (v) => {
            v.workerJob.sampling.seed = (v.workerJob.sampling.seed + 1) % 4294967296
          },
          (v) => {
            v.context.sampling.requestedSeedPolicy = 'fixed'
          },
          (v) => {
            v.context.sampling.seedBehavior = 'per-iteration'
          },
          (v) => {
            v.context.prompts.negative = 'wrong'
            v.workerJob.prompts.negative = 'wrong'
          },
          (v) => {
            v.context.loras[0].weight = -0.25
            v.workerJob.loras[0].weight = -0.25
          },
          (v) => {
            v.workerJob.target.sha256 = 'a'.repeat(64)
          },
        ]) {
          const changed = structuredClone(original)
          mutate(changed)
          assert.throws(() => frozen(changed, randomPlan.items[index], reference))
        }
        for (const mutate of [
          (v) => {
            v.sampling.actualSeed = (v.sampling.actualSeed + 1) % 4294967296
          },
          (v) => {
            v.sampling.requestedSeedPolicy = 'fixed'
          },
          (v) => {
            v.sampling.seedBehavior = 'per-iteration'
          },
          (v) => {
            v.positivePrompt.text = 'late authoring edit'
          },
          (v) => {
            v.loras[0].weight = -0.25
          },
        ]) {
          const changed = structuredClone(random.configs[index])
          mutate(changed)
          assert.throws(() => configuration(changed, randomPlan.items[index], reference))
        }
        for (const mutate of [
          (v) => {
            v.context.sampling.seedBehavior = 'per-iteration'
          },
          (v) => {
            v.context.sampling.seed++
            v.workerJob.sampling.seed++
          },
          (v) => {
            v.context.target.sha256 = 'a'.repeat(64)
            v.workerJob.target.sha256 = 'a'.repeat(64)
          },
          (v) => {
            v.workerJob.checkpoint.predictionType =
              objective === 'epsilon' ? 'v_prediction' : 'epsilon'
          },
        ]) {
          const changed = structuredClone(repeated)
          mutate(changed)
          assert.notDeepEqual(execution(original, context), execution(changed, context))
        }
        assert.throws(() =>
          execution(original, { fixture: envelope('random', objective, mode), plan: randomPlan }),
        )
      }
      // One changed condition must fail rather than redefining expected seeds from each queue row.
      for (const index of [1, 3, 5, 7]) {
        const changed = structuredClone(random.rows)
        const value = JSON.parse(changed[index].frozen_payload_json)
        value.context.sampling.seed = random.preparedSeed
        changed[index].frozen_payload_json = JSON.stringify(value)
        assert.throws(() => resolve(literal('random', objective, mode), changed))
      }
    })

test('strict lexical image Random/replay envelope fixes8scopes64jobs and refuses undeclared scope', () => {
  let jobs = 0
  for (const stage of ['random', 'replay'])
    for (const objective of ['epsilon', 'v_prediction'])
      for (const mode of ['img2img', 'outpaint']) {
        const plan = validate(envelope(stage, objective, mode, 0))
        assert.equal(plan.expectedAdmissions, 8)
        assert.equal(plan.expectedCompletions, 8)
        assert.equal(plan.expectedCanceled, 0)
        assert.equal(plan.seedBehavior, 'per-prompt')
        assert.equal(plan.maxPrompts, 4)
        assert.equal(plan.iterations, 2)
        assert.deepEqual(
          plan.items.map(({ seed }) => seed),
          stage === 'random' ? Array(8).fill(null) : [0, 1, 2, 3, 4, 5, 6, 7],
        )
        jobs += plan.expectedAdmissions
      }
  assert.equal(jobs, 64)
  for (const mutate of [
    (v) => {
      v.stage = 'reuse'
    },
    (v) => {
      v.stage = 'wrap'
    },
    (v) => {
      v.mode = 'txt2img'
    },
    (v) => {
      v.objective = 'anima'
    },
    (v) => {
      v.seedBehavior = 'per-iteration'
    },
    (v) => {
      v.replaySeed = 0
    },
    (v) => {
      v.baseline = envelope('replay').baseline
    },
    (v) => {
      v.sourceImage.path = v.artifacts
    },
    (v) => {
      v.sourceImage.byteSize = 0
    },
    (v) => {
      v.sourceImage.pixelSha256 = 'wrong'
    },
    (v) => {
      v.mutation = {}
    },
  ]) {
    const fixture = envelope()
    mutate(fixture)
    assert.throws(() => validate(fixture))
  }
  for (const mutate of [
    (v) => {
      delete v.baseline
    },
    (v) => {
      delete v.replaySeed
    },
    (v) => {
      v.replaySeed = -1
    },
    (v) => {
      v.replaySeed = 4294967296
    },
    (v) => {
      v.replaySeed = '0'
    },
    (v) => {
      v.baseline.reportPath = '/tmp/not-owned'
    },
    (v) => {
      v.baseline.reportPath = v.artifacts
    },
  ]) {
    const fixture = envelope('replay')
    mutate(fixture)
    assert.throws(() => validate(fixture))
  }
})

test('resolved numeric item identity includes actual base, requested stage, policy, pair and iteration', () => {
  const base = 4294967295
  const plan = literal('replay', 'epsilon', 'img2img', base)
  assert.deepEqual(
    plan.items.map(({ seed }) => seed),
    [4294967295, 0, 1, 2, 3, 4, 5, 6],
  )
  const rows = plan.items.map((item, index) => ({
    id: `item-${index}`,
    frozen: {
      context: {
        sampling: { seed: item.seed, requestedSeedPolicy: 'fixed', seedBehavior: 'per-prompt' },
      },
    },
  }))
  assert.deepEqual(resolve(plan, rows), plan)
  for (const mutate of [
    (v) => {
      v[1].id = v[0].id
    },
    (v) => {
      v.pop()
    },
    (v) => {
      v[1].frozen.context.sampling.seed = base
    },
    (v) => {
      v[0].frozen.context.sampling.requestedSeedPolicy = 'random'
    },
    (v) => {
      v[0].frozen.context.sampling.seedBehavior = 'per-iteration'
    },
    (v) => {
      v[0].frozen_payload_json = JSON.stringify(v[0].frozen)
    },
  ]) {
    const changed = structuredClone(rows)
    mutate(changed)
    assert.throws(() => resolve(plan, changed))
  }
  for (const baseSeed of [0, 4294967295]) {
    const random = literal('random', 'epsilon', 'img2img')
    const admissions = random.items.map((item, index) => ({
      id: `random-${index}`,
      frozen: {
        context: {
          sampling: {
            seed: (baseSeed + index) % 4294967296,
            requestedSeedPolicy: 'random',
            seedBehavior: 'per-prompt',
          },
        },
      },
    }))
    const resolved = resolve(random, admissions)
    assert.equal(resolved.baseSeed, baseSeed)
    assert.deepEqual(resolved.randomBaseSource, {
      kind: 'first-admitted-frozen-request',
      queueItemId: 'random-0',
      seed: baseSeed,
    })
    assert.deepEqual(
      resolved.items.map(({ seed }) => seed),
      [0, 1, 2, 3, 4, 5, 6, 7].map((offset) => (baseSeed + offset) % 4294967296),
    )
    assert.deepEqual(resolve(resolved, admissions), resolved)
    const tampered = structuredClone(resolved)
    tampered.items[3].seed = baseSeed
    assert.throws(() => resolve(tampered, admissions))
  }
})
