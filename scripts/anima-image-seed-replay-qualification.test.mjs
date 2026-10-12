/** Genuine Main preparations/rows versus complete independent arbitrary-seed image oracles. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertAnimaImageSeedReplayBaseline as assertBaseline,
  assertAnimaImageSeedReplayConfiguration as assertConfiguration,
  assertAnimaImageSeedReplayFrozen as assertFrozen,
  assertAnimaImageSeedReplayItem as assertItem,
  assertAnimaImageSeedReplayPixels as assertPixels,
  literalAnimaImageSeedReplayNativePlan as nativePlan,
  literalAnimaImageSeedReplayPlan as literal,
  normalizeAnimaImageSeedReplayNativeInputs as normalize,
  normalizeAnimaImageSeedReplayReferenceInputs as referenceInputs,
  resolveAnimaImageSeedReplayPlan as resolve,
  validateAnimaImageSeedReplayFixture as validate,
  animaImageSeedReplayBaselineSources,
} from './anima-image-seed-replay-qualification.mjs'
import { assertAnimaDynamicImageFrozen as oldFrozen } from './anima-dynamic-image-qualification.mjs'
import {
  envelope,
  installedFixture,
  produced,
  retainedBaseline,
  pixelGenerations,
  testBaseSeed,
} from './anima-image-seed-replay-test-fixtures.mjs'
import { produced as recoveryProduced } from './anima-image-reuse-crash-main-fixtures.mjs'

// Lexical report descriptors below are declared peers, never actual native/recovery evidence.
function recoveryEnvelope(stage, mode, baseSeed) {
  const fixture = envelope('replay', mode, baseSeed)
  delete fixture.replaySeed
  return {
    ...fixture,
    stage,
    baseSeed,
    artifacts: fixture.artifacts.replace('replay-', `${stage}-`),
    baseline: {
      ...fixture.baseline,
      reportPath: fixture.baseline.reportPath.replace('random-', 'replay-'),
    },
    baselineSourceSnapshots: Object.fromEntries(
      animaImageSeedReplayBaselineSources.map((source) => [
        source,
        {
          path: fixture.referenceFixture.path.replace(
            'reference.json',
            `prior-${source.split('/').at(-1)}`,
          ),
          sha256: 'd'.repeat(64),
        },
      ]),
    ),
    ...(stage === 'reuse'
      ? {
          crashSource: {
            reportPath: fixture.referenceFixture.path.replace(
              'reference.json',
              `crash-${mode}/report.json`,
            ),
            reportSha256: 'e'.repeat(64),
          },
        }
      : {}),
  }
}

test('finite crash3/Reuse8 scopes retain exact prior Fixed controls and typed policy without broadening Random/replay fixtures', () => {
  let admissions = 0,
    completions = 0,
    canceled = 0
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['crash', 'reuse']) {
      const fixture = recoveryEnvelope(stage, mode, 31),
        plan = validate(fixture)
      assert.equal(plan.baseSeed, 31)
      assert.equal(plan.fixedSeed, stage === 'reuse' ? null : 31)
      assert.equal(plan.requestedSeedPolicy, stage === 'reuse' ? 'reuse' : 'fixed')
      assert.equal(plan.maxPrompts, stage === 'crash' ? 1 : 4)
      assert.deepEqual(
        plan.items.map(({ seed }) => seed),
        stage === 'crash' ? [31, 32, 33] : [31, 32, 33, 34, 35, 36, 37, 38],
      )
      assert.deepEqual(
        plan.items.map(({ promptPairIndex }) => promptPairIndex),
        stage === 'crash' ? [0, 0, 0] : [0, 0, 1, 1, 2, 2, 3, 3],
      )
      assert.deepEqual(
        plan.sourcePrompts,
        stage === 'crash' ? plan.items[0].prompts : literal('replay', mode, 31).sourcePrompts,
      )
      admissions += plan.expectedAdmissions
      completions += plan.expectedCompletions
      canceled += plan.expectedCanceled
      for (const mutate of [
        (v) => {
          delete v.baselineSourceSnapshots
        },
        (v) => {
          delete v.baselineSourceSnapshots['scripts/installed-dynamic-batch-driver.mjs']
        },
        (v) => {
          v.baselineSourceSnapshots['src/main/projects/anima-generation-preparation.ts'] =
            Object.values(v.baselineSourceSnapshots)[0]
        },
        (v) => {
          Object.values(v.baselineSourceSnapshots)[0].sha256 = 'bad'
        },
        (v) => {
          Object.values(v.baselineSourceSnapshots)[0].path = v.artifacts
        },
        (v) => {
          v.replaySeed = 31
        },
      ]) {
        const wrong = structuredClone(fixture)
        mutate(wrong)
        assert.throws(() => validate(wrong))
      }
      if (stage === 'reuse') {
        const wrong = structuredClone(fixture)
        delete wrong.crashSource
        assert.throws(() => validate(wrong))
      }
    }
  assert.deepEqual([admissions, completions, canceled], [22, 18, 4])
  assert.throws(() =>
    validate({
      ...envelope(),
      baselineSourceSnapshots: recoveryEnvelope('crash', 'img2img', 31).baselineSourceSnapshots,
    }),
  )
})

for (const mode of ['img2img', 'outpaint'])
  test(`${mode}: genuine Main Fixed first-pair3 and Reuse8 rows retain complete native/raw/compiled domains without physical-crash claims`, async () => {
    const reference = installedFixture()
    for (const [stage, baseSeed] of [
      ['crash', 31],
      ['reuse', 0],
      ['reuse', 31],
    ]) {
      const actual = await recoveryProduced(reference, stage, mode, { baseSeed }),
        plan = literal(stage, mode, baseSeed)
      assert.deepEqual(resolve(plan, actual.rows), plan)
      for (const [index, row] of actual.rows.entries()) {
        const frozen = JSON.parse(row.frozen_payload_json),
          item = plan.items[index]
        assertFrozen(frozen, item, reference)
        assertConfiguration(actual.configs[index], item, reference)
        assert.equal(
          frozen.context.sampling.requestedSeedPolicy,
          stage === 'reuse' ? 'reuse' : 'fixed',
        )
        assert.equal(frozen.workerJob.sampling.posteriorSeed, nativePlan(item.seed).posteriorSeed)
        for (const mutate of [
          (v) => {
            v.context.sampling.requestedSeedPolicy = stage === 'reuse' ? 'fixed' : 'reuse'
          },
          (v) => {
            v.context.sampling.seed = 91
          },
          (v) => {
            v.workerJob.sampling.posteriorSeed = 0
          },
          (v) => {
            v.workerJob.prompts.negative.spans[0].weight = 1
          },
        ]) {
          const wrong = structuredClone(frozen)
          mutate(wrong)
          assert.throws(() => assertFrozen(wrong, item, reference))
        }
        const wrong = structuredClone(item)
        wrong.iteration = 7
        assert.throws(() => assertItem(wrong))
      }
      const fixture = recoveryEnvelope(stage, mode, baseSeed)
      const fixed = await produced(reference, 'replay', mode, { baseSeed }),
        fixedPlan = literal('replay', mode, baseSeed)
      const baseline = {
        status: 'passed',
        profile: 'anima-image-seed-replay',
        stage: 'replay',
        literalPlan: fixedPlan,
        resolvedPlan: fixedPlan,
        nativePhysicalExit: { confirmed: true },
        savedPackage: {
          acceptedLayers: 8,
          sourceLayers: 1,
          totalLayers: 9,
          reopened: true,
          lastActualSeedSnapshot: fixedPlan.items.at(-1).seed,
        },
        admissions: fixed.rows.map((row) => ({ row })),
        generations: fixed.rows.map((row, index) => ({
          queueItemId: row.id,
          expectedItem: fixedPlan.items[index],
          frozen: JSON.parse(row.frozen_payload_json),
          row: { status: 'completed' },
          accepted: true,
          provenance: { generationConfiguration: fixed.configs[index] },
          dimensions: { pixelSha256: 'f'.repeat(64) },
        })),
        comparisons: fixed.rows.map(({ id }) => ({ queueItemId: id, readOnly: true })),
      }
      assertBaseline({ baseline, fixture, plan, reference })
      assert.deepEqual(
        referenceInputs(JSON.parse(actual.rows[0].frozen_payload_json)),
        referenceInputs(JSON.parse(fixed.rows[0].frozen_payload_json)),
      )
      for (const mutate of [
        (v) => {
          v.stage = 'random'
        },
        (v) => {
          v.savedPackage.lastActualSeedSnapshot = baseSeed
        },
        (v) => {
          v.generations[7].provenance.generationConfiguration.sampling.requestedSeedPolicy = 'reuse'
        },
        (v) => {
          v.comparisons[7].queueItemId = v.comparisons[0].queueItemId
        },
      ]) {
        const wrong = structuredClone(baseline)
        mutate(wrong)
        assert.throws(() => assertBaseline({ baseline: wrong, fixture, plan, reference }))
      }
    }
  })

test('finite32/4/16 Random/Fixed scope keeps unknown entropy until admission and independently defines uint32 native domains', () => {
  let jobs = 0,
    packages = 0,
    replays = 0
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['random', 'replay']) {
      const plan = validate(envelope(stage, mode))
      assert.equal(plan.expectedAdmissions, 8)
      assert.equal(plan.expectedCanceled, 0)
      assert.equal(plan.iterations, 2)
      assert.equal(plan.maxPrompts, 4)
      assert.equal(plan.seedBehavior, 'per-prompt')
      assert.equal(plan.truncated, false)
      assert.deepEqual(
        plan.items.map(({ promptPairIndex }) => promptPairIndex),
        [0, 0, 1, 1, 2, 2, 3, 3],
      )
      assert.deepEqual(
        plan.items.map(({ iteration }) => iteration),
        [0, 1, 0, 1, 0, 1, 0, 1],
      )
      assert.deepEqual(
        plan.items.map(({ seed }) => seed),
        stage === 'random'
          ? [null, null, null, null, null, null, null, null]
          : [
              2147483664, 2147483665, 2147483666, 2147483667, 2147483668, 2147483669, 2147483670,
              2147483671,
            ],
      )
      if (stage === 'random') {
        assert.equal(plan.baseSeed, null)
        assert.equal(plan.fixedSeed, null)
        assert.equal(plan.randomBaseSource, null)
      }
      jobs += 8
      packages++
      replays += stage === 'replay' ? 8 : 0
    }
  assert.deepEqual([jobs, packages, replays], [32, 4, 16])
  for (const [seed, posterior] of [
    [0, 2654435769],
    [1, 2654435768],
    [2147483648, 506952121],
    [4294967295, 1640531526],
    [2147483664, 506952105],
    [2147483671, 506952110],
  ]) {
    const plan = nativePlan(seed)
    assert.equal(plan.seed, seed)
    assert.equal(plan.stepSeed, seed)
    assert.equal(plan.posteriorSeed, posterior)
    assert.deepEqual(plan.sigmas, [0.8571428571428571, 0.6, 0])
    assert.deepEqual(plan.timesteps, [857.1428571428571, 600])
    assert.equal(plan.totalSteps, 2)
  }
  assert.deepEqual(
    literal('replay', 'img2img', 4294967295).items.map(({ seed }) => seed),
    [4294967295, 0, 1, 2, 3, 4, 5, 6],
  )
  assert.equal(literal('replay', 'img2img', 0).baseSeed, 0)
  for (const seed of [-1, 4294967296, 0.5, undefined, null]) assert.throws(() => nativePlan(seed))
  assert.throws(() => literal('random', 'img2img', 0))
})

test('strict Random/replay fixture refuses hidden policy overrides, stale/future scopes and foreign references', () => {
  for (const mutate of [
    (v) => {
      v.profile = 'illustrious-image-seed-replay'
    },
    (v) => {
      v.stage = 'reuse'
    },
    (v) => {
      v.mode = 'txt2img'
    },
    (v) => {
      v.seedBehavior = 'per-prompt'
    },
    (v) => {
      v.mutation = {}
    },
    (v) => {
      v.replaySeed = null
    },
    (v) => {
      v.replaySeed = 4294967296
    },
    (v) => {
      delete v.baseline
    },
    (v) => {
      v.baseline.allowedMetadataDifferences = ['requestedSeedPolicy']
    },
    (v) => {
      v.baseline.reportPath = v.artifacts + '/report.json'
    },
    (v) => {
      v.sourceImage.path = '/tmp/source.png'
    },
  ]) {
    const fixture = envelope('replay')
    mutate(fixture)
    assert.throws(() => validate(fixture))
  }
  assert.throws(() => validate({ ...envelope(), replaySeed: 0 }))
  assert.throws(() => validate({ ...envelope(), baseline: envelope('replay').baseline }))
})

for (const mode of ['img2img', 'outpaint'])
  test(`${mode}: actual Random8/Fixed8 Main rows retain complete high-bit raw/compiled/native recipes and policy-only equality`, async () => {
    const reference = installedFixture(),
      random = await produced(reference, 'random', mode),
      replay = await produced(reference, 'replay', mode)
    const randomLiteral = literal('random', mode),
      randomPlan = resolve(randomLiteral, random.rows),
      replayPlan = literal('replay', mode, testBaseSeed)
    assert.equal(randomPlan.baseSeed, testBaseSeed)
    assert.equal(randomPlan.fixedSeed, null)
    assert.deepEqual(randomPlan.randomBaseSource, {
      kind: 'first-admitted-frozen-request',
      queueItemId: random.rows[0].id,
      seed: testBaseSeed,
    })
    assert.deepEqual(resolve(randomPlan, random.rows), randomPlan)
    assert.deepEqual(resolve(replayPlan, replay.rows), replayPlan)
    for (const [actual, plan] of [
      [random, randomPlan],
      [replay, replayPlan],
    ]) {
      for (const [index, row] of actual.rows.entries()) {
        const frozen = JSON.parse(row.frozen_payload_json),
          item = plan.items[index]
        assertItem(item)
        assertFrozen(frozen, item, reference)
        assertConfiguration(actual.configs[index], item, reference)
        assert.throws(() => oldFrozen(frozen, item, reference), /tuple membership/)
        for (const [label, mutate] of [
          [
            'policy',
            (v) => {
              v.context.sampling.requestedSeedPolicy =
                item.requestedSeedPolicy === 'random' ? 'fixed' : 'random'
            },
          ],
          [
            'contextseed',
            (v) => {
              v.context.sampling.seed = 37
            },
          ],
          [
            'workerseed',
            (v) => {
              v.workerJob.sampling.seed = 37
            },
          ],
          [
            'posterior',
            (v) => {
              v.workerJob.sampling.posteriorSeed = 37
            },
          ],
          [
            'stepseed',
            (v) => {
              v.workerJob.sampling.stepSeed = 37
            },
          ],
          [
            'behavior',
            (v) => {
              v.context.sampling.seedBehavior = 'per-iteration'
            },
          ],
          [
            'grid',
            (v) => {
              v.workerJob.sampling.sigmas[0] = 0.6
            },
          ],
          [
            'updates',
            (v) => {
              v.workerJob.sampling.totalSteps = 3
            },
          ],
          [
            'rawpositive',
            (v) => {
              v.context.prompts.positive = 'late positive'
            },
          ],
          [
            'rawnegative',
            (v) => {
              v.context.prompts.negative = 'late negative'
            },
          ],
          [
            'compiledweight',
            (v) => {
              v.workerJob.prompts.positive.spans[1].weight = 1
            },
          ],
          [
            'negativeoffset',
            (v) => {
              v.workerJob.prompts.negative.spans[0].end--
            },
          ],
          [
            'compiledtext',
            (v) => {
              v.workerJob.prompts.negative.cleanedText = 'late negative'
            },
          ],
          [
            'encoder',
            (v) => {
              v.workerJob.model.qwen3Encoder.sha256 = '9'.repeat(64)
            },
          ],
          [
            'LoRA',
            (v) => {
              v.workerJob.loras[0].weight = 0.5
            },
          ],
          [
            'source',
            (v) => {
              v.workerJob.target.sha256 = '9'.repeat(64)
            },
          ],
          [
            'schema',
            (v) => {
              v.schemaVersion = 2
            },
          ],
        ]) {
          const wrong = structuredClone(frozen)
          mutate(wrong)
          assert.throws(() => assertFrozen(wrong, item, reference), undefined, label)
          assert.notDeepEqual(normalize(wrong), normalize(frozen), label)
          if (label === 'behavior') assert.throws(() => referenceInputs(wrong))
          else if (label !== 'policy')
            assert.notDeepEqual(referenceInputs(wrong), referenceInputs(frozen), label)
        }
        for (const mutate of [
          (v) => {
            v.sampling.requestedSeedPolicy =
              item.requestedSeedPolicy === 'random' ? 'fixed' : 'random'
          },
          (v) => {
            v.sampling.actualSeed = 37
          },
          (v) => {
            v.sampling.seedBehavior = 'per-iteration'
          },
          (v) => {
            v.positivePrompt.text = 'late positive'
          },
          (v) => {
            v.negativePrompt.embeddingRefs = [{ token: '<unsupported>' }]
          },
          (v) => {
            v.compiledPrompts = item.compiledPrompts
          },
        ]) {
          const wrong = structuredClone(actual.configs[index])
          mutate(wrong)
          assert.throws(() => assertConfiguration(wrong, item, reference))
        }
        const bad = structuredClone(item)
        bad.baseSeed = 0
        assert.throws(() => assertFrozen(frozen, bad, reference), /membership/)
        if (mode === 'outpaint') {
          const wrong = structuredClone(frozen)
          wrong.context.conditioning.keepMask.sha256 = '9'.repeat(64)
          assert.throws(() => assertFrozen(wrong, item, reference))
          assert.notDeepEqual(referenceInputs(wrong), referenceInputs(frozen))
        }
      }
      const pixels = pixelGenerations(actual, plan),
        contrasts = assertPixels(pixels, plan)
      assert.deepEqual(
        contrasts.map(({ leftIndex, rightIndex }) => [leftIndex, rightIndex]),
        [
          [0, 1],
          [2, 3],
          [4, 5],
          [6, 7],
        ],
      )
      for (const mutate of [
        (v) => {
          v[1].rgba = Buffer.from(v[0].rgba)
        },
        (v) => {
          v[1].rgba[3] = v[0].rgba[3] ? 0 : 255
        },
        (v) => {
          v.reverse()
        },
        (v) => {
          v[1].frozen.context.target.sha256 = '9'.repeat(64)
        },
      ]) {
        const wrong = structuredClone(pixels)
        mutate(wrong)
        assert.throws(() => assertPixels(wrong, plan))
      }
      for (const mutate of [
        (v) => {
          v[7].frozen_payload_json = JSON.stringify({
            ...JSON.parse(v[7].frozen_payload_json),
            workerJob: {
              ...JSON.parse(v[7].frozen_payload_json).workerJob,
              sampling: nativePlan(testBaseSeed),
            },
          })
        },
        (v) => {
          v[7].id = v[0].id
        },
        (v) => {
          v.reverse()
        },
      ]) {
        const wrong = structuredClone(actual.rows)
        mutate(wrong)
        assert.throws(() => resolve(plan, wrong))
      }
    }
    for (let index = 0; index < 8; index++) {
      const left = JSON.parse(random.rows[index].frozen_payload_json),
        right = JSON.parse(replay.rows[index].frozen_payload_json)
      assert.notDeepEqual(normalize(left), normalize(right))
      assert.deepEqual(referenceInputs(left), referenceInputs(right))
      const extra = { ...left, unexpectedOuter: 'preserve-me' }
      assert.equal(normalize(extra).unexpectedOuter, 'preserve-me')
      assert.equal(referenceInputs(extra).unexpectedOuter, 'preserve-me')
      assert.notDeepEqual(referenceInputs(extra), referenceInputs(left))
      assert.equal(referenceInputs(left).context.sampling.seedBehavior, 'per-prompt')
    }
    const fixture = envelope('replay', mode),
      baseline = retainedBaseline(random, mode)
    assertBaseline({ baseline, fixture, plan: replayPlan, reference })
    for (const mutate of [
      (v) => {
        v.seedAdmissionObservation.calls[0].seed = 0
      },
      (v) => {
        v.seedAdmissionObservation.outputSubstitution = true
      },
      (v) => {
        v.seedAdmissionObservation.originalIdentityRestored = false
      },
      (v) => {
        v.nativePhysicalExit.confirmed = false
      },
      (v) => {
        v.generations[7].accepted = false
      },
      (v) => {
        v.comparisons[7].queueItemId = v.comparisons[0].queueItemId
      },
      (v) => {
        v.generations[7].provenance.generationConfiguration.sampling.actualSeed = 0
      },
      (v) => {
        v.generations[7].frozen.workerJob.sampling.posteriorSeed = 0
      },
      (v) => {
        v.savedPackage.lastActualSeedSnapshot = 0
      },
    ]) {
      const wrong = structuredClone(baseline)
      mutate(wrong)
      assert.throws(() => assertBaseline({ baseline: wrong, fixture, plan: replayPlan, reference }))
    }
  })

test('controlled zero and incidental-wrap Main cases preserve base0 and last chronological snapshot instead of maximum seed', async () => {
  const reference = installedFixture()
  for (const baseSeed of [0, 4294967295]) {
    const actual = await produced(reference, 'random', 'img2img', { baseSeed }),
      original = literal('random', 'img2img'),
      resolved = resolve(original, actual.rows)
    assert.equal(resolved.baseSeed, baseSeed)
    assert.deepEqual(
      resolved.items.map(({ seed }) => seed),
      baseSeed === 0 ? [0, 1, 2, 3, 4, 5, 6, 7] : [4294967295, 0, 1, 2, 3, 4, 5, 6],
    )
    const baseline = retainedBaseline(actual, 'img2img'),
      fixture = envelope('replay', 'img2img', baseSeed),
      plan = literal('replay', 'img2img', baseSeed)
    assert.equal(baseline.savedPackage.lastActualSeedSnapshot, baseSeed === 0 ? 7 : 6)
    assertBaseline({ baseline, fixture, plan, reference })
    const wrong = structuredClone(baseline)
    wrong.savedPackage.lastActualSeedSnapshot = baseSeed
    assert.throws(() => assertBaseline({ baseline: wrong, fixture, plan, reference }))
  }
})
