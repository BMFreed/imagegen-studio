/**
 * Actual Main image admission/configuration plus independent finite assertions.
 * Report/pixel/lifecycle wrappers are declared doubles; no installed UI/ML claim.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertAnimaImageBatchCapBaseline as assertBaseline,
  assertAnimaImageBatchCapConfiguration as assertConfiguration,
  assertAnimaImageBatchCapFrozen as assertFrozen,
  literalAnimaImageBatchCapNativePlan as nativePlan,
  literalAnimaImageBatchCapPlan as literal,
  normalizeAnimaImageBatchCapExecutionInputs as execution,
  normalizeAnimaImageBatchCapNativeInputs as native,
  resolveAnimaImageBatchCapPlan as resolve,
  validateAnimaImageBatchCapFixture as validate,
} from './anima-image-batch-cap-qualification.mjs'
import {
  envelope,
  installedFixture,
  produced,
  retainedBoundary,
} from './anima-image-batch-cap-test-fixtures.mjs'

test('four finite Anima image scopes define76jobs/fourpackages with exact32 and six selected-prefix tuples', () => {
  let jobs = 0,
    packages = 0
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['boundary', 'prefix']) {
      const plan = validate(envelope(stage, mode))
      assert.equal(plan.maxJobs, 32)
      assert.equal(plan.truncated, stage === 'prefix')
      assert.equal(plan.expectedCanceled, 0)
      assert.deepEqual(
        plan.items.map(({ seed }) => seed),
        stage === 'boundary'
          ? [
              0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4,
              5, 6, 7,
            ]
          : [0, 1, 2, 3, 4, 5],
      )
      assert.deepEqual(
        plan.boundaryBaselineIndices,
        stage === 'boundary' ? null : [0, 1, 10, 11, 20, 21],
      )
      assert.deepEqual(
        plan.items.map(({ promptPairIndex, iteration }) => [promptPairIndex, iteration]),
        stage === 'boundary'
          ? Array.from({ length: 4 }, (_, pair) =>
              Array.from({ length: 8 }, (_, iteration) => [pair, iteration]),
            ).flat()
          : [
              [0, 0],
              [0, 1],
              [1, 0],
              [1, 1],
              [2, 0],
              [2, 1],
            ],
      )
      assert.ok(Object.isFrozen(plan.items[0].compiledPrompts.positive.spans))
      jobs += plan.expectedAdmissions
      packages++
    }
  assert.equal(jobs, 76)
  assert.equal(packages, 4)
  for (const [label, mutate] of [
    [
      'unsupportedTXT',
      (v) => {
        v.mode = 'txt2img'
      },
    ],
    [
      'undeclaredobjective',
      (v) => {
        v.objective = 'epsilon'
      },
    ],
    [
      'undeclaredrandom',
      (v) => {
        v.seedBehavior = 'random'
      },
    ],
    [
      'missingbaseline',
      (v) => {
        delete v.baseline
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
        v.sourceImage.path = '/tmp/not-owned.png'
      },
    ],
  ]) {
    const invalid = envelope('prefix')
    mutate(invalid)
    assert.throws(() => validate(invalid), undefined, label)
  }
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7].map((seed) => {
      const plan = nativePlan(seed)
      return [plan.seed, plan.stepSeed, plan.posteriorSeed]
    }),
    [
      [0, 0, 2654435769],
      [1, 1, 2654435768],
      [2, 2, 2654435771],
      [3, 3, 2654435770],
      [4, 4, 2654435773],
      [5, 5, 2654435772],
      [6, 6, 2654435775],
      [7, 7, 2654435774],
    ],
  )
  for (const seed of [-1, 8, 4294967295, 0.5, '0']) assert.throws(() => nativePlan(seed))
})

for (const mode of ['img2img', 'outpaint'])
  test(`Anima/${mode}: actual Main32 and sixprefix preserve raw/compiled inputs and immutable seed domains`, async () => {
    const reference = installedFixture()
    const boundaryPlan = literal('boundary', mode),
      prefixPlan = literal('prefix', mode)
    const boundary = await produced(reference, 'boundary', mode)
    const prefix = await produced(reference, 'prefix', mode)
    resolve(boundaryPlan, boundary.rows)
    resolve(prefixPlan, prefix.rows)
    for (const [actual, plan] of [
      [boundary, boundaryPlan],
      [prefix, prefixPlan],
    ])
      for (const [index, row] of actual.rows.entries()) {
        const frozen = JSON.parse(row.frozen_payload_json)
        assertFrozen(frozen, plan.items[index], reference)
        assertConfiguration(actual.configs[index], plan.items[index], reference)
      }
    const retained = retainedBoundary(boundary, boundaryPlan),
      fixture = envelope('prefix', mode)
    assertBaseline({ baseline: retained, fixture, plan: prefixPlan, reference })
    const controls = [0, 1, 10, 11, 20, 21]
    for (const [index, row] of prefix.rows.entries()) {
      const frozen = JSON.parse(row.frozen_payload_json)
      const baseline = JSON.parse(boundary.rows[controls[index]].frozen_payload_json)
      assert.deepEqual(execution(frozen, prefixPlan), execution(baseline, prefixPlan))
      assert.notDeepEqual(native(frozen), native(baseline))
      const own = structuredClone(frozen)
      own.originRequestId = 'another-own-request'
      own.context.documentId = 'another-own-document'
      own.context.documentRevision = 'another-own-revision'
      assert.deepEqual(native(own), native(frozen))
      for (const [label, mutate] of [
        [
          'wrongactualseed',
          (v) => {
            v.context.sampling.seed = 7
          },
        ],
        [
          'wrongworkerseed',
          (v) => {
            v.workerJob.sampling.seed = 7
          },
        ],
        [
          'wrongstepseed',
          (v) => {
            v.workerJob.sampling.stepSeed = 7
          },
        ],
        [
          'wrongposteriordomain',
          (v) => {
            v.workerJob.sampling.posteriorSeed = 0
          },
        ],
        [
          'lostnegativeweight',
          (v) => {
            v.workerJob.prompts.negative.spans[0].weight = 1
          },
        ],
        [
          'wrongcleanedpositive',
          (v) => {
            v.workerJob.prompts.positive.cleanedText = 'substituted positive'
          },
        ],
        [
          'wrongrawnegative',
          (v) => {
            v.context.prompts.negative = 'substituted negative'
          },
        ],
        [
          'wrongtarget',
          (v) => {
            v.workerJob.target.sha256 = '9'.repeat(64)
          },
        ],
        [
          'wrongLoRAweight',
          (v) => {
            v.workerJob.loras[0].weight = 0.5
          },
        ],
        [
          'wrongQwen',
          (v) => {
            v.workerJob.model.qwen3Encoder.sha256 = '9'.repeat(64)
          },
        ],
        [
          'wrongVAE',
          (v) => {
            v.workerJob.model.vae.sha256 = '9'.repeat(64)
          },
        ],
        [
          'wrongouterversion',
          (v) => {
            v.schemaVersion = 2
          },
        ],
        [
          'unexpectedouterfield',
          (v) => {
            v.unexpectedOuter = { value: 'kept-by-full-normalizer' }
          },
        ],
      ]) {
        const wrong = structuredClone(frozen)
        mutate(wrong)
        assert.notDeepEqual(wrong, frozen, label + ' must change real input')
        assert.throws(
          () => assertFrozen(wrong, prefixPlan.items[index], reference),
          undefined,
          label,
        )
        assert.notDeepEqual(execution(wrong, prefixPlan), execution(baseline, prefixPlan), label)
      }
      const wrongTuple = { ...prefixPlan.items[index], iteration: 7 }
      assert.throws(() => assertFrozen(frozen, wrongTuple, reference), /tuple membership/)
      for (const [label, mutate] of [
        [
          'wrongportableactualseed',
          (v) => {
            v.sampling.actualSeed = 7
          },
        ],
        [
          'lostportableweight',
          (v) => {
            v.negativePrompt.text = 'blurry, low quality'
          },
        ],
        [
          'wrongportableQwen',
          (v) => {
            v.anima.qwen3Encoder.sha256 = '9'.repeat(64)
          },
        ],
        [
          'wrongportableVAE',
          (v) => {
            v.anima.vae.sha256 = '9'.repeat(64)
          },
        ],
        [
          'compiledportableleak',
          (v) => {
            v.compiledPrompts = frozen.workerJob.prompts
          },
        ],
      ]) {
        const config = structuredClone(prefix.configs[index])
        mutate(config)
        assert.throws(
          () => assertConfiguration(config, prefixPlan.items[index], reference),
          undefined,
          label,
        )
      }
    }
    for (const [label, mutate] of [
      [
        'lost32temporarycandidate',
        (v) => {
          v.refusal33.after.projectCandidateCount = 31
        },
      ],
      [
        'lostimportedsource',
        (v) => {
          v.refusal33.after.layerCount = 0
        },
      ],
      [
        'wrongrefusal',
        (v) => {
          v.refusal33.ui.mainStateObservation.value.error.code = 'RUNTIME_NOT_READY'
        },
      ],
      [
        'wrongSavecursor',
        (v) => {
          v.savedPackage.lastActualSeedSnapshot = 0
        },
      ],
      [
        'unacceptedresult',
        (v) => {
          v.generations[31].accepted = false
        },
      ],
      [
        'mutatingcomparison',
        (v) => {
          v.comparisons[31].readOnly = false
        },
      ],
      [
        'wrongportableVAE',
        (v) => {
          v.generations[31].provenance.generationConfiguration.anima.vae.sha256 = '9'.repeat(64)
        },
      ],
      [
        'lostcompilednegativeweight',
        (v) => {
          v.generations[31].frozen.workerJob.prompts.negative.spans[0].weight = 1
        },
      ],
      [
        'lostbeforeAddqualification',
        (v) => {
          v.generations[31].qualification.beforeExplicitAdd = false
        },
      ],
    ]) {
      const wrong = structuredClone(retained)
      mutate(wrong)
      assert.notDeepEqual(wrong, retained, label + ' must change retained evidence')
      assert.throws(
        () => assertBaseline({ baseline: wrong, fixture, plan: prefixPlan, reference }),
        undefined,
        label,
      )
    }
    for (const rows of [boundary.rows.slice(1), [...boundary.rows, boundary.rows[0]]])
      assert.throws(() => resolve(boundaryPlan, rows))
  })
