/** Exercise the actual composed adapter with declared authoring/DOM/report peers; no UI/ML claim. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { illustriousDynamicEmbeddingsProfile as embeddings } from './illustrious-dynamic-embeddings-profile.mjs'
import { illustriousDynamicImageProfile as image } from './illustrious-dynamic-image-profile.mjs'
import { illustriousDynamicEmbeddingsImageProfile as profile } from './illustrious-dynamic-embeddings-image-profile.mjs'
import {
  assertIllustriousDynamicEmbeddingsImageBaseline,
  assertIllustriousDynamicEmbeddingsImageConfiguration,
  assertIllustriousDynamicEmbeddingsImageFrozen,
  normalizeIllustriousDynamicEmbeddingsImageNativeInputs,
  validateIllustriousDynamicEmbeddingsImageFixture,
} from './illustrious-dynamic-embeddings-image-qualification.mjs'
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
} from './illustrious-dynamic-embeddings-image-test-fixtures.mjs'

test('signed image profile injects exact owned completion and genuine image/Save hooks without driver changes', () => {
  assert.equal(profile.authorPrompts, embeddings.authorPrompts)
  assert.equal(profile.validateFixture, validateIllustriousDynamicEmbeddingsImageFixture)
  assert.equal(profile.assertFrozen, assertIllustriousDynamicEmbeddingsImageFrozen)
  assert.equal(profile.assertConfiguration, assertIllustriousDynamicEmbeddingsImageConfiguration)
  assert.equal(profile.assertBaseline, assertIllustriousDynamicEmbeddingsImageBaseline)
  for (const name of [
    'normalizeNativeInputs',
    'normalizeExecutionInputs',
    'normalizeReferenceInputs',
  ])
    assert.equal(profile[name], normalizeIllustriousDynamicEmbeddingsImageNativeInputs)
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
  assert.notEqual(profile.afterCompletions, image.afterCompletions)
  assert.notEqual(profile.assertComparison, image.assertComparison)
  assert.equal(profile.qualificationDeadlineSeconds, undefined)
  for (const source of [
    image.adapterSource,
    image.oracleSource,
    embeddings.adapterSource,
    embeddings.oracleSource,
  ])
    assert.ok(profile.sourceDependencies.includes(source))
})
test('all eight authored scopes retain full weighted templates/exact trained refs and stable runtime inputs', () => {
  for (const objective of ['epsilon', 'v_prediction'])
    for (const mode of ['img2img', 'outpaint'])
      for (const stage of ['baseline', 'prefix']) {
        const { fixture, reference, plan, draft } = authored(stage, objective, mode)
        profile.assertAuthored(draft, reference, fixture, plan)
        assert.equal(profile.operation(fixture), `illustrious-${mode}`)
        assert.equal(profile.requiresSourceImage(fixture), true)
        assert.equal(profile.provisionalOnly(fixture), false)
        assert.equal(profile.inferenceSteps(fixture), 3)
        assert.equal(profile.observedSteps(fixture), 2)
        assert.equal(profile.sampling(fixture).value, plan.sampler)
        assert.equal(profile.sampling(fixture).editedValue, plan.sampler)
        assert.deepEqual(profile.originalSourceKeys(fixture), [
          plan.modelKey,
          'illustriousLora',
          'externalVaeNative',
          'embeddingTrained',
        ])
        assert.deepEqual(profile.baselineMetadataDifferences(fixture), [])
        assert.deepEqual(profile.baselineSourceChanges(fixture), [])
        assert.equal(profile.expectedBaselineStage(fixture), 'baseline')
        for (const item of plan.items)
          assert.equal(profile.shouldCompareBaseline({ fixture, expectedItem: item }), true)
        for (const [label, mutate] of [
          [
            'concretesubstitutesfulltemplate',
            (v) => {
              v.positivePrompt.text = plan.items[0].prompts.positive
            },
          ],
          [
            'lostauthorednegative',
            (v) => {
              v.negativePrompt.embeddingRefs = []
            },
          ],
          [
            'zerocontroldefault',
            (v) => {
              v.positivePrompt.embeddingRefs[0].resource.localVersionId = 'zero-control-default'
            },
          ],
          [
            'wrongtrainedSHA',
            (v) => {
              v.negativePrompt.embeddingRefs[0].resource.fileSha256 = '9'.repeat(64)
            },
          ],
          [
            'wrongweightedsyntax',
            (v) => {
              v.negativePrompt.text = v.negativePrompt.text.replace(':0.7', ':1.3')
            },
          ],
          [
            'wrongdynamicselection',
            (v) => {
              v.dynamicPrompt.maxPrompts = stage === 'baseline' ? 2 : 4
            },
          ],
          [
            'wrongseed',
            (v) => {
              v.seed.value = 37
            },
          ],
          [
            'wrongbehavior',
            (v) => {
              v.dynamicPrompt.seedBehavior = 'per-prompt'
            },
          ],
          [
            'wrongobjective',
            (v) => {
              v.model.predictionType = objective === 'epsilon' ? 'v_prediction' : 'epsilon'
            },
          ],
          [
            'wrongVAEprecision',
            (v) => {
              v.vaePrecision = 'FP16'
            },
          ],
          [
            'wrongLoRA',
            (v) => {
              v.loras[0].weight = 0.5
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
test('every owning comparison distinguishes inactive Same from signed Removed and exact saved values', async () => {
  for (const objective of ['epsilon', 'v_prediction'])
    for (const mode of ['img2img', 'outpaint'])
      for (const stage of ['baseline', 'prefix']) {
        const scope = authored(stage, objective, mode)
        for (let index = 0; index < scope.plan.items.length; index++) {
          const { context, rows, seen } = comparisonInput(scope, index)
          const { fixture, ...inputs } = context
          const proof = await invokeComparisonAdapter(profile, fixture, inputs)
          assert.deepEqual(Object.keys(proof).sort(), Object.keys(rows).sort())
          assert.deepEqual(seen.sort(), Object.keys(rows).sort())
          assert.equal(proof['prompt.embeddings'].status, index < 2 ? 'Same' : 'Removed')
          assert.equal(
            proof['negativePrompt.embeddings'].status,
            index % 2 === 0 ? 'Same' : 'Removed',
          )
          assert.equal(proof['context.mode'].status, mode === 'outpaint' ? 'Changed' : 'Same')
          assert.equal(proof['seed.behavior'].status, 'Changed')
        }
      }
})
test('owning comparison refuses false statuses, missing exact version/SHA/token and late stale refs', async () => {
  const scope = authored('baseline', 'epsilon', 'outpaint')
  const ref = scope.draft.positivePrompt.embeddingRefs[0]
  for (const [label, index, mutate] of [
    [
      'inactivefalseRemoved',
      0,
      ({ rows }) => {
        rows['prompt.embeddings'].status = 'Removed'
      },
    ],
    [
      'activefalseSame',
      1,
      ({ rows }) => {
        rows['negativePrompt.embeddings'].status = 'Same'
      },
    ],
    [
      'wrongversion',
      1,
      ({ rows }) => {
        rows['negativePrompt.embeddings'].values[0] = rows[
          'negativePrompt.embeddings'
        ].values[0].replace(ref.resource.versionName, 'other version')
      },
    ],
    [
      'wrongSHA',
      1,
      ({ rows }) => {
        rows['negativePrompt.embeddings'].values[0] = rows[
          'negativePrompt.embeddings'
        ].values[0].replace(ref.resource.fileSha256, '9'.repeat(64))
      },
    ],
    [
      'wrongtoken',
      2,
      ({ rows }) => {
        rows['prompt.embeddings'].values[0] = rows['prompt.embeddings'].values[0].replace(
          ref.token,
          '<other>',
        )
      },
    ],
    [
      'wrongname',
      2,
      ({ rows }) => {
        rows['prompt.embeddings'].values[0] = rows['prompt.embeddings'].values[0].replace(
          ref.resource.displayName,
          'other embedding',
        )
      },
    ],
    [
      'extracurrentref',
      3,
      ({ context }) => {
        context.currentDraft.negativePrompt.embeddingRefs = [ref]
      },
    ],
    [
      'staleauthoredtoken',
      3,
      ({ context }) => {
        context.currentDraft.positivePrompt.text += ', <illustriousphoto>'
      },
    ],
    [
      'wrongactualseed',
      1,
      ({ rows }) => {
        rows['seed.actual'].values[0] = '37'
      },
    ],
    [
      'wrongconcretesign',
      1,
      ({ rows }) => {
        rows['negativePrompt.text'].values[0] = 'low quality'
      },
    ],
    [
      'wrongLoRAdescription',
      1,
      ({ rows }) => {
        rows['loras.stack'].values[0] = 'Wrong saved stack'
      },
    ],
  ]) {
    const comparison = comparisonInput(scope, index)
    mutate(comparison)
    const { fixture, ...inputs } = comparison.context
    await assert.rejects(() => invokeComparisonAdapter(profile, fixture, inputs), undefined, label)
  }
})
test('current late edits require both ref removals and preserve opposite live dynamic behavior', () => {
  const scope = authored()
  const { context } = comparisonInput(scope, 1)
  profile.assertEdited(context.currentDraft, scope.reference, scope.fixture)
  for (const mutate of [
    (v) => {
      v.negativePrompt.embeddingRefs = scope.draft.negativePrompt.embeddingRefs
    },
    (v) => {
      v.positivePrompt.text += ', igs_ti_private_example'
    },
    (v) => {
      v.dynamicPrompt.seedBehavior = 'per-iteration'
    },
    (v) => {
      v.loras[0].weight = -0.5
    },
  ]) {
    const wrong = structuredClone(context.currentDraft)
    mutate(wrong)
    assert.throws(() => profile.assertEdited(wrong, scope.reference, scope.fixture))
  }
})
test('driver calls source-bound own baseline validation before trusting prefix references', async () => {
  const scope = authored('baseline')
  const actual = await produced(scope.reference, 'baseline', 'epsilon', 'img2img')
  const prefix = authored('prefix')
  const context = {
    baseline: retainedBaseline(actual, scope.plan),
    fixture: prefix.fixture,
    plan: prefix.plan,
    reference: scope.reference,
  }
  await invokeBaselineAdapter(profile, context)
  context.baseline.generations[1].provenance.generationConfiguration.negativePrompt.embeddingRefs =
    []
  await assert.rejects(() => invokeBaselineAdapter(profile, context))
})
test('summary claims require every own accepted tuple and unchanged-input prefix evidence', async () => {
  for (const stage of ['baseline', 'prefix']) {
    const { fixture, plan, reference } = authored(stage)
    const actual = await produced(reference, stage, 'epsilon', 'img2img')
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
    assert.equal(summary.installedDynamicEmbeddingImageInferenceClaim, true)
    assert.equal(summary.ownFullInputPrefixReplayClaim, stage === 'prefix')
    assert.equal(summary.causalTensorDirectionClaim, false)
    assert.equal(summary.fullMvpClaim, false)
    for (const mutate of [
      (v) => {
        v.generations[0].accepted = false
      },
      (v) => {
        v.generations[0].expectedItem.seed = 1
      },
      ...(stage === 'prefix'
        ? [
            (v) => {
              v.generations[0].baseline.allowedMetadataDifferences = ['seedBehavior']
            },
            (v) => {
              v.generations[1].baseline.actualPixelSha256 = '9'.repeat(64)
            },
            (v) => {
              v.generations[1].baseline.reportSha256 = '9'.repeat(64)
            },
            (v) => {
              v.generations[1].baseline.beforeExplicitAdd = false
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
