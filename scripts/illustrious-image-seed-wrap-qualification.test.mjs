/**
 * Real Main preparation/admission/provenance; retained pixels/report lifecycle are explicit
 * doubles.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertIllustriousImageSeedWrapConfiguration as configuration,
  assertIllustriousImageSeedWrapControl as control,
  assertIllustriousImageSeedWrapControlBindings as bindings,
  assertIllustriousImageSeedWrapFrozen as frozen,
  assertIllustriousImageSeedWrapMatches as matches,
  literalIllustriousImageSeedWrapPlan as literal,
  normalizeIllustriousImageSeedWrapInputs as normalize,
  resolveIllustriousImageSeedWrapPlan as resolve,
  validateIllustriousImageSeedWrapFixture as validate,
} from './illustrious-image-seed-wrap-qualification.mjs'
import {
  envelope,
  installedFixture,
  observedGenerations,
  produced,
  retainedControl,
} from './illustrious-image-seed-wrap-test-fixtures.mjs'

test('strict finite scope is12projects/16jobs with independent MAX/zero schedules', () => {
  let jobs = 0,
    packages = 0
  for (const objective of ['epsilon', 'v_prediction'])
    for (const mode of ['img2img', 'outpaint'])
      for (const stage of ['control-max', 'control-zero', 'wrap']) {
        const plan = validate(envelope(stage, objective, mode))
        assert.deepEqual(
          plan.items.map(({ seed }) => seed),
          stage === 'wrap' ? [4294967295, 0] : stage === 'control-max' ? [4294967295] : [0],
        )
        assert.deepEqual(
          plan.items.map(({ promptPairIndex, iteration }) => [promptPairIndex, iteration]),
          stage === 'wrap'
            ? [
                [0, 0],
                [0, 1],
              ]
            : [[0, 0]],
        )
        assert.equal(plan.maxPrompts, 1)
        assert.equal(plan.seedBehavior, 'per-prompt')
        assert.equal(plan.requestedSeedPolicy, 'fixed')
        assert.equal(plan.expectedCanceled, 0)
        assert.ok(Object.isFrozen(plan.items[0]))
        jobs += plan.expectedAdmissions
        packages++
      }
  assert.equal(jobs, 16)
  assert.equal(packages, 12)
  for (const mutate of [
    (v) => {
      v.stage = 'random'
    },
    (v) => {
      v.objective = 'anima'
    },
    (v) => {
      v.mode = 'txt2img'
    },
    (v) => {
      v.replaySeed = 0
    },
    (v) => {
      delete v.zeroControl
    },
    (v) => {
      v.zeroControl = v.baseline
    },
    (v) => {
      v.zeroControl.reportPath = `${v.artifacts}/report.json`
    },
    (v) => {
      v.zeroControl.reportSha256 = 'unknown'
    },
    (v) => {
      v.sourceImage.path = '/tmp/unowned.png'
    },
  ]) {
    const invalid = envelope()
    mutate(invalid)
    assert.throws(() => validate(invalid))
  }
})

for (const objective of ['epsilon', 'v_prediction'])
  for (const mode of ['img2img', 'outpaint'])
    test(`${objective}/${mode}: actual Main MAX→zero queues and configs obey literal plans`, async () => {
      const reference = installedFixture()
      const fixture = envelope('wrap', objective, mode)
      const retained = []
      let wrap
      for (const stage of ['control-max', 'control-zero', 'wrap']) {
        const plan = literal(stage, objective, mode)
        const actual = await produced(reference, stage, objective, mode)
        assert.deepEqual(resolve(plan, actual.rows), plan)
        for (const [index, row] of actual.rows.entries()) {
          frozen(JSON.parse(row.frozen_payload_json), plan.items[index], reference)
          configuration(actual.configs[index], plan.items[index], reference)
          const wrong = structuredClone(actual.configs[index])
          wrong.sampling.actualSeed = plan.items[index].seed === 0 ? 4294967295 : 0
          assert.throws(() => configuration(wrong, plan.items[index], reference))
        }
        if (stage === 'wrap') wrap = { actual, plan }
        else {
          const report = retainedControl(actual, plan)
          control(report, fixture, stage, reference)
          retained.push(report)
        }
      }
      bindings(retained[0], retained[1])
      const controls = retained.map((report, index) => ({
        descriptor: index === 0 ? fixture.baseline : fixture.zeroControl,
        generation: report.generations[0],
      }))
      const generations = observedGenerations(wrap.actual, wrap.plan)
      const matched = matches(generations, wrap.plan, controls)
      assert.equal(matched.length, 2)
      assert.equal(matched[0].queueItemId, wrap.actual.rows[0].id)
      assert.equal(matched[1].control.reportPath, fixture.zeroControl.reportPath)
      assert.equal(generations[1].baseline.queueItemId, retained[1].generations[0].queueItemId)
      for (const [label, mutate] of [
        [
          'substituted zero pixels',
          (v) => {
            v[1].dimensions.pixelSha256 = '9'.repeat(64)
          },
        ],
        [
          'substituted frozen context seed',
          (v) => {
            v[1].frozen.context.sampling.seed = 4294967295
          },
        ],
        [
          'substituted worker seed',
          (v) => {
            v[1].frozen.workerJob.sampling.seed = 4294967295
          },
        ],
        [
          'substituted negative prompt',
          (v) => {
            v[1].frozen.context.prompts.negative = 'changed prompt'
          },
        ],
        [
          'substituted worker target',
          (v) => {
            v[1].frozen.workerJob.target.sha256 = '9'.repeat(64)
          },
        ],
        [
          'premature accepted result',
          (v) => {
            v[1].accepted = true
          },
        ],
        [
          'MAX control substituted for zero control',
          (v) => {
            v[1].baseline = v[0].baseline
          },
        ],
      ]) {
        // Mutate an already matched observation so both control bindings exist.
        const wrong = structuredClone(generations)
        mutate(wrong)
        assert.notDeepEqual(wrong, generations, `${label}: mutation must change the observation.`)
        assert.throws(() => matches(wrong, wrap.plan, controls), undefined, label)
      }
      for (const [label, mutate] of [
        [
          'substituted control stage',
          (v) => {
            v.stage = 'control-max'
          },
        ],
        [
          'substituted saved zero cursor',
          (v) => {
            v.savedPackage.lastActualSeedSnapshot = 4294967295
          },
        ],
        [
          'substituted control worker seed',
          (v) => {
            v.generations[0].frozen.workerJob.sampling.seed = 1
          },
        ],
        [
          'substituted control portable actual seed',
          (v) => {
            v.generations[0].provenance.generationConfiguration.sampling.actualSeed = 1
          },
        ],
        [
          'unaccepted numeric control',
          (v) => {
            v.generations[0].accepted = false
          },
        ],
        [
          'mutating control comparison',
          (v) => {
            v.comparisons[0].readOnly = false
          },
        ],
      ]) {
        const wrong = structuredClone(retained[1])
        mutate(wrong)
        assert.notDeepEqual(wrong, retained[1], `${label}: mutation must change the observation.`)
        assert.throws(() => control(wrong, fixture, 'control-zero', reference), undefined, label)
      }
      const missingKey = structuredClone(retained[1])
      delete missingKey.sourceSha256['declared-source-double.mjs']
      assert.throws(() => bindings(retained[0], missingKey))
      const newBundle = structuredClone(retained[1])
      newBundle.bundleSha256['declared-bundle-double.cjs'] = '9'.repeat(64)
      assert.throws(() => bindings(retained[0], newBundle))
      const changed = structuredClone(generations[1].frozen)
      changed.context.sampling.seedBehavior = 'per-iteration'
      assert.notDeepEqual(normalize(changed), normalize(generations[1].frozen))
    })
