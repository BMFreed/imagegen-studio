/** Actual adapter/driver hooks with explicit DOM/report doubles, plus production-generated rows. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { animaDynamicImagePerPromptProfile as image } from './anima-dynamic-image-per-prompt-profile.mjs'
import { generationSeedBoundaryProfile as seeds } from './generation-seed-boundary-profile.mjs'
import { animaImageSeedReplayProfile as profile } from './anima-image-seed-replay-profile.mjs'
import {
  resolveAnimaImageSeedReplayPlan as resolve,
  literalAnimaImageSeedReplayPlan as literal,
  normalizeAnimaImageSeedReplayNativeInputs,
  normalizeAnimaImageSeedReplayReferenceInputs,
} from './anima-image-seed-replay-qualification.mjs'
import {
  createInstalledDynamicBatchDeadlineBounds,
  invokeBaselineAdapter,
  invokeComparisonAdapter,
  shouldCompareCompletionBaseline,
} from './installed-dynamic-batch-driver.mjs'
import {
  authored,
  comparisonInput,
  generations,
  produced,
  retainedBaseline,
  testBaseSeed,
} from './anima-image-seed-replay-test-fixtures.mjs'

test('Random/Fixed image profile injects unchanged entropy/image hooks and keeps all numerical inputs in own references', () => {
  for (const hook of [
    'authorSeed',
    'beforeAdmission',
    'afterAdmission',
    'restoreAdmissionObservation',
  ])
    assert.equal(profile[hook], seeds[hook])
  for (const hook of [
    'prepareInput',
    'assertTarget',
    'assertOutput',
    'afterAcceptance',
    'assertSaved',
    'sampling',
    'modelKey',
    'loraKey',
    'originalSourceKeys',
    'operation',
  ])
    assert.equal(profile[hook], image[hook])
  assert.equal(profile.normalizeNativeInputs, normalizeAnimaImageSeedReplayNativeInputs)
  assert.equal(profile.normalizeExecutionInputs, normalizeAnimaImageSeedReplayNativeInputs)
  assert.equal(profile.normalizeReferenceInputs, normalizeAnimaImageSeedReplayReferenceInputs)
  assert.equal(profile.assertPreview, undefined)
  assert.equal(profile.assertQueuedNotice, undefined)
  for (const source of [
    ...image.sourceDependencies,
    image.adapterSource,
    image.oracleSource,
    seeds.adapterSource,
    seeds.oracleSource,
    ...seeds.sourceDependencies,
  ])
    assert.ok(profile.sourceDependencies.includes(source))
  for (const stage of ['random', 'replay']) {
    const { fixture, plan } = authored(stage)
    assert.equal(profile.provisionalOnly(fixture), false)
    assert.equal(profile.expectedBaselineStage(fixture), 'random')
    assert.deepEqual(profile.baselineMetadataDifferences(fixture), ['requestedSeedPolicy'])
    assert.deepEqual(profile.baselineSourceChanges(fixture), [])
    assert.equal(createInstalledDynamicBatchDeadlineBounds(profile, fixture).seconds, 1800)
    assert.equal(profile.completionTimeoutMs(fixture), 1_600_000)
    for (const expectedItem of plan.items)
      assert.equal(shouldCompareCompletionBaseline(profile, fixture, expectedItem), true)
    for (const rows of [profile.comparisonChanged(fixture), profile.comparisonSame(fixture)]) {
      assert.equal(rows.includes('seed.actual'), false)
      assert.equal(rows.includes('seed.policy'), false)
    }
  }
})

test('authored Random keeps null value and numeric Fixed uses literal actual base including0, never cursor last seed', () => {
  for (const baseSeed of [0, testBaseSeed, 4294967295])
    for (const mode of ['img2img', 'outpaint'])
      for (const stage of ['random', 'replay']) {
        const { draft, reference, fixture, plan } = authored(stage, mode, baseSeed)
        profile.assertAuthored(draft, reference, fixture, plan)
        const before = structuredClone(draft)
        before.sampling.denoisingStrength = null
        profile.assertAuthored(before, reference, fixture, plan)
        for (const mutate of [
          (v) => {
            v.seed = {
              policy: stage === 'random' ? 'fixed' : 'random',
              value: stage === 'random' ? baseSeed : null,
            }
          },
          (v) => {
            v.seed.value = 37
          },
          (v) => {
            v.dynamicPrompt.seedBehavior = 'per-iteration'
          },
          (v) => {
            v.dynamicPrompt.maxPrompts = 1
          },
          (v) => {
            v.positivePrompt.text = plan.sourcePrompts.negative
          },
          (v) => {
            v.negativePrompt.embeddingRefs = [{ token: '<unsupported>' }]
          },
          (v) => {
            v.loras[0].weight = 0.5
          },
          (v) => {
            v.model.fileSha256 = '9'.repeat(64)
          },
          (v) => {
            v.vae = v.model
          },
          (v) => {
            v.cfgRescale = 0.5
          },
        ]) {
          const wrong = structuredClone(draft)
          mutate(wrong)
          assert.throws(() => profile.assertAuthored(wrong, reference, fixture, plan))
        }
      }
})

test('all32 owning comparisons preserve actual uint32/weighted raw inputs, Random/Fixed policy and later PI edits', async () => {
  let count = 0
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['random', 'replay']) {
      const scope = authored(stage, mode),
        actual = await produced(scope.reference, stage, mode)
      const plan = resolve(scope.plan, actual.rows)
      for (const item of plan.items) {
        const { context, rows, seen } = comparisonInput(scope, item),
          { fixture, ...inputs } = context
        const evidence = await invokeComparisonAdapter(profile, fixture, inputs)
        assert.deepEqual(Object.keys(evidence).sort(), Object.keys(rows).sort())
        assert.deepEqual(seen.sort(), Object.keys(rows).sort())
        assert.equal(evidence['seed.policy'].status, stage === 'random' ? 'Changed' : 'Same')
        assert.equal(evidence['seed.behavior'].status, 'Changed')
        assert.equal(evidence['seed.actual'].values[0], String(item.seed))
        count++
      }
    }
  assert.equal(count, 32)
})

test('controlled Main seed37 is Same while its requested policy remains independently Random or Fixed', async () => {
  for (const stage of ['random', 'replay']) {
    const scope = authored(stage, 'img2img', 37),
      actual = await produced(scope.reference, stage, 'img2img', { baseSeed: 37 })
    const item = resolve(scope.plan, actual.rows).items[0],
      peer = comparisonInput(scope, item),
      { fixture, ...inputs } = peer.context
    const observed = await invokeComparisonAdapter(profile, fixture, inputs)
    assert.equal(observed['seed.actual'].status, 'Same')
    assert.deepEqual(observed['seed.actual'].values, ['37', '37'])
    assert.equal(observed['seed.policy'].status, stage === 'random' ? 'Changed' : 'Same')
    peer.rows['seed.actual'].status = 'Changed'
    await assert.rejects(() => invokeComparisonAdapter(profile, fixture, inputs))
  }
})

test('comparison rejects substituted spans, false policy rows and same-behavior late drafts', async () => {
  const scope = authored('replay', 'outpaint'),
    item = literal('replay', 'outpaint', testBaseSeed).items[7]
  for (const mutate of [
    ({ rows }) => {
      rows['seed.actual'].values[0] = '0'
    },
    ({ rows }) => {
      rows['seed.policy'].status = 'Changed'
    },
    ({ rows }) => {
      rows['seed.policy'].values[0] = 'random'
    },
    ({ rows }) => {
      rows['loras.stack'].values[0] = 'bad SHA'
    },
    ({ context }) => {
      context.currentDraft.dynamicPrompt.seedBehavior = 'per-prompt'
    },
    ({ context }) => {
      context.currentDraft.negativePrompt.embeddingRefs = [{ token: '<unsupported>' }]
    },
    ({ context }) => {
      context.generation.expectedItem = structuredClone(context.generation.expectedItem)
      context.generation.expectedItem.compiledPrompts.positive.spans[1].weight = 1
    },
  ]) {
    const peer = comparisonInput(scope, item)
    mutate(peer)
    const { fixture, ...inputs } = peer.context
    await assert.rejects(() => invokeComparisonAdapter(profile, fixture, inputs))
  }
})

test('driver validates the complete own Random report before numeric replay and refuses the last portable seed change', async () => {
  const random = authored(),
    actual = await produced(random.reference, 'random', 'img2img'),
    replay = authored('replay')
  const context = {
    baseline: retainedBaseline(actual, 'img2img'),
    fixture: replay.fixture,
    plan: replay.plan,
    reference: random.reference,
  }
  await invokeBaselineAdapter(profile, context)
  context.baseline.generations[7].provenance.generationConfiguration.sampling.actualSeed = 0
  await assert.rejects(() => invokeBaselineAdapter(profile, context))
})

test('summary requires every own accepted resolved tuple and replay permits policy only, including zero-base runs', async () => {
  for (const stage of ['random', 'replay']) {
    const scope = authored(stage, 'img2img', 0),
      actual = await produced(scope.reference, stage, 'img2img', { baseSeed: 0 }),
      plan = resolve(scope.plan, actual.rows)
    const report = { generations: generations(actual, plan) }
    if (stage === 'replay')
      for (const generation of report.generations)
        generation.baseline = {
          reportPath: scope.fixture.baseline.reportPath,
          reportSha256: scope.fixture.baseline.reportSha256,
          beforeExplicitAdd: true,
          allowedMetadataDifferences: ['requestedSeedPolicy'],
          actualPixelSha256: generation.dimensions.pixelSha256,
          expectedPixelSha256: generation.dimensions.pixelSha256,
        }
    const claims = profile.summaryClaims({ fixture: scope.fixture, plan, report })
    assert.equal(claims.randomClaim, stage === 'random')
    assert.equal(claims.randomNumericReplayClaim, stage === 'replay')
    assert.equal(claims.ownFullInputNumericReplayClaim, stage === 'replay')
    for (const key of [
      'compiledPromptPortableClaim',
      'scalarWeightCausalityClaim',
      'tensorDirectionClaim',
      'uint32WrapClaim',
      'cap32RefusalClaim',
      'fullMvpClaim',
    ])
      assert.equal(claims[key], false)
    for (const mutate of [
      (v) => {
        v.generations[7].accepted = false
      },
      (v) => {
        v.generations[7].expectedItem = structuredClone(v.generations[7].expectedItem)
        v.generations[7].expectedItem.seed = 0
      },
      ...(stage === 'replay'
        ? [
            (v) => {
              v.generations[7].baseline.allowedMetadataDifferences = ['seedBehavior']
            },
            (v) => {
              v.generations[7].baseline.beforeExplicitAdd = false
            },
            (v) => {
              v.generations[7].baseline.actualPixelSha256 = '9'.repeat(64)
            },
          ]
        : []),
    ]) {
      const wrong = structuredClone(report)
      mutate(wrong)
      assert.throws(() => profile.summaryClaims({ fixture: scope.fixture, plan, report: wrong }))
    }
    assert.throws(() =>
      profile.summaryClaims({ fixture: { ...scope.fixture, mode: 'outpaint' }, plan, report }),
    )
  }
})
