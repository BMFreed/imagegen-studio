/**
 * Actual adapter hooks and Main-produced DTOs; filesystem/report/DOM/pixel values are declared
 * peers.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { animaDynamicImageProfile as image } from './anima-dynamic-image-profile.mjs'
import { generationSeedBoundaryProfile as seeds } from './generation-seed-boundary-profile.mjs'
import { authoring, installedFixture, produced } from './anima-image-seed-wrap-main-fixtures.mjs'
import { envelope as imageEnvelope } from './anima-dynamic-image-test-fixtures.mjs'
import { comparisonInput } from './anima-image-seed-replay-test-fixtures.mjs'
import {
  animaImageSeedWrapProfile as profile,
  prepareAnimaImageSeedWrapControls as prepare,
  readAnimaImageSeedWrapControl as readControl,
} from './anima-image-seed-wrap-profile.mjs'
import {
  literalAnimaImageSeedWrapPlan as literal,
  normalizeAnimaImageSeedWrapInputs as normalize,
} from './anima-image-seed-wrap-qualification.mjs'
import {
  createInstalledDynamicBatchDeadlineBounds,
  invokeComparisonAdapter,
} from './installed-dynamic-batch-driver.mjs'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
function envelope(stage, mode = 'img2img') {
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
    dimensions: { pixelSha256: digest(`declared-not-native-seed-${plan.items[index].seed}`) },
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

test('Anima wrap composes actual image/Save/visibility and public numeric seed hooks with complete dependencies', () => {
  for (const name of [
    'prepareInput',
    'assertTarget',
    'assertOutput',
    'extraInputFiles',
    'authorComponents',
    'afterAcceptance',
    'assertSaved',
    'modelKey',
    'loraKey',
    'originalSourceKeys',
    'operation',
  ])
    assert.equal(profile[name], image[name])
  for (const name of [
    'authorSeed',
    'beforeAdmission',
    'afterAdmission',
    'restoreAdmissionObservation',
  ])
    assert.equal(profile[name], seeds[name])
  for (const source of [
    ...image.sourceDependencies,
    image.adapterSource,
    image.oracleSource,
    ...seeds.sourceDependencies,
    seeds.adapterSource,
    seeds.oracleSource,
  ])
    assert.ok(profile.sourceDependencies.includes(source))
  assert.deepEqual(profile.baselineSourceChanges(), [])
  assert.deepEqual(profile.baselineMetadataDifferences(), [])
  assert.equal(profile.assertPreview, undefined)
  assert.equal(profile.assertQueuedNotice, undefined)
  const reference = installedFixture()
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['control-max', 'control-zero', 'wrap']) {
      const fixture = envelope(stage, mode),
        plan = literal(stage, mode),
        draft = authoring(reference, stage, mode)
      profile.assertAuthored(draft, reference, fixture, plan)
      assert.equal(profile.sampling(fixture).code, 'euler')
      assert.equal(profile.provisionalOnly(fixture), false)
      assert.equal(createInstalledDynamicBatchDeadlineBounds(profile, fixture).seconds, 1800)
      assert.equal(profile.completionTimeoutMs(fixture), 1_600_000)
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
          v.negativePrompt.embeddingRefs = [{ token: '<unsupported>' }]
        },
        (v) => {
          v.loras[0].weight = 0.5
        },
        (v) => {
          v.vae = v.model
        },
        (v) => {
          v.vaePrecision = 'FP16'
        },
        (v) => {
          v.sampling.animaMethod = 'heun'
        },
      ]) {
        const wrong = structuredClone(draft)
        mutate(wrong)
        assert.throws(() => profile.assertAuthored(wrong, reference, fixture, plan))
      }
    }
})

test('additional numeric0 reader checks actual SHA/canonical file identity and refuses symlink/empty/substituted report', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'igs-anima-wrap-control-read-'))
  try {
    const reportPath = path.join(temporary, 'report.json'),
      bytes = Buffer.from('{"declaredControlSeed":0}\n')
    await writeFile(reportPath, bytes, { flag: 'wx' })
    assert.deepEqual(await readControl({ reportPath, reportSha256: digest(bytes) }), {
      declaredControlSeed: 0,
    })
    await assert.rejects(
      () => readControl({ reportPath, reportSha256: 'a'.repeat(64) }),
      /report SHA/,
    )
    const alias = path.join(temporary, 'alias.json')
    await symlink(reportPath, alias)
    await assert.rejects(() => readControl({ reportPath: alias, reportSha256: digest(bytes) }))
    const empty = path.join(temporary, 'empty.json')
    await writeFile(empty, '')
    await assert.rejects(() =>
      readControl({ reportPath: empty, reportSha256: digest(Buffer.alloc(0)) }),
    )
    await writeFile(reportPath, '{"declaredControlSeed":1}\n')
    await assert.rejects(
      () => readControl({ reportPath, reportSha256: digest(bytes) }),
      /report SHA/,
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('real postcompletion adapter binds both standalone full inputs before Add and summary requires chronological zero/three-layer Save', async () => {
  const reference = installedFixture(),
    fixture = envelope('wrap', 'outpaint'),
    plan = literal('wrap', 'outpaint')
  const max = retained(
    await produced(reference, 'control-max', 'outpaint'),
    literal('control-max', 'outpaint'),
  )
  const zero = retained(
    await produced(reference, 'control-zero', 'outpaint'),
    literal('control-zero', 'outpaint'),
  )
  const actual = await produced(reference, 'wrap', 'outpaint'),
    observed = generations(actual, plan)
  const temporary = await mkdtemp(path.join(tmpdir(), 'igs-anima-wrap-completion-'))
  try {
    for (const [index, generation] of observed.entries()) {
      generation.outputPath = path.join(temporary, `${index}.png`)
      const bytes = Buffer.from(`declared-file-peer-${index}`)
      await writeFile(generation.outputPath, bytes, { flag: 'wx' })
      generation.receipt = { image_sha256: digest(bytes) }
    }
    const report = { generations: observed }
    await assert.rejects(
      () => profile.afterCompletions({ report, fixture, plan }),
      /Both validated/,
    )
    prepare({ baseline: max, zeroReport: zero, fixture, plan, reference })
    assert.equal(profile.shouldCompareBaseline({ expectedItem: plan.items[0] }), true)
    assert.equal(profile.shouldCompareBaseline({ expectedItem: plan.items[1] }), false)
    const result = await profile.afterCompletions({ report, fixture, plan })
    assert.equal(result.wholeRgbaMatches, 2)
    assert.equal(observed[0].baseline.reportPath, fixture.baseline.reportPath)
    assert.equal(observed[1].baseline.reportPath, fixture.zeroControl.reportPath)
    assert.ok(result.standaloneNumericControls.every(({ control }) => control.beforeExplicitAdd))
    for (const generation of observed) generation.accepted = true
    report.afterCompletions = result
    report.savedPackage = {
      acceptedLayers: 2,
      sourceLayers: 1,
      totalLayers: 3,
      reopened: true,
      lastActualSeedSnapshot: 0,
    }
    const claims = profile.summaryClaims({ fixture, plan, report })
    assert.equal(claims.uint32WrapClaim, true)
    for (const key of [
      'fullMvpClaim',
      'randomClaim',
      'imageReuseClaim',
      'scalarWeightCausalityClaim',
      'qualityClaim',
      'cap32RefusalClaim',
    ])
      assert.equal(claims[key], false)
    for (const mutate of [
      (v) => {
        v.generations[1].baseline = v.generations[0].baseline
      },
      (v) => {
        v.savedPackage.lastActualSeedSnapshot = 4294967295
      },
      (v) => {
        v.savedPackage.totalLayers = 2
      },
      (v) => {
        v.savedPackage.reopened = false
      },
      (v) => {
        v.generations[1].accepted = false
      },
      (v) => {
        v.generations[1].provenance.generationConfiguration.sampling.seedBehavior = 'per-iteration'
      },
    ]) {
      const wrong = structuredClone(report)
      mutate(wrong)
      assert.throws(() => profile.summaryClaims({ fixture, plan, report: wrong }))
    }
    for (const generation of observed) generation.accepted = false
    const wrongPixels = structuredClone(report)
    wrongPixels.generations[1].dimensions.pixelSha256 = '9'.repeat(64)
    await assert.rejects(
      () => profile.afterCompletions({ report: wrongPixels, fixture, plan }),
      /Wrapped image pixels/,
    )
    await writeFile(observed[1].outputPath, 'substituted output bytes')
    await assert.rejects(() => profile.afterCompletions({ report, fixture, plan }))
    assert.notEqual(
      digest(await readFile(observed[1].outputPath)),
      observed[1].receipt.image_sha256,
    )
    for (const mutate of [
      (v) => {
        v.sourceSha256['new-source-peer.mjs'] = '9'.repeat(64)
      },
      (v) => {
        v.bundleSha256['declared-bundle-peer.cjs'] = '9'.repeat(64)
      },
      (v) => {
        v.runtimeId = 'different-runtime'
      },
      (v) => {
        v.generations[0].frozen.workerJob.sampling.posteriorSeed = 1
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

test('every endpoint owning comparison binds concrete weighted raw prompts and late Euler→Heun/PP→PI edits', async () => {
  const reference = installedFixture()
  let comparisons = 0
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['control-max', 'control-zero', 'wrap']) {
      const fixture = envelope(stage, mode),
        draft = authoring(reference, stage, mode)
      for (const item of literal(stage, mode).items) {
        const peer = comparisonInput({ fixture, reference, draft }, item),
          { fixture: active, ...inputs } = peer.context
        const evidence = await invokeComparisonAdapter(profile, active, inputs)
        assert.deepEqual(evidence['seed.actual'].values, [String(item.seed), '37'])
        assert.equal(evidence['seed.policy'].status, 'Same')
        assert.deepEqual(evidence['seed.behavior'].values, ['per-prompt', 'per-iteration'])
        assert.equal(evidence['seed.behavior'].status, 'Changed')
        comparisons++
        const wrongItem = structuredClone(item)
        wrongItem.iteration = 7
        await assert.rejects(() =>
          invokeComparisonAdapter(profile, active, {
            ...inputs,
            generation: { expectedItem: wrongItem },
          }),
        )
        peer.rows['seed.behavior'].status = 'Same'
        await assert.rejects(() => invokeComparisonAdapter(profile, active, inputs))
      }
    }
  assert.equal(comparisons, 8)
})
