/** Whole independent seed0…7 image oracles against genuine Main rows/configs; peers are declared. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertAnimaDynamicImagePerPromptBaseline as assertBaseline,
  assertAnimaDynamicImagePerPromptConfiguration as assertConfiguration,
  assertAnimaDynamicImagePerPromptFrozen as assertFrozen,
  assertAnimaDynamicImagePerPromptItem as assertItem,
  assertAnimaDynamicImagePerPromptPixels as assertPixels,
  animaDynamicImagePerPromptControlIndices as indices,
  literalAnimaDynamicImagePerPromptNativePlan as nativePlan,
  literalAnimaDynamicImagePerPromptPlan as literal,
  normalizeAnimaDynamicImagePerPromptNativeInputs as normalize,
  normalizeAnimaDynamicImagePerPromptReferenceInputs as referenceInputs,
  resolveAnimaDynamicImagePerPromptPlan as resolve,
  validateAnimaDynamicImagePerPromptFixture as validate,
} from './anima-dynamic-image-per-prompt-qualification.mjs'
import { assertAnimaDynamicImageFrozen as oldFrozen } from './anima-dynamic-image-qualification.mjs'
import {
  envelope,
  installedFixture,
  produced,
  retainedBaseline,
  pixelGenerations,
} from './anima-dynamic-image-per-prompt-test-fixtures.mjs'

test('handwritten per-prompt image80/4/16 tables retain all four pairs, all eight native domains and exact own indices', () => {
  let jobs = 0,
    packages = 0,
    matches = 0
  assert.deepEqual(indices, [0, 1, 10, 11, 20, 21, 30, 31])
  const posterior = [
    2654435769, 2654435768, 2654435771, 2654435770, 2654435773, 2654435772, 2654435775, 2654435774,
  ]
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['numeric-control', 'per-prompt']) {
      const plan = validate(envelope(stage, mode))
      const seeds =
        stage === 'numeric-control'
          ? [
              0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4,
              5, 6, 7,
            ]
          : [0, 1, 2, 3, 4, 5, 6, 7]
      assert.deepEqual(
        plan.items.map(({ seed }) => seed),
        seeds,
      )
      assert.deepEqual(
        plan.items.map(({ promptPairIndex }) => promptPairIndex),
        stage === 'numeric-control'
          ? [
              0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3,
              3, 3, 3,
            ]
          : [0, 0, 1, 1, 2, 2, 3, 3],
      )
      assert.equal(plan.iterations, stage === 'numeric-control' ? 8 : 2)
      assert.equal(plan.maxPrompts, 4)
      assert.equal(plan.truncated, false)
      assert.equal(plan.expectedCanceled, 0)
      assert.equal(plan.items.at(-1).seed, 7)
      assert.ok(Object.isFrozen(plan.items[0].compiledPrompts.positive.spans[1]))
      jobs += plan.expectedAdmissions
      packages++
      matches += stage === 'per-prompt' ? 8 : 0
      for (const item of plan.items) {
        assertItem(item)
        const native = nativePlan(item.seed)
        assert.equal(native.posteriorSeed, posterior[item.seed])
        assert.equal(native.stepSeed, item.seed)
        assert.deepEqual(native.sigmas, [0.8571428571428571, 0.6, 0])
        assert.deepEqual(native.timesteps, [857.1428571428571, 600])
        assert.equal(native.totalSteps, 2)
      }
    }
  assert.deepEqual([jobs, packages, matches], [80, 4, 16])
  for (const seed of [-1, 8, 37, null, undefined, 0.5]) assert.throws(() => nativePlan(seed))
})

test('strict own-report envelope rejects unsupported scope, metadata exceptions and foreign/overlapping references', () => {
  for (const mutate of [
    (v) => {
      v.stage = 'baseline'
    },
    (v) => {
      v.mode = 'txt2img'
    },
    (v) => {
      v.profile = 'anima-dynamic-image'
    },
    (v) => {
      v.seedBehavior = 'per-iteration'
    },
    (v) => {
      v.mutation = {}
    },
    (v) => {
      delete v.baseline
    },
    (v) => {
      v.baseline.allowedMetadataDifferences = ['seedBehavior']
    },
    (v) => {
      v.baseline.reportPath = v.artifacts + '/report.json'
    },
    (v) => {
      v.sourceImage.path = '/tmp/source.png'
    },
    (v) => {
      v.workerBaseline.path = v.artifacts + '/worker.json'
    },
    (v) => {
      v.baseline.reportSha256 = 'wrong'
    },
  ]) {
    const value = envelope('per-prompt')
    mutate(value)
    assert.throws(() => validate(value))
  }
  assert.throws(() => validate({ ...envelope(), baseline: envelope('per-prompt').baseline }))
  const out = envelope('numeric-control', 'outpaint')
  delete out.lamaSource
  assert.throws(() => validate(out))
})

for (const mode of ['img2img', 'outpaint'])
  test(`${mode}: real32/8 Main schedules preserve full raw/compiled inputs, native0…7 domains and own metadata-only controls`, async () => {
    const reference = installedFixture(),
      controls = await produced(reference, 'numeric-control', mode),
      subjects = await produced(reference, 'per-prompt', mode)
    const controlPlan = literal('numeric-control', mode),
      subjectPlan = literal('per-prompt', mode)
    for (const [actual, plan] of [
      [controls, controlPlan],
      [subjects, subjectPlan],
    ]) {
      assert.deepEqual(resolve(plan, actual.rows), plan)
      for (const [index, row] of actual.rows.entries()) {
        const frozen = JSON.parse(row.frozen_payload_json),
          item = plan.items[index]
        assertFrozen(frozen, item, reference)
        assertConfiguration(actual.configs[index], item, reference)
        if (item.seed > 1 || item.seedBehavior === 'per-prompt' || item.iteration > 1)
          assert.throws(() => oldFrozen(frozen, item, reference), /tuple membership/)
        for (const [label, mutate] of [
          [
            'rawpositive',
            (v) => {
              v.context.prompts.positive = 'later positive'
            },
          ],
          [
            'rawnegative',
            (v) => {
              v.context.prompts.negative = 'later negative'
            },
          ],
          [
            'positiveweight',
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
            'cleanedtext',
            (v) => {
              v.workerJob.prompts.negative.cleanedText = 'later negative'
            },
          ],
          [
            'compiledversion',
            (v) => {
              v.workerJob.prompts.positive.version = 'other'
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
            'posteriorseed',
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
            'numericalgrid',
            (v) => {
              v.workerJob.sampling.sigmas[0] = 0.6
            },
          ],
          [
            'beginindex',
            (v) => {
              v.workerJob.sampling.beginIndex = 0
            },
          ],
          [
            'updatecount',
            (v) => {
              v.workerJob.sampling.totalSteps = 3
            },
          ],
          [
            'behavior',
            (v) => {
              v.context.sampling.seedBehavior =
                item.seedBehavior === 'per-iteration' ? 'per-prompt' : 'per-iteration'
            },
          ],
          [
            'source',
            (v) => {
              v.workerJob.target.sha256 = '9'.repeat(64)
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
            'outerversion',
            (v) => {
              v.schemaVersion = 2
            },
          ],
          [
            'outerDTO',
            (v) => {
              v.unpromised = true
            },
          ],
          [
            'extraDTO',
            (v) => {
              v.workerJob.unpromised = true
            },
          ],
        ]) {
          const wrong = structuredClone(frozen)
          mutate(wrong)
          assert.throws(() => assertFrozen(wrong, item, reference), undefined, label)
          assert.notDeepEqual(normalize(wrong), normalize(frozen), label)
          if (label !== 'behavior')
            assert.notDeepEqual(referenceInputs(wrong), referenceInputs(frozen), label)
        }
        for (const mutate of [
          (v) => {
            v.positivePrompt.text = 'later positive'
          },
          (v) => {
            v.negativePrompt.embeddingRefs = [{ token: '<unsupported>' }]
          },
          (v) => {
            v.sampling.actualSeed = 37
          },
          (v) => {
            v.sampling.seedBehavior =
              item.seedBehavior === 'per-iteration' ? 'per-prompt' : 'per-iteration'
          },
          (v) => {
            v.compiledPrompts = item.compiledPrompts
          },
          (v) => {
            v.sampling.animaMethod = 'heun'
          },
        ]) {
          const wrong = structuredClone(actual.configs[index])
          mutate(wrong)
          assert.throws(() => assertConfiguration(wrong, item, reference))
        }
        const wrongItem = structuredClone(item)
        wrongItem.compiledPrompts.positive.spans[1].weight = 1
        assert.throws(() => assertFrozen(frozen, wrongItem, reference), /tuple membership/)
        if (mode === 'outpaint') {
          const wrong = structuredClone(frozen)
          wrong.context.conditioning.policy.fadeDistance = 8
          assert.throws(() => assertFrozen(wrong, item, reference))
          assert.notDeepEqual(referenceInputs(wrong), referenceInputs(frozen))
        }
      }
      const resolved = structuredClone(actual.rows)
      resolved.at(-1).frozen_payload_json = JSON.stringify({
        ...JSON.parse(resolved.at(-1).frozen_payload_json),
        workerJob: {
          ...JSON.parse(resolved.at(-1).frozen_payload_json).workerJob,
          sampling: nativePlan(0),
        },
      })
      assert.throws(() => resolve(plan, resolved))
      const pixelRows = pixelGenerations(actual, plan),
        contrasts = assertPixels(pixelRows, plan)
      assert.equal(contrasts.length, plan.stage === 'numeric-control' ? 28 : 4)
      for (const edge of contrasts) assert.equal(edge.rightIndex, edge.leftIndex + 1)
      for (const mutate of [
        (v) => {
          v[1].rgba = Buffer.from(v[0].rgba)
        },
        (v) => {
          v[1].rgba[3] = v[0].rgba[3] ? 0 : 255
        },
        (v) => {
          v[1].frozen.context.target.sha256 = '9'.repeat(64)
        },
        (v) => {
          v.reverse()
        },
      ]) {
        const wrong = structuredClone(pixelRows)
        mutate(wrong)
        assert.throws(() => assertPixels(wrong, plan))
      }
    }
    for (const [index, row] of subjects.rows.entries()) {
      const subject = JSON.parse(row.frozen_payload_json),
        control = JSON.parse(controls.rows[indices[index]].frozen_payload_json)
      assert.equal(normalize(subject).schemaVersion, 1)
      assert.notDeepEqual(normalize(subject), normalize(control))
      assert.deepEqual(referenceInputs(subject), referenceInputs(control))
      const owner = structuredClone(subject)
      owner.originRequestId = 'other'
      owner.context.documentId = 'other'
      owner.context.documentRevision = 'other'
      assert.deepEqual(referenceInputs(owner), referenceInputs(subject))
    }
    const fixture = envelope('per-prompt', mode),
      baseline = retainedBaseline(controls, controlPlan)
    assertBaseline({ baseline, fixture, plan: subjectPlan, reference })
    for (const mutate of [
      (v) => {
        v.nativePhysicalExit.confirmed = false
      },
      (v) => {
        v.savedPackage.lastActualSeedSnapshot = 1
      },
      (v) => {
        v.savedPackage.sourceLayers = 0
      },
      (v) => {
        v.generations[31].accepted = false
      },
      (v) => {
        v.comparisons[31].queueItemId = v.comparisons[0].queueItemId
      },
      (v) => {
        v.comparisons[0].readOnly = false
      },
      (v) => {
        v.generations[31].provenance.generationConfiguration.sampling.actualSeed = 0
      },
      (v) => {
        v.generations.reverse()
      },
      (v) => {
        v.literalPlan.items[31].seed = 0
      },
    ]) {
      const wrong = structuredClone(baseline)
      mutate(wrong)
      assert.throws(() =>
        assertBaseline({ baseline: wrong, fixture, plan: subjectPlan, reference }),
      )
    }
  })
