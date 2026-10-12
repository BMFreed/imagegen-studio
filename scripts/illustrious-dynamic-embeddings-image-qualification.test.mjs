/** Real Main-produced rows plus explicit retained-report/pixel doubles; no installed ML claim. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertIllustriousDynamicEmbeddingsImageBaseline as assertBaseline,
  assertIllustriousDynamicEmbeddingsImageConfiguration as assertConfiguration,
  assertIllustriousDynamicEmbeddingsImageFrozen as assertFrozen,
  assertIllustriousDynamicEmbeddingsImagePixels as assertPixels,
  effectiveIllustriousDynamicImageEmbeddingRefs as refs,
  literalIllustriousDynamicEmbeddingsImagePlan as literal,
  normalizeIllustriousDynamicEmbeddingsImageNativeInputs as normalize,
  resolveIllustriousDynamicEmbeddingsImagePlan as resolve,
  validateIllustriousDynamicEmbeddingsImageFixture as validate,
} from './illustrious-dynamic-embeddings-image-qualification.mjs'
import {
  envelope,
  installedFixture,
  produced,
  retainedBaseline,
  pixelGenerations,
} from './illustrious-dynamic-embeddings-image-test-fixtures.mjs'

test('eight healthy signed image stages define24 admissions/eight packages/eight exact-prefix controls', () => {
  let count = 0,
    packages = 0,
    controls = 0
  for (const objective of ['epsilon', 'v_prediction'])
    for (const mode of ['img2img', 'outpaint'])
      for (const stage of ['baseline', 'prefix']) {
        const plan = validate(envelope(stage, objective, mode))
        assert.equal(plan.iterations, 1)
        assert.deepEqual(
          plan.items.map(({ seed }) => seed),
          stage === 'baseline' ? [0, 0, 0, 0] : [0, 0],
        )
        assert.deepEqual(
          plan.items.map(({ positiveEmbedding, negativeEmbedding }) => [
            positiveEmbedding,
            negativeEmbedding,
          ]),
          stage === 'baseline'
            ? [
                [null, null],
                [null, 'embeddingTrained'],
                ['embeddingTrained', null],
                ['embeddingTrained', 'embeddingTrained'],
              ]
            : [
                [null, null],
                [null, 'embeddingTrained'],
              ],
        )
        assert.equal(plan.truncated, stage === 'prefix')
        assert.equal(plan.expectedCanceled, 0)
        assert.ok(Object.isFrozen(plan.items[0].prompts))
        assert.deepEqual(plan.sourcePrompts, literal('baseline', objective, mode).sourcePrompts)
        count += plan.expectedAdmissions
        controls += stage === 'prefix' ? plan.expectedCompletions : 0
        packages++
      }
  assert.deepEqual([count, packages, controls], [24, 8, 8])
})
test('strict signed image envelope rejects undeclared policy/mutations and overlapping or unowned inputs', () => {
  for (const [label, mutate] of [
    [
      'unsupportedobjective',
      (v) => {
        v.objective = 'anima'
      },
    ],
    [
      'unsupportedmode',
      (v) => {
        v.mode = 'txt2img'
      },
    ],
    [
      'unsupportedstage',
      (v) => {
        v.stage = 'control'
      },
    ],
    [
      'wrongprofile',
      (v) => {
        v.profile = 'illustrious-dynamic-embeddings'
      },
    ],
    [
      'newseedbehavior',
      (v) => {
        v.seedBehavior = 'per-prompt'
      },
    ],
    [
      'installedmutation',
      (v) => {
        v.mutation = { module: 'inference_embeddings.py' }
      },
    ],
    [
      'missingbaseline',
      (v) => {
        delete v.baseline
      },
    ],
    [
      'unknownbaselinefield',
      (v) => {
        v.baseline.accepted = true
      },
    ],
    [
      'overlappingbaseline',
      (v) => {
        v.baseline.reportPath = v.artifacts + '/report.json'
      },
    ],
    [
      'unownedsource',
      (v) => {
        v.sourceImage.path = '/tmp/source.png'
      },
    ],
    [
      'unknownsourcefield',
      (v) => {
        v.sourceImage.icc = 'sRGB'
      },
    ],
  ]) {
    const fixture = envelope('prefix')
    mutate(fixture)
    assert.throws(() => validate(fixture), undefined, label)
  }
  assert.throws(() => validate({ ...envelope(), baseline: envelope('prefix').baseline }))
})

for (const objective of ['epsilon', 'v_prediction'])
  for (const mode of ['img2img', 'outpaint'])
    test(`${objective}/${mode}: genuine Main concrete signed subsets pass independent whole DTO/configuration checks`, async () => {
      const reference = installedFixture()
      const full = await produced(reference, 'baseline', objective, mode)
      const selected = await produced(reference, 'prefix', objective, mode)
      const fullPlan = literal('baseline', objective, mode),
        prefixPlan = literal('prefix', objective, mode)
      assert.deepEqual(resolve(fullPlan, full.rows), fullPlan)
      assert.deepEqual(resolve(prefixPlan, selected.rows), prefixPlan)
      for (const [actual, plan] of [
        [full, fullPlan],
        [selected, prefixPlan],
      ])
        for (const [index, row] of actual.rows.entries()) {
          const frozen = JSON.parse(row.frozen_payload_json)
          assertFrozen(frozen, plan.items[index], reference)
          assertConfiguration(actual.configs[index], plan.items[index], reference)
          const effective = refs(plan.items[index], reference)
          assert.deepEqual(actual.configs[index].positivePrompt.embeddingRefs, effective.positive)
          assert.deepEqual(actual.configs[index].negativePrompt.embeddingRefs, effective.negative)
          assert.equal(frozen.context.embeddingRefs.positive.length, 1)
          assert.equal(frozen.context.embeddingRefs.negative.length, 1)
          assert.equal(Object.hasOwn(frozen.workerJob, 'embeddings'), index > 0)
        }
      const fixture = envelope('prefix', objective, mode)
      const retained = retainedBaseline(full, fullPlan)
      assertBaseline({ baseline: retained, fixture, plan: prefixPlan, reference })
      for (const [index, row] of selected.rows.entries()) {
        const frozen = JSON.parse(row.frozen_payload_json)
        const baseline = JSON.parse(full.rows[index].frozen_payload_json)
        assert.deepEqual(normalize(frozen), normalize(baseline))
        for (const [label, mutate] of [
          [
            'lostauthoredpositiveref',
            (v) => {
              v.context.embeddingRefs.positive = []
            },
          ],
          [
            'staletarget',
            (v) => {
              v.context.target.sha256 = '9'.repeat(64)
            },
          ],
          [
            'wrongseed',
            (v) => {
              v.workerJob.sampling.seed = 1
            },
          ],
          [
            'wrongweight',
            (v) => {
              v.workerJob.loras[0].weight = 0.5
            },
          ],
          [
            'wrongpolicy',
            (v) => {
              v.context.sampling.requestedSeedPolicy = 'reuse'
            },
          ],
          [
            'wrongnoise',
            (v) => {
              v.context.sampling.noiseProfile.timestepSpacing = 'trailing'
            },
          ],
          [
            'wrongprompt',
            (v) => {
              v.workerJob.prompts.negative = 'low quality'
            },
          ],
        ]) {
          const wrong = structuredClone(frozen)
          mutate(wrong)
          if (label === 'wrongprompt' && index === 0) continue
          assert.throws(
            () => assertFrozen(wrong, prefixPlan.items[index], reference),
            undefined,
            label,
          )
          assert.notDeepEqual(normalize(wrong), normalize(baseline), label)
        }
      }
      for (const [index, row] of full.rows.entries()) {
        const frozen = JSON.parse(row.frozen_payload_json),
          item = fullPlan.items[index]
        for (const mutate of [
          (v) => {
            v.context.embeddingRefs.negative = []
          },
          (v) => {
            v.context.embeddings.positive = [
              { ...v.context.embeddings.negative[0], token: '<unplanned>' },
            ]
          },
          (v) => {
            v.context.prompts.positive += ', unplanned'
          },
          (v) => {
            v.context.sampling.seedBehavior = 'per-prompt'
          },
        ]) {
          const wrong = structuredClone(frozen)
          mutate(wrong)
          assert.throws(() => assertFrozen(wrong, item, reference))
        }
        const unexpected = { ...item, iteration: 1 }
        assert.throws(() => assertFrozen(frozen, unexpected, reference), /tuple membership/)
        const wrongConfig = structuredClone(full.configs[index])
        wrongConfig.positivePrompt.embeddingRefs = index < 2 ? [reference.embeddingTrained] : []
        assert.throws(() => assertConfiguration(wrongConfig, item, reference))
        const wire = structuredClone(frozen)
        if (index === 0) wire.workerJob.embeddings = { positive: [], negative: [] }
        else delete wire.workerJob.embeddings
        assert.throws(() => assertFrozen(wire, item, reference))
        if (index > 0) {
          const swapped = structuredClone(frozen)
          if (index === 3) swapped.workerJob.embeddings.negative[0].sha256 = '9'.repeat(64)
          else
            [swapped.workerJob.embeddings.positive, swapped.workerJob.embeddings.negative] = [
              swapped.workerJob.embeddings.negative,
              swapped.workerJob.embeddings.positive,
            ]
          assert.throws(() => assertFrozen(swapped, item, reference))
        }
      }
      for (const [label, mutate] of [
        [
          'wrongprefixstage',
          (v) => {
            v.stage = 'prefix'
          },
        ],
        [
          'wrongobjective',
          (v) => {
            v.objective = objective === 'epsilon' ? 'v_prediction' : 'epsilon'
          },
        ],
        [
          'lostresult',
          (v) => {
            v.generations.pop()
          },
        ],
        [
          'wrongsourcecount',
          (v) => {
            v.savedPackage.sourceLayers = 0
          },
        ],
        [
          'wrongsavedcursor',
          (v) => {
            v.savedPackage.lastActualSeedSnapshot = 37
          },
        ],
        [
          'unacceptedresult',
          (v) => {
            v.generations[0].accepted = false
          },
        ],
        [
          'mutatingcomparison',
          (v) => {
            v.comparisons[0].readOnly = false
          },
        ],
        [
          'liveproducer',
          (v) => {
            v.nativePhysicalExit.confirmed = false
          },
        ],
        [
          'wrongactualprovenance',
          (v) => {
            v.generations[1].provenance.generationConfiguration.negativePrompt.embeddingRefs = []
          },
        ],
      ]) {
        const wrong = structuredClone(retained)
        mutate(wrong)
        assert.throws(
          () => assertBaseline({ baseline: wrong, fixture, plan: prefixPlan, reference }),
          undefined,
          label,
        )
      }
      const pixels = pixelGenerations(full, fullPlan)
      const evidence = assertPixels(pixels, fullPlan)
      assert.equal(evidence.negativeAlternatives.length, 2)
      assert.equal(evidence.positiveAlternatives.length, 2)
      assert.equal(evidence.combinedAlternatives.length, 2)
      assert.equal(evidence.causalTensorDirectionClaim, false)
      assert.equal(
        assertPixels(pixelGenerations(selected, prefixPlan), prefixPlan).negativeAlternatives
          .length,
        1,
      )
      for (const mutate of [
        (v) => {
          v[1].rgba = Buffer.from(v[0].rgba)
        },
        (v) => {
          v[1].rgba[3] = v[0].rgba[3] === 0 ? 1 : 0
        },
        (v) => {
          v[1].frozen.context.target.sha256 = '9'.repeat(64)
        },
        (v) => {
          v.reverse()
        },
      ]) {
        const wrong = structuredClone(pixels)
        mutate(wrong)
        assert.throws(() => assertPixels(wrong, fullPlan))
      }
    })
