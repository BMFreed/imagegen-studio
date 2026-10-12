/** Real profile/driver DI with declared UI/report peers and genuine Main rows; no ML/UI claim. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { animaDynamicImageProfile as image } from './anima-dynamic-image-profile.mjs'
import { animaDynamicImagePerPromptProfile as profile } from './anima-dynamic-image-per-prompt-profile.mjs'
import {
  assertAnimaDynamicImagePerPromptBaseline,
  assertAnimaDynamicImagePerPromptConfiguration,
  assertAnimaDynamicImagePerPromptFrozen,
  normalizeAnimaDynamicImagePerPromptReferenceInputs,
  validateAnimaDynamicImagePerPromptFixture,
} from './anima-dynamic-image-per-prompt-qualification.mjs'
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
} from './anima-dynamic-image-per-prompt-test-fixtures.mjs'

test('per-prompt profile reuses genuine image/Save/Add hooks and validates all eight controls without driver rewrite', () => {
  assert.equal(profile.validateFixture, validateAnimaDynamicImagePerPromptFixture)
  assert.equal(profile.assertFrozen, assertAnimaDynamicImagePerPromptFrozen)
  assert.equal(profile.assertConfiguration, assertAnimaDynamicImagePerPromptConfiguration)
  assert.equal(profile.assertBaseline, assertAnimaDynamicImagePerPromptBaseline)
  assert.equal(profile.normalizeReferenceInputs, normalizeAnimaDynamicImagePerPromptReferenceInputs)
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
  assert.notEqual(profile.assertEdited, image.assertEdited)
  assert.notEqual(profile.assertComparison, image.assertComparison)
  assert.notEqual(profile.afterCompletions, image.afterCompletions)
  assert.equal(profile.assertPreview, undefined)
  assert.equal(profile.assertQueuedNotice, undefined)
  for (const source of [...image.sourceDependencies, image.adapterSource, image.oracleSource])
    assert.ok(profile.sourceDependencies.includes(source))
  for (const stage of ['numeric-control', 'per-prompt']) {
    const { fixture, plan } = authored(stage)
    assert.equal(profile.provisionalOnly(fixture), false)
    assert.equal(profile.expectedBaselineStage(fixture), 'numeric-control')
    assert.deepEqual(profile.baselineMetadataDifferences(fixture), ['seedBehavior'])
    assert.deepEqual(profile.baselineSourceChanges(fixture), [])
    assert.equal(
      createInstalledDynamicBatchDeadlineBounds(profile, fixture).seconds,
      stage === 'numeric-control' ? 2700 : 1800,
    )
    assert.equal(profile.completionTimeoutMs(fixture), 1_600_000)
    for (const expectedItem of plan.items)
      assert.equal(shouldCompareCompletionBaseline(profile, fixture, expectedItem), true)
  }
})

test('authored scopes require all templates, exact resources and stage-specific behavior while strength is captured later', () => {
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['numeric-control', 'per-prompt']) {
      const { draft, reference, fixture, plan } = authored(stage, mode)
      profile.assertAuthored(draft, reference, fixture, plan)
      const before = structuredClone(draft)
      before.sampling.denoisingStrength = null
      profile.assertAuthored(before, reference, fixture, plan)
      for (const mutate of [
        (v) => {
          v.dynamicPrompt.maxPrompts = 1
        },
        (v) => {
          v.dynamicPrompt.seedBehavior =
            plan.seedBehavior === 'per-prompt' ? 'per-iteration' : 'per-prompt'
        },
        (v) => {
          v.seed.value = 37
        },
        (v) => {
          v.positivePrompt.text = plan.items[0].prompts.positive
        },
        (v) => {
          v.negativePrompt.embeddingRefs = [{ token: '<unsupported>' }]
        },
        (v) => {
          v.model.fileSha256 = '9'.repeat(64)
        },
        (v) => {
          v.model.baseModelFamily = 'illustrious'
        },
        (v) => {
          v.loras[0].weight = 0.5
        },
        (v) => {
          v.vae = v.model
        },
        (v) => {
          v.vaePrecision = 'FP32'
        },
        (v) => {
          v.cfgRescale = 0.5
        },
        (v) => {
          v.clipSkip = 2
        },
        (v) => {
          v.sampling.animaMethod = 'heun'
        },
      ]) {
        const wrong = structuredClone(draft)
        mutate(wrong)
        assert.throws(() => profile.assertAuthored(wrong, reference, fixture, plan))
      }
      const files = profile.extraInputFiles(fixture, reference)
      assert.equal(files.length, mode === 'outpaint' ? 2 : 0)
    }
})

test('all80 owning comparison rows preserve actual0…7, full raw weighted pairs, opposite late behavior and LoRA identities', async () => {
  let count = 0
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['numeric-control', 'per-prompt']) {
      const scope = authored(stage, mode)
      for (let index = 0; index < scope.plan.expectedCompletions; index++) {
        const { context, rows, seen } = comparisonInput(scope, index),
          { fixture, ...inputs } = context
        const evidence = await invokeComparisonAdapter(profile, fixture, inputs)
        assert.deepEqual(Object.keys(evidence).sort(), Object.keys(rows).sort())
        assert.deepEqual(seen.sort(), Object.keys(rows).sort())
        assert.equal(evidence['seed.behavior'].status, 'Changed')
        assert.equal(evidence['seed.actual'].values[0], String(scope.plan.items[index].seed))
        assert.equal(evidence['context.mode'].status, mode === 'outpaint' ? 'Changed' : 'Same')
        assert.equal(evidence['seed.policy'].status, 'Same')
        assert.equal(evidence['prompt.embeddings'].status, 'Same')
        count++
      }
    }
  assert.equal(count, 80)
})

test('per-prompt comparison refuses missing final seed, wrong spans/behavior/current draft and false same metadata', async () => {
  for (const stage of ['numeric-control', 'per-prompt']) {
    const scope = authored(stage, 'outpaint')
    for (const mutate of [
      ({ rows }) => {
        rows['seed.actual'].values[0] = '0'
      },
      ({ rows }) => {
        rows['seed.behavior'].status = 'Same'
      },
      ({ rows }) => {
        rows['prompt.text'].values[0] = 'later positive'
      },
      ({ rows }) => {
        rows['loras.stack'].values[0] = 'wrong SHA'
      },
      ({ context }) => {
        context.currentDraft.dynamicPrompt.seedBehavior = scope.plan.seedBehavior
      },
      ({ context }) => {
        context.currentDraft.seed.value = 7
      },
      ({ context }) => {
        context.currentDraft.negativePrompt.embeddingRefs = [{ token: '<unsupported>' }]
      },
      ({ context }) => {
        context.currentDraft.sampling.denoisingStrength = 0.75
      },
      ({ context }) => {
        context.generation.expectedItem = structuredClone(context.generation.expectedItem)
        context.generation.expectedItem.compiledPrompts.positive.spans[1].weight = 1
      },
    ]) {
      const comparison = comparisonInput(scope, scope.plan.expectedCompletions - 1)
      mutate(comparison)
      const { fixture, ...inputs } = comparison.context
      await assert.rejects(() => invokeComparisonAdapter(profile, fixture, inputs))
    }
  }
})

test('driver-bound own baseline checks every32 recipe, including the last selected numeric control', async () => {
  const scope = authored('numeric-control'),
    actual = await produced(scope.reference, 'numeric-control', 'img2img'),
    subject = authored('per-prompt')
  const context = {
    baseline: retainedBaseline(actual, scope.plan),
    fixture: subject.fixture,
    plan: subject.plan,
    reference: scope.reference,
  }
  await invokeBaselineAdapter(profile, context)
  context.baseline.generations[31].provenance.generationConfiguration.sampling.actualSeed = 1
  await assert.rejects(() => invokeBaselineAdapter(profile, context))
})

test('summary requires all32/8 accepted tuples and every declared per-prompt whole-input control', async () => {
  for (const stage of ['numeric-control', 'per-prompt']) {
    const { reference, fixture, plan } = authored(stage),
      actual = await produced(reference, stage, 'img2img')
    const report = { generations: generations(actual, plan) }
    if (stage === 'per-prompt')
      for (const generation of report.generations)
        generation.baseline = {
          reportPath: fixture.baseline.reportPath,
          reportSha256: fixture.baseline.reportSha256,
          beforeExplicitAdd: true,
          allowedMetadataDifferences: ['seedBehavior'],
          actualPixelSha256: generation.dimensions.pixelSha256,
          expectedPixelSha256: generation.dimensions.pixelSha256,
        }
    const claims = profile.summaryClaims({ fixture, plan, report })
    assert.equal(claims.ownFullInputPerPromptReplayClaim, stage === 'per-prompt')
    for (const key of [
      'compiledPromptPortableClaim',
      'scalarWeightCausalityClaim',
      'tensorDirectionClaim',
      'cap32RefusalClaim',
      'fullMvpClaim',
    ])
      assert.equal(claims[key], false)
    for (const mutate of [
      (v) => {
        v.generations.at(-1).accepted = false
      },
      (v) => {
        v.generations.at(-1).expectedItem = structuredClone(v.generations.at(-1).expectedItem)
        v.generations.at(-1).expectedItem.seed = 0
      },
      ...(stage === 'per-prompt'
        ? [
            (v) => {
              v.generations[7].baseline.allowedMetadataDifferences = []
            },
            (v) => {
              v.generations[7].baseline.beforeExplicitAdd = false
            },
            (v) => {
              v.generations[7].baseline.actualPixelSha256 = '9'.repeat(64)
            },
            (v) => {
              v.generations[7].baseline.reportSha256 = '9'.repeat(64)
            },
          ]
        : []),
    ]) {
      const wrong = structuredClone(report)
      mutate(wrong)
      assert.throws(() => profile.summaryClaims({ fixture, plan, report: wrong }))
    }
  }
})
