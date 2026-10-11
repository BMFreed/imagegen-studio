/** Actual DI hooks with declared filesystem/report/UI doubles; Main payloads come from production. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generationSeedBoundaryProfile as seeds } from './generation-seed-boundary-profile.mjs'
import { illustriousDynamicImageProfile as image } from './illustrious-dynamic-image-profile.mjs'
import {
  illustriousImageSeedWrapProfile as profile,
  prepareIllustriousImageSeedWrapControls as prepare,
  readIllustriousImageSeedWrapControl as readControl,
} from './illustrious-image-seed-wrap-profile.mjs'
import { literalIllustriousImageSeedWrapPlan as literal } from './illustrious-image-seed-wrap-qualification.mjs'
import {
  authored,
  digest,
  envelope,
  installedFixture,
  observedGenerations,
  produced,
  retainedControl,
} from './illustrious-image-seed-wrap-test-fixtures.mjs'

test('wrap adapter retains the actual image/native/durable hooks and canonical source pins', () => {
  for (const name of [
    'prepareInput',
    'assertTarget',
    'assertOutput',
    'extraInputFiles',
    'authorComponents',
    'afterAcceptance',
    'assertSaved',
  ])
    assert.equal(profile[name], image[name])
  for (const name of [
    'authorSeed',
    'beforeAdmission',
    'afterAdmission',
    'restoreAdmissionObservation',
  ])
    assert.equal(profile[name], seeds[name])
  assert.deepEqual(profile.baselineSourceChanges(), [])
  assert.deepEqual(profile.baselineMetadataDifferences(), [])
  const reference = installedFixture()
  for (const objective of ['epsilon', 'v_prediction'])
    for (const mode of ['img2img', 'outpaint'])
      for (const stage of ['control-max', 'control-zero', 'wrap']) {
        const fixture = envelope(stage, objective, mode)
        const plan = profile.validateFixture(fixture)
        const draft = authored(reference, stage, objective, mode)
        profile.assertAuthored(draft, reference, fixture, plan)
        assert.equal(profile.sampling(fixture).code, objective === 'epsilon' ? 'Euler a' : 'Euler')
        assert.equal(profile.provisionalOnly(fixture), false)
        for (const mutate of [
          (v) => {
            v.seed.value = 37
          },
          (v) => {
            v.seed.policy = 'random'
          },
          (v) => {
            v.dynamicPrompt.maxPrompts = 4
          },
          (v) => {
            v.dynamicPrompt.seedBehavior = 'per-iteration'
          },
          (v) => {
            v.positivePrompt.text = 'changed prompt'
          },
          (v) => {
            v.loras[0].weight = 0.5
          },
          (v) => {
            v.vaePrecision = 'FP16'
          },
        ]) {
          const changed = structuredClone(draft)
          mutate(changed)
          assert.throws(() => profile.assertAuthored(changed, reference, fixture, plan))
        }
      }
})

test('numeric0 extra control read binds exact SHA and refuses symlink/empty/substituted reports', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'igs-wrap-control-read-'))
  try {
    const reportPath = path.join(temporary, 'report.json')
    const bytes = Buffer.from('{"standaloneNumericSeed":0}\n')
    await writeFile(reportPath, bytes, { flag: 'wx' })
    assert.deepEqual(await readControl({ reportPath, reportSha256: digest(bytes) }), {
      standaloneNumericSeed: 0,
    })
    await assert.rejects(
      () => readControl({ reportPath, reportSha256: 'a'.repeat(64) }),
      /report SHA/,
    )
    const link = path.join(temporary, 'alias.json')
    await symlink(reportPath, link)
    await assert.rejects(() => readControl({ reportPath: link, reportSha256: digest(bytes) }))
    const empty = path.join(temporary, 'empty.json')
    await writeFile(empty, '')
    await assert.rejects(() =>
      readControl({ reportPath: empty, reportSha256: digest(Buffer.alloc(0)) }),
    )
    await writeFile(reportPath, '{"standaloneNumericSeed":1}\n')
    await assert.rejects(
      () => readControl({ reportPath, reportSha256: digest(bytes) }),
      /report SHA/,
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('the real postcompletion hook validates both standalone numeric matches before Add and binds each owning report', async () => {
  const objective = 'epsilon',
    mode = 'outpaint'
  const reference = installedFixture()
  const fixture = envelope('wrap', objective, mode)
  const plan = literal('wrap', objective, mode)
  const maxPlan = literal('control-max', objective, mode)
  const zeroPlan = literal('control-zero', objective, mode)
  const max = retainedControl(await produced(reference, 'control-max', objective, mode), maxPlan)
  const zero = retainedControl(await produced(reference, 'control-zero', objective, mode), zeroPlan)
  const wrapped = await produced(reference, 'wrap', objective, mode)
  const generations = observedGenerations(wrapped, plan)
  const temporary = await mkdtemp(path.join(tmpdir(), 'igs-wrap-completion-'))
  try {
    for (const [index, generation] of generations.entries()) {
      generation.outputPath = path.join(temporary, `${index}.png`)
      const bytes = Buffer.from(`declared-output-file-double-${index}`)
      await writeFile(generation.outputPath, bytes, { flag: 'wx' })
      generation.receipt = { image_sha256: digest(bytes) }
    }
    const report = { generations }
    await assert.rejects(
      () => profile.afterCompletions({ report, fixture, plan }),
      /Both validated/,
    )
    prepare({ baseline: max, zeroReport: zero, fixture, plan, reference })
    assert.equal(profile.shouldCompareBaseline({ expectedItem: plan.items[0] }), true)
    assert.equal(profile.shouldCompareBaseline({ expectedItem: plan.items[1] }), false)
    const result = await profile.afterCompletions({ report, fixture, plan })
    assert.equal(result.wholeRgbaMatches, 2)
    assert.equal(generations[0].baseline.reportPath, fixture.baseline.reportPath)
    assert.equal(generations[1].baseline.reportPath, fixture.zeroControl.reportPath)
    assert.ok(result.standaloneNumericControls.every(({ control }) => control.beforeExplicitAdd))
    for (const generation of generations) generation.accepted = true
    report.afterCompletions = result
    const claims = profile.summaryClaims({ fixture, plan, report })
    assert.equal(claims.uint32WrapClaim, true)
    for (const key of [
      'max32InferenceClaim',
      'crossPairOffsetClaim',
      'fullMvpClaim',
      'randomClaim',
      'imageReuseClaim',
    ])
      assert.equal(claims[key], false)
    const wrongReport = structuredClone(report)
    wrongReport.generations[1].baseline = wrongReport.generations[0].baseline
    assert.throws(
      () => profile.summaryClaims({ fixture, plan, report: wrongReport }),
      /own numeric-control binding/,
    )
    for (const generation of generations) generation.accepted = false
    const wrongPixels = structuredClone(report)
    wrongPixels.generations[1].dimensions.pixelSha256 = '9'.repeat(64)
    await assert.rejects(
      () => profile.afterCompletions({ report: wrongPixels, fixture, plan }),
      /Wrapped image pixels/,
    )
    await writeFile(generations[1].outputPath, 'substituted output bytes')
    await assert.rejects(() => profile.afterCompletions({ report, fixture, plan }))
    assert.notEqual(
      digest(await readFile(generations[1].outputPath)),
      generations[1].receipt.image_sha256,
    )
    for (const mutate of [
      (v) => {
        v.sourceSha256['declared-source-double.mjs'] = '9'.repeat(64)
      },
      (v) => {
        v.runtimeId = 'another-runtime'
      },
      (v) => {
        v.generations[0].provenance.generationConfiguration.vaePrecision = 'FP16'
      },
      (v) => {
        v.generations[0].frozen.workerJob.sampling.seed = 1
      },
    ]) {
      const wrong = structuredClone(zero)
      mutate(wrong)
      assert.throws(() => prepare({ baseline: max, zeroReport: wrong, fixture, plan, reference }))
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
