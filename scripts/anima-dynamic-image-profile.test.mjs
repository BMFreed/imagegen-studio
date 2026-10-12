/** Actual adapter composition/assertions with declared UI/report peers; no native UI/ML claim. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { animaHeunImageProfile as image } from './anima-heun-image-profile.mjs'
import { illustriousDynamicImageProfile as imageBatch } from './illustrious-dynamic-image-profile.mjs'
import { animaDynamicImageProfile as profile } from './anima-dynamic-image-profile.mjs'
import {
  assertAnimaDynamicImageBaseline,
  assertAnimaDynamicImageConfiguration,
  assertAnimaDynamicImageFrozen,
  normalizeAnimaDynamicImageNativeInputs,
  validateAnimaDynamicImageFixture,
} from './anima-dynamic-image-qualification.mjs'
import {
  invokeBaselineAdapter,
  invokeComparisonAdapter,
} from './installed-dynamic-batch-driver.mjs'
import {
  authored,
  comparisonInput,
  generations,
  produced,
  retainedBaseline,
} from './anima-dynamic-image-test-fixtures.mjs'

test('Anima dynamic image adapter injects genuine image hooks and family-independent visibility without old Heun plans', () => {
  assert.equal(profile.validateFixture, validateAnimaDynamicImageFixture)
  assert.equal(profile.assertFrozen, assertAnimaDynamicImageFrozen)
  assert.equal(profile.assertConfiguration, assertAnimaDynamicImageConfiguration)
  assert.equal(profile.assertBaseline, assertAnimaDynamicImageBaseline)
  for (const hook of [
    'normalizeNativeInputs',
    'normalizeExecutionInputs',
    'normalizeReferenceInputs',
  ])
    assert.equal(profile[hook], normalizeAnimaDynamicImageNativeInputs)
  for (const hook of [
    'prepareInput',
    'assertTarget',
    'assertOutput',
    'modelKey',
    'loraKey',
    'originalSourceKeys',
    'operation',
  ])
    assert.equal(profile[hook], image[hook])
  assert.equal(profile.afterAcceptance, imageBatch.afterAcceptance)
  assert.notEqual(profile.assertSaved, image.assertSaved)
  assert.notEqual(profile.assertComparison, image.assertComparison)
  assert.equal(profile.assertPreview, undefined)
  assert.equal(profile.assertQueuedNotice, undefined)
  assert.equal(profile.qualificationDeadlineSeconds, undefined)
  for (const source of [
    image.adapterSource,
    image.oracleSource,
    imageBatch.adapterSource,
    imageBatch.oracleSource,
    'scripts/anima-regression-qualification.mjs',
    'scripts/noobai-lora-stack-qualification.mjs',
  ])
    assert.ok(profile.sourceDependencies.includes(source))
  assert.deepEqual(profile.sampling(), {
    label: 'Anima method',
    draftKey: 'animaMethod',
    value: 'Euler',
    code: 'euler',
    editedValue: 'Heun',
    editedCode: 'heun',
  })
})
test('four authored scopes require full templates and exact Anima resources with no unsupported settings', () => {
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['baseline', 'prefix']) {
      const { draft, reference, fixture, plan } = authored(stage, mode)
      profile.assertAuthored(draft, reference, fixture, plan)
      assert.equal(profile.operation(fixture), `anima-${mode}`)
      assert.equal(profile.inferenceSteps(fixture), 3)
      assert.equal(profile.observedSteps(fixture), 2)
      assert.equal(profile.requiresSourceImage(fixture), true)
      assert.equal(profile.provisionalOnly(fixture), false)
      assert.deepEqual(profile.originalSourceKeys(fixture), [
        'encoder',
        'vae',
        'anima',
        'animaLora',
      ])
      assert.deepEqual(profile.baselineMetadataDifferences(fixture), [])
      assert.deepEqual(profile.baselineSourceChanges(fixture), [])
      assert.equal(profile.expectedBaselineStage(fixture), 'baseline')
      for (const item of plan.items)
        assert.equal(profile.shouldCompareBaseline({ fixture, expectedItem: item }), true)
      const beforeImport = structuredClone(draft)
      beforeImport.sampling.denoisingStrength = null
      profile.assertAuthored(beforeImport, reference, fixture, plan)
      const resources = profile.extraInputFiles(fixture, reference)
      assert.equal(resources.length, mode === 'outpaint' ? 2 : 0)
      if (mode === 'outpaint') {
        assert.equal(resources[0].path, fixture.lamaSource.path)
        assert.equal(resources[1].path, reference.appData + '/inference-resources/big-lama.pt')
      }
      for (const [label, mutate] of [
        [
          'lostfulltemplate',
          (v) => {
            v.positivePrompt.text = plan.items[0].prompts.positive
          },
        ],
        [
          'unsupportedpositiveembedding',
          (v) => {
            v.positivePrompt.embeddingRefs = [{ token: '<style>' }]
          },
        ],
        [
          'unsupportednegativeembedding',
          (v) => {
            v.negativePrompt.embeddingRefs = [{ token: '<style>' }]
          },
        ],
        [
          'wrongseed',
          (v) => {
            v.seed.value = 37
          },
        ],
        [
          'wrongprefixselection',
          (v) => {
            v.dynamicPrompt.maxPrompts = stage === 'baseline' ? 1 : 4
          },
        ],
        [
          'wrongbehavior',
          (v) => {
            v.dynamicPrompt.seedBehavior = 'per-prompt'
          },
        ],
        [
          'wrongmethod',
          (v) => {
            v.sampling.animaMethod = 'heun'
          },
        ],
        [
          'wrongsteps',
          (v) => {
            v.sampling.steps = 4
          },
        ],
        [
          'wrongCFG',
          (v) => {
            v.sampling.cfgScale = 5
          },
        ],
        [
          'wrongmodelSHA',
          (v) => {
            v.model.fileSha256 = '9'.repeat(64)
          },
        ],
        [
          'wrongfamily',
          (v) => {
            v.model.baseModelFamily = 'illustrious'
          },
        ],
        [
          'wrongLoRAweight',
          (v) => {
            v.loras[0].weight = 0.5
          },
        ],
        [
          'externalVAE',
          (v) => {
            v.vae = v.model
          },
        ],
        [
          'manualPrecision',
          (v) => {
            v.vaePrecision = 'FP32'
          },
        ],
        [
          'nonneutralRescale',
          (v) => {
            v.cfgRescale = 0.7
          },
        ],
        [
          'clipSkip',
          (v) => {
            v.clipSkip = 2
          },
        ],
      ]) {
        const wrong = structuredClone(draft)
        mutate(wrong)
        assert.throws(
          () => profile.assertAuthored(wrong, reference, fixture, plan),
          undefined,
          label,
        )
      }
    }
})
test('all20 owning comparison inputs retain their concrete pair/seed/method versus later draft edits', async () => {
  let count = 0
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['baseline', 'prefix']) {
      const scope = authored(stage, mode)
      for (let index = 0; index < scope.plan.items.length; index++) {
        const { context, rows, seen } = comparisonInput(scope, index)
        const { fixture, ...inputs } = context
        const evidence = await invokeComparisonAdapter(profile, fixture, inputs)
        assert.deepEqual(Object.keys(evidence).sort(), Object.keys(rows).sort())
        assert.deepEqual(seen.sort(), Object.keys(rows).sort())
        assert.equal(evidence['context.mode'].status, mode === 'outpaint' ? 'Changed' : 'Same')
        assert.deepEqual(evidence['seed.actual'].values, [
          String(scope.plan.items[index].seed),
          '37',
        ])
        assert.equal(evidence['seed.policy'].status, 'Same')
        assert.equal(evidence['seed.behavior'].status, 'Changed')
        assert.equal(evidence['sampling.animaMethod'].status, 'Changed')
        assert.equal(evidence['prompt.embeddings'].status, 'Same')
        count++
      }
    }
  assert.equal(count, 20)
})
test('owning comparison refuses forged saved rows and stale current draft state', async () => {
  const scope = authored('baseline', 'outpaint')
  for (const [label, mutate] of [
    [
      'falseSame',
      ({ rows }) => {
        rows['sampling.animaMethod'].status = 'Same'
      },
    ],
    [
      'wrongmethod',
      ({ rows }) => {
        rows['sampling.animaMethod'].values[0] = 'Heun'
      },
    ],
    [
      'wrongseed',
      ({ rows }) => {
        rows['seed.actual'].values[0] = '0'
      },
    ],
    [
      'wrongrawpositive',
      ({ rows }) => {
        rows['prompt.text'].values[0] = 'late positive'
      },
    ],
    [
      'wrongrawnegative',
      ({ rows }) => {
        rows['negativePrompt.text'].values[0] = 'late negative'
      },
    ],
    [
      'wrongLoRASHA',
      ({ rows }) => {
        rows['loras.stack'].values[0] = 'Wrong saved source'
      },
    ],
    [
      'unsupportedref',
      ({ context }) => {
        context.currentDraft.negativePrompt.embeddingRefs = [{ token: '<style>' }]
      },
    ],
    [
      'unflippedbehavior',
      ({ context }) => {
        context.currentDraft.dynamicPrompt.seedBehavior = 'per-iteration'
      },
    ],
    [
      'wronglatermethod',
      ({ context }) => {
        context.currentDraft.sampling.animaMethod = 'euler'
      },
    ],
    [
      'wronglaterstrength',
      ({ context }) => {
        context.currentDraft.sampling.denoisingStrength = 0.75
      },
    ],
    [
      'wrongcompiledtuple',
      ({ context }) => {
        context.generation.expectedItem = structuredClone(context.generation.expectedItem)
        context.generation.expectedItem.compiledPrompts.positive.spans[1].weight = 1
      },
    ],
  ]) {
    const comparison = comparisonInput(scope, 1)
    mutate(comparison)
    const { fixture, ...inputs } = comparison.context
    await assert.rejects(() => invokeComparisonAdapter(profile, fixture, inputs), undefined, label)
  }
})
test('driver invokes whole own-baseline validation before accepting same-input prefix references', async () => {
  const scope = authored()
  const actual = await produced(scope.reference, 'baseline', 'img2img')
  const prefix = authored('prefix')
  const context = {
    baseline: retainedBaseline(actual, scope.plan),
    fixture: prefix.fixture,
    plan: prefix.plan,
    reference: scope.reference,
  }
  await invokeBaselineAdapter(profile, context)
  context.baseline.generations[7].provenance.generationConfiguration.positivePrompt.text =
    'late substituted prompt'
  await assert.rejects(() => invokeBaselineAdapter(profile, context))
})
test('summary requires every accepted tuple and complete unchanged-input own prefix pixel evidence', async () => {
  for (const stage of ['baseline', 'prefix']) {
    const { reference, fixture, plan } = authored(stage)
    const actual = await produced(reference, stage, 'img2img')
    const report = { generations: generations(actual, plan) }
    if (stage === 'prefix')
      for (const generation of report.generations)
        generation.baseline = {
          reportPath: fixture.baseline.reportPath,
          reportSha256: fixture.baseline.reportSha256,
          beforeExplicitAdd: true,
          allowedMetadataDifferences: [],
          actualPixelSha256: generation.dimensions.pixelSha256,
          expectedPixelSha256: generation.dimensions.pixelSha256,
        }
    const summary = profile.summaryClaims({ fixture, plan, report })
    assert.equal(summary.ownFullInputPrefixReplayClaim, stage === 'prefix')
    for (const flag of [
      'compiledPromptPortableClaim',
      'scalarWeightCausalityClaim',
      'tensorDirectionClaim',
      'fullMvpClaim',
    ])
      assert.equal(summary[flag], false)
    for (const mutate of [
      (v) => {
        v.generations[0].accepted = false
      },
      (v) => {
        v.generations[0].expectedItem.compiledPrompts.negative.spans[0].weight = 1
      },
      ...(stage === 'prefix'
        ? [
            (v) => {
              v.generations[1].baseline.allowedMetadataDifferences = ['seedBehavior']
            },
            (v) => {
              v.generations[1].baseline.beforeExplicitAdd = false
            },
            (v) => {
              v.generations[1].baseline.actualPixelSha256 = '9'.repeat(64)
            },
            (v) => {
              v.generations[1].baseline.reportSha256 = '9'.repeat(64)
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
