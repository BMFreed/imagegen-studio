/**
 * Real Main rows/configuration with disclosed report/hash peers; no native inference or crash
 * claim.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import path from 'node:path'
import test from 'node:test'
import { installedFixture, produced } from './anima-image-seed-wrap-main-fixtures.mjs'
import { envelope as imageEnvelope } from './anima-dynamic-image-test-fixtures.mjs'
import {
  assertAnimaImageSeedWrapConfiguration as configuration,
  assertAnimaImageSeedWrapControl as control,
  assertAnimaImageSeedWrapControlBindings as bindings,
  assertAnimaImageSeedWrapFrozen as frozen,
  assertAnimaImageSeedWrapItem as membership,
  assertAnimaImageSeedWrapMatches as matches,
  literalAnimaImageSeedWrapNativePlan as native,
  literalAnimaImageSeedWrapPlan as literal,
  normalizeAnimaImageSeedWrapInputs as normalize,
  resolveAnimaImageSeedWrapPlan as resolve,
  validateAnimaImageSeedWrapFixture as validate,
} from './anima-image-seed-wrap-qualification.mjs'

function envelope(stage, mode) {
  const common = imageEnvelope('baseline', mode),
    root = path.dirname(common.referenceFixture.path)
  return {
    ...common,
    profile: 'anima-image-seed-wrap',
    stage,
    artifacts: path.join(root, `${stage}-${mode}`),
    ...(stage === 'wrap'
      ? {
          baseline: {
            reportPath: path.join(root, `control-max-${mode}/report.json`),
            reportSha256: 'c'.repeat(64),
          },
          zeroControl: {
            reportPath: path.join(root, `control-zero-${mode}/report.json`),
            reportSha256: 'd'.repeat(64),
          },
        }
      : {}),
  }
}
function generations(actual, plan, accepted = false) {
  return actual.rows.map((row, index) => ({
    queueItemId: row.id,
    expectedItem: plan.items[index],
    frozen: JSON.parse(row.frozen_payload_json),
    row: { status: 'completed' },
    accepted,
    provenance: { generationConfiguration: actual.configs[index] },
    dimensions: {
      pixelSha256: createHash('sha256')
        .update(`declared-not-native-seed-${plan.items[index].seed}`)
        .digest('hex'),
    },
  }))
}
function retained(actual, plan) {
  const result = generations(actual, plan, true)
  for (const generation of result)
    generation.qualification = {
      beforeExplicitAdd: true,
      normalizedInputs: normalize(generation.frozen),
    }
  return {
    status: 'passed',
    profile: 'anima-image-seed-wrap',
    stage: plan.stage,
    literalPlan: plan,
    resolvedPlan: plan,
    nativePhysicalExit: { confirmed: true },
    savedPackage: {
      acceptedLayers: 1,
      sourceLayers: 1,
      totalLayers: 2,
      reopened: true,
      lastActualSeedSnapshot: plan.items[0].seed,
    },
    admissions: actual.rows.map((row) => ({ row })),
    generations: result,
    comparisons: actual.rows.map(({ id }) => ({ queueItemId: id, readOnly: true })),
    sourceSha256: { 'declared-source-peer.mjs': 'a'.repeat(64) },
    bundleSha256: { 'declared-bundle-peer.cjs': 'b'.repeat(64) },
    appData: '/declared-same-app-data',
    runtimeId: 'declared-same-runtime',
  }
}

test('finite Anima MAX→0 plan has literal1/1/2 schedules, no objective axis, and genuine unsigned posterior domains', () => {
  let jobs = 0,
    packages = 0
  for (const mode of ['img2img', 'outpaint'])
    for (const [stage, seeds, posterior] of [
      ['control-max', [4294967295], [1640531526]],
      ['control-zero', [0], [2654435769]],
      ['wrap', [4294967295, 0], [1640531526, 2654435769]],
    ]) {
      const fixture = envelope(stage, mode),
        plan = validate(fixture)
      assert.deepEqual(
        plan.items.map(({ seed }) => seed),
        seeds,
      )
      assert.deepEqual(
        plan.items.map(({ seed }) => native(seed).posteriorSeed),
        posterior,
      )
      assert.deepEqual(
        plan.items.map(({ iteration }) => iteration),
        stage === 'wrap' ? [0, 1] : [0],
      )
      assert.ok(plan.items.every(({ promptPairIndex }) => promptPairIndex === 0))
      assert.equal(plan.iterations, seeds.length)
      assert.equal(plan.maxPrompts, 1)
      assert.equal(plan.truncated, false)
      assert.equal(plan.requestedSeedPolicy, 'fixed')
      assert.equal(plan.seedBehavior, 'per-prompt')
      assert.deepEqual(plan.sourcePrompts, {
        positive: 'a (red:1.3) ceramic cup on a wooden table, studio photograph',
        negative: '(blurry:0.7), low quality',
      })
      assert.equal(Object.hasOwn(plan, 'objective'), false)
      for (const item of plan.items) membership(item)
      jobs += plan.expectedAdmissions
      packages++
      for (const mutate of [
        (v) => {
          v.objective = 'epsilon'
        },
        (v) => {
          v.artifacts = v.sourceImage.path
        },
        (v) => {
          v.mode = 'txt2img'
        },
        ...(stage === 'wrap'
          ? [
              (v) => {
                v.zeroControl = v.baseline
              },
              (v) => {
                delete v.zeroControl
              },
              (v) => {
                v.baseline.reportSha256 = 'bad'
              },
              (v) => {
                v.zeroControl.reportPath = v.artifacts
              },
              (v) => {
                v.baselineSourceSnapshots = {}
              },
            ]
          : [
              (v) => {
                v.baseline = {}
              },
            ]),
      ]) {
        const wrong = structuredClone(fixture)
        mutate(wrong)
        assert.throws(() => validate(wrong))
      }
    }
  assert.deepEqual([jobs, packages], [8, 6])
  assert.throws(() => native(1))
  assert.throws(() => literal('random', 'img2img'))
})

for (const mode of ['img2img', 'outpaint'])
  test(`${mode}: actual Main endpoint jobs retain complete raw/compiled input and portable recipe, then match both declared control reports`, async () => {
    const reference = installedFixture(),
      fixture = envelope('wrap', mode),
      controls = []
    let wrapped
    for (const stage of ['control-max', 'control-zero', 'wrap']) {
      const actual = await produced(reference, stage, mode),
        plan = literal(stage, mode)
      assert.deepEqual(resolve(plan, actual.rows), plan)
      for (const [index, row] of actual.rows.entries()) {
        const item = plan.items[index],
          value = JSON.parse(row.frozen_payload_json)
        frozen(value, item, reference)
        configuration(actual.configs[index], item, reference)
        assert.deepEqual(value.workerJob.sampling, native(item.seed))
        for (const mutate of [
          (v) => {
            v.context.sampling.seed = 37
          },
          (v) => {
            v.context.sampling.requestedSeedPolicy = 'reuse'
          },
          (v) => {
            v.context.sampling.seedBehavior = 'per-iteration'
          },
          (v) => {
            v.workerJob.sampling.seed = 37
          },
          (v) => {
            v.workerJob.sampling.stepSeed = 37
          },
          (v) => {
            v.workerJob.sampling.posteriorSeed = 37
          },
          (v) => {
            v.workerJob.sampling.scheduler = 'heun'
          },
          (v) => {
            v.workerJob.prompts.negative.spans[0].weight = 1
          },
          (v) => {
            v.workerJob.target.sha256 = '9'.repeat(64)
          },
        ]) {
          const wrong = structuredClone(value)
          mutate(wrong)
          assert.throws(() => frozen(wrong, item, reference))
        }
        const wrongItem = structuredClone(item)
        wrongItem.promptPairIndex = 1
        assert.throws(() => frozen(value, wrongItem, reference))
        const wrongConfig = structuredClone(actual.configs[index])
        wrongConfig.sampling.actualSeed = item.seed === 0 ? 4294967295 : 0
        assert.throws(() => configuration(wrongConfig, item, reference))
        const extra = { ...value, schemaVersion: 2, extraOuter: { retained: true } }
        const expected = structuredClone(extra)
        delete expected.originRequestId
        delete expected.context.documentId
        delete expected.context.documentRevision
        assert.deepEqual(normalize(extra), expected)
        assert.equal(extra.context.documentId, value.context.documentId)
        const signed = structuredClone(value)
        signed.workerJob.sampling.posteriorSeed = item.seed === 0 ? -1640531527 : -2654435770
        assert.notDeepEqual(normalize(signed), normalize(value))
      }
      if (stage === 'wrap') wrapped = { actual, plan }
      else {
        const report = retained(actual, plan)
        control(report, fixture, stage, reference)
        controls.push(report)
      }
    }
    bindings(controls[0], controls[1])
    const selected = controls.map((report, index) => ({
      descriptor: index === 0 ? fixture.baseline : fixture.zeroControl,
      generation: report.generations[0],
    }))
    const observed = generations(wrapped.actual, wrapped.plan)
    const evidence = matches(observed, wrapped.plan, selected)
    assert.equal(evidence.length, 2)
    assert.equal(observed[1].baseline.reportPath, fixture.zeroControl.reportPath)
    assert.deepEqual(
      observed.map(({ baseline }) => baseline.allowedMetadataDifferences),
      [[], []],
    )
    for (const mutate of [
      (v) => {
        v[1].dimensions.pixelSha256 = '9'.repeat(64)
      },
      (v) => {
        v[1].frozen.context.sampling.seed = 4294967295
      },
      (v) => {
        v[1].frozen.workerJob.sampling.stepSeed = 4294967295
      },
      (v) => {
        v[1].frozen.workerJob.sampling.posteriorSeed = 1640531526
      },
      (v) => {
        v[1].frozen.workerJob.target.sha256 = '9'.repeat(64)
      },
      (v) => {
        v[1].frozen.context.prompts.negative = 'changed'
      },
      (v) => {
        v[1].frozen.extraOuter = true
      },
      (v) => {
        v[1].frozen.schemaVersion = 2
      },
      (v) => {
        v[1].accepted = true
      },
      (v) => {
        v[1].baseline = v[0].baseline
      },
    ]) {
      const wrong = structuredClone(observed)
      mutate(wrong)
      assert.throws(() => matches(wrong, wrapped.plan, selected))
    }
    for (const mutate of [
      (v) => {
        v.stage = 'control-max'
      },
      (v) => {
        v.savedPackage.lastActualSeedSnapshot = 4294967295
      },
      (v) => {
        v.generations[0].frozen.workerJob.sampling.posteriorSeed = 1640531526
      },
      (v) => {
        v.generations[0].provenance.generationConfiguration.sampling.actualSeed = 1
      },
      (v) => {
        v.generations[0].accepted = false
      },
      (v) => {
        v.comparisons[0].readOnly = false
      },
    ]) {
      const wrong = structuredClone(controls[1])
      mutate(wrong)
      assert.throws(() => control(wrong, fixture, 'control-zero', reference))
    }
    for (const mutate of [
      (v) => {
        delete v.sourceSha256['declared-source-peer.mjs']
      },
      (v) => {
        v.bundleSha256['declared-bundle-peer.cjs'] = '9'.repeat(64)
      },
      (v) => {
        v.runtimeId = 'another-runtime'
      },
    ]) {
      const wrong = structuredClone(controls[1])
      mutate(wrong)
      assert.throws(() => bindings(controls[0], wrong))
    }
    const badOrder = [...wrapped.actual.rows].reverse()
    assert.throws(() => resolve(wrapped.plan, badOrder))
  })
