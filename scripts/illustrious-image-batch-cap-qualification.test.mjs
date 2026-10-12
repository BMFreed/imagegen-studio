/**
 * Actual Main image admission/configuration and independent finite oracle; no installed UI/ML
 * claim.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertIllustriousImageBatchCapBaseline as assertBaseline,
  assertIllustriousImageBatchCapConfiguration as assertConfiguration,
  assertIllustriousImageBatchCapFrozen as assertFrozen,
  literalIllustriousImageBatchCapPlan as literal,
  normalizeIllustriousImageBatchCapExecutionInputs as execution,
  normalizeIllustriousImageBatchCapNativeInputs as native,
  resolveIllustriousImageBatchCapPlan as resolve,
  validateIllustriousImageBatchCapFixture as validate,
} from './illustrious-image-batch-cap-qualification.mjs'
import {
  envelope,
  installedFixture,
  produced,
  retainedBoundary,
} from './illustrious-image-batch-cap-test-fixtures.mjs'

test('eight finite scopes define152jobs/eightpackages with exact cap32 and six selected-prefix tuples', () => {
  let jobs = 0,
    packages = 0
  for (const objective of ['epsilon', 'v_prediction'])
    for (const mode of ['img2img', 'outpaint'])
      for (const stage of ['boundary', 'prefix']) {
        const plan = validate(envelope(stage, objective, mode))
        assert.equal(plan.maxJobs, 32)
        assert.equal(plan.truncated, stage === 'prefix')
        assert.equal(plan.expectedCanceled, 0)
        assert.deepEqual(
          plan.items.map(({ seed }) => seed),
          stage === 'boundary'
            ? [
                0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3,
                4, 5, 6, 7,
              ]
            : [0, 1, 2, 3, 4, 5],
        )
        assert.deepEqual(
          plan.boundaryBaselineIndices,
          stage === 'boundary' ? null : [0, 1, 10, 11, 20, 21],
        )
        assert.ok(Object.isFrozen(plan.items[0].prompts))
        jobs += plan.expectedAdmissions
        packages++
      }
  assert.equal(jobs, 152)
  assert.equal(packages, 8)
  for (const [label, mutate] of [
    [
      'unqualifiedAnima',
      (v) => {
        v.objective = 'anima'
      },
    ],
    [
      'unqualifiedTXT',
      (v) => {
        v.mode = 'txt2img'
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
        v.baseline.reportPath = `${v.artifacts}/report.json`
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
})

for (const objective of ['epsilon', 'v_prediction'])
  for (const mode of ['img2img', 'outpaint'])
    test(`${objective}/${mode}: actual Main32 and sixprefix preserve all image inputs and immutable actual seeds`, async () => {
      const reference = installedFixture()
      const boundaryPlan = literal('boundary', objective, mode)
      const prefixPlan = literal('prefix', objective, mode)
      const boundary = await produced(reference, 'boundary', objective, mode)
      const prefix = await produced(reference, 'prefix', objective, mode)
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
      const retained = retainedBoundary(boundary, boundaryPlan)
      const fixture = envelope('prefix', objective, mode)
      assertBaseline({ baseline: retained, fixture, plan: prefixPlan, reference })
      const controls = [0, 1, 10, 11, 20, 21]
      for (const [index, row] of prefix.rows.entries()) {
        const frozen = JSON.parse(row.frozen_payload_json)
        const baseline = JSON.parse(boundary.rows[controls[index]].frozen_payload_json)
        assert.deepEqual(execution(frozen, prefixPlan), execution(baseline, prefixPlan))
        assert.notDeepEqual(native(frozen), native(baseline))
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
            'wrongprompt',
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
        const config = structuredClone(prefix.configs[index])
        config.sampling.actualSeed = 7
        assert.throws(() => assertConfiguration(config, prefixPlan.items[index], reference))
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
            v.generations[31].provenance.generationConfiguration.vaePrecision = 'FP16'
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
    })
