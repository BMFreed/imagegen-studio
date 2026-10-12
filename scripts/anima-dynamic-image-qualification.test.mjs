/** Independent table/whole-envelope checks against real Main-generated rows; no ML/Add/Save claim. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertAnimaDynamicImageBaseline as assertBaseline,
  assertAnimaDynamicImageConfiguration as assertConfiguration,
  assertAnimaDynamicImageFrozen as assertFrozen,
  assertAnimaDynamicImagePixels as assertPixels,
  literalAnimaDynamicImageNativePlan as nativePlan,
  literalAnimaDynamicImagePlan as literal,
  normalizeAnimaDynamicImageNativeInputs as normalize,
  resolveAnimaDynamicImagePlan as resolve,
  validateAnimaDynamicImageFixture as validate,
} from './anima-dynamic-image-qualification.mjs'
import {
  envelope,
  installedFixture,
  produced,
  retainedBaseline,
  pixelGenerations,
} from './anima-dynamic-image-test-fixtures.mjs'

test('finite Anima image tables define20outputs/fourpackages/fourprefixcontrols without producer expansion', () => {
  let jobs = 0,
    packages = 0,
    controls = 0
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['baseline', 'prefix']) {
      const plan = validate(envelope(stage, mode))
      assert.deepEqual(
        plan.items.map(({ seed }) => seed),
        stage === 'baseline' ? [0, 1, 0, 1, 0, 1, 0, 1] : [0, 1],
      )
      assert.deepEqual(
        plan.items.map(({ promptPairIndex }) => promptPairIndex),
        stage === 'baseline' ? [0, 0, 1, 1, 2, 2, 3, 3] : [0, 0],
      )
      assert.deepEqual(plan.sourcePrompts, literal('baseline', mode).sourcePrompts)
      assert.equal(plan.iterations, 2)
      assert.equal(plan.steps, 3)
      assert.equal(plan.observedSteps, 2)
      assert.equal(plan.truncated, stage === 'prefix')
      assert.equal(plan.expectedCanceled, 0)
      assert.ok(Object.isFrozen(plan.items[0].compiledPrompts.positive.spans[1]))
      jobs += plan.expectedAdmissions
      controls += stage === 'prefix' ? 2 : 0
      packages++
    }
  assert.deepEqual([jobs, packages, controls], [20, 4, 4])
  assert.deepEqual(nativePlan(0).sigmas, [0.8571428571428571, 0.6, 0])
  assert.deepEqual(nativePlan(1).timesteps, [857.1428571428571, 600])
  assert.equal(nativePlan(0).posteriorSeed, 2654435769)
  assert.equal(nativePlan(1).posteriorSeed, 2654435768)
  for (const seed of [-1, 2, 37, null, undefined]) assert.throws(() => nativePlan(seed))
})
test('strict Anima image envelope rejects unsupported stages/modes, metadata exceptions and foreign inputs', () => {
  for (const [label, mutate] of [
    [
      'wrongstage',
      (v) => {
        v.stage = 'control'
      },
    ],
    [
      'wrongmode',
      (v) => {
        v.mode = 'txt2img'
      },
    ],
    [
      'wrongprofile',
      (v) => {
        v.profile = 'anima-dynamic-batch'
      },
    ],
    [
      'unknownobjective',
      (v) => {
        v.objective = 'epsilon'
      },
    ],
    [
      'unknownpolicy',
      (v) => {
        v.seedBehavior = 'per-prompt'
      },
    ],
    [
      'undeclaredmutation',
      (v) => {
        v.mutation = { module: 'anima_euler.py' }
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
      'exceptions',
      (v) => {
        v.baseline.allowedMetadataDifferences = ['seedBehavior']
      },
    ],
    [
      'foreignsource',
      (v) => {
        v.sourceImage.path = '/tmp/source.png'
      },
    ],
    [
      'unverifiedsource',
      (v) => {
        v.sourceImage.sha256 = 'invalid'
      },
    ],
    [
      'overlapworker',
      (v) => {
        v.workerBaseline.path = v.artifacts + '/worker.json'
      },
    ],
  ]) {
    const fixture = envelope('prefix')
    mutate(fixture)
    assert.throws(() => validate(fixture), undefined, label)
  }
  assert.throws(() =>
    validate({ ...envelope(), lamaSource: envelope('baseline', 'outpaint').lamaSource }),
  )
  const out = envelope('baseline', 'outpaint')
  delete out.lamaSource
  assert.throws(() => validate(out))
})
test('independent DTO providers preserve the foundation defaults and every unprojected field', async () => {
  const reference = installedFixture(),
    actual = await produced(reference, 'baseline', 'img2img')
  const item = literal('baseline', 'img2img').items[1],
    frozen = JSON.parse(actual.rows[1].frozen_payload_json)
  const seen = []
  const validateItem = (value) => {
    seen.push('item')
    assert.deepEqual(value, item)
  }
  const options = {
    assertExpectedItem: validateItem,
    nativePlanForSeed: (seed) => {
      seen.push('plan')
      return nativePlan(seed)
    },
  }
  assertFrozen(frozen, item, reference)
  assertFrozen(frozen, item, reference, options)
  assert.deepEqual(seen, ['item', 'plan'])
  assertConfiguration(actual.configs[1], item, reference, { assertExpectedItem: validateItem })
  const wrong = structuredClone(frozen)
  wrong.workerJob.model.vae.sha256 = '9'.repeat(64)
  assert.throws(() => assertFrozen(wrong, item, reference, options))
  const portable = structuredClone(actual.configs[1])
  portable.positivePrompt.compiled = item.compiledPrompts.positive
  assert.throws(() =>
    assertConfiguration(portable, item, reference, { assertExpectedItem: validateItem }),
  )
  assert.throws(() => assertFrozen(frozen, { ...item, seed: 2 }, reference), /tuple membership/)
  assert.throws(
    () =>
      assertConfiguration(actual.configs[1], { ...item, seedBehavior: 'per-prompt' }, reference),
    /tuple membership/,
  )
  assert.throws(() =>
    assertFrozen(frozen, item, reference, {
      assertExpectedItem: validateItem,
      nativePlanForSeed: (seed) => ({ ...nativePlan(seed), posteriorSeed: 37 }),
    }),
  )
})
for (const mode of ['img2img', 'outpaint'])
  test(`${mode}: actual Main raw/compiled branches and clipped Euler plans pass full structural oracle`, async () => {
    const reference = installedFixture()
    const full = await produced(reference, 'baseline', mode)
    const selected = await produced(reference, 'prefix', mode)
    const fullPlan = literal('baseline', mode),
      prefixPlan = literal('prefix', mode)
    for (const [actual, plan] of [
      [full, fullPlan],
      [selected, prefixPlan],
    ]) {
      assert.deepEqual(resolve(plan, actual.rows), plan)
      for (const [index, row] of actual.rows.entries()) {
        const frozen = JSON.parse(row.frozen_payload_json),
          item = plan.items[index]
        assertFrozen(frozen, item, reference)
        assertConfiguration(actual.configs[index], item, reference)
        assert.deepEqual(frozen.workerJob.prompts, item.compiledPrompts)
        assert.equal(Object.hasOwn(actual.configs[index].positivePrompt, 'compiledPrompts'), false)
        assert.equal(Object.hasOwn(actual.configs[index], 'compiledPrompts'), false)
        for (const [label, mutate] of [
          [
            'wrongconcretepositive',
            (v) => {
              v.context.prompts.positive = 'late current positive'
            },
          ],
          [
            'wrongconcretenegative',
            (v) => {
              v.context.prompts.negative = 'late current negative'
            },
          ],
          [
            'wrongcleanednegative',
            (v) => {
              v.workerJob.prompts.negative.cleanedText = 'late negative'
            },
          ],
          [
            'wrongpositiveweight',
            (v) => {
              v.workerJob.prompts.positive.spans[1].weight = 1
            },
          ],
          [
            'wrongnegativeoffset',
            (v) => {
              v.workerJob.prompts.negative.spans[0].end--
            },
          ],
          [
            'wrongversion',
            (v) => {
              v.workerJob.prompts.positive.version = 'other-weighting-version'
            },
          ],
          [
            'wrongcontextseed',
            (v) => {
              v.context.sampling.seed = 37
            },
          ],
          [
            'wrongworkerseed',
            (v) => {
              v.workerJob.sampling.seed = 37
            },
          ],
          [
            'wrongposterior',
            (v) => {
              v.workerJob.sampling.posteriorSeed = 37
            },
          ],
          [
            'wrongstepseed',
            (v) => {
              v.workerJob.sampling.stepSeed = 37
            },
          ],
          [
            'wronggrid',
            (v) => {
              v.workerJob.sampling.sigmas[0] = 0.6
            },
          ],
          [
            'wrongstepcount',
            (v) => {
              v.workerJob.sampling.totalSteps = 3
            },
          ],
          [
            'wrongbeginIndex',
            (v) => {
              v.workerJob.sampling.beginIndex = 0
            },
          ],
          [
            'wrongstrength',
            (v) => {
              v.context.sampling.denoisingStrength = 0.75
            },
          ],
          [
            'wrongresource',
            (v) => {
              v.workerJob.model.qwen3Encoder.sha256 = '9'.repeat(64)
            },
          ],
          [
            'wrongLoRAweight',
            (v) => {
              v.workerJob.loras[0].weight = 0.5
            },
          ],
          [
            'lostsource',
            (v) => {
              v.workerJob.target.sha256 = '9'.repeat(64)
            },
          ],
          [
            'wrongbehavior',
            (v) => {
              v.context.sampling.seedBehavior = 'per-prompt'
            },
          ],
        ]) {
          const wrong = structuredClone(frozen)
          mutate(wrong)
          assert.throws(() => assertFrozen(wrong, item, reference), undefined, label)
          assert.notDeepEqual(normalize(wrong), normalize(frozen), label)
        }
        const method = structuredClone(frozen)
        method.context.sampling.animaMethod = 'heun'
        method.workerJob.sampling.scheduler = 'heun'
        assert.throws(() => assertFrozen(method, item, reference))
        assert.throws(() => normalize(method))
        for (const mutate of [
          (v) => {
            v.positivePrompt.text = 'late weighted edit'
          },
          (v) => {
            v.negativePrompt.embeddingRefs = [{ token: '<unsupported>' }]
          },
          (v) => {
            v.sampling.actualSeed = 37
          },
          (v) => {
            v.sampling.animaMethod = 'heun'
          },
          (v) => {
            v.compiledPrompts = item.compiledPrompts
          },
        ]) {
          const wrong = structuredClone(actual.configs[index])
          mutate(wrong)
          assert.throws(() => assertConfiguration(wrong, item, reference))
        }
        assert.throws(
          () => assertFrozen(frozen, { ...item, iteration: 7 }, reference),
          /tuple membership/,
        )
        if (mode === 'outpaint') {
          for (const mutate of [
            (v) => {
              v.context.conditioning.keepMask.sha256 = '9'.repeat(64)
            },
            (v) => {
              v.context.conditioning.infillResource.sha256 = '9'.repeat(64)
            },
            (v) => {
              v.context.conditioning.policy.fadeDistance = 8
            },
          ]) {
            const wrong = structuredClone(frozen)
            mutate(wrong)
            assert.throws(() => assertFrozen(wrong, item, reference))
            assert.notDeepEqual(normalize(wrong), normalize(frozen))
          }
        }
      }
    }
    for (const [index, row] of selected.rows.entries())
      assert.deepEqual(
        normalize(JSON.parse(row.frozen_payload_json)),
        normalize(JSON.parse(full.rows[index].frozen_payload_json)),
      )
    const fixture = envelope('prefix', mode),
      baseline = retainedBaseline(full, fullPlan)
    assertBaseline({ baseline, fixture, plan: prefixPlan, reference })
    for (const [label, mutate] of [
      [
        'wrongmode',
        (v) => {
          v.literalPlan.mode = mode === 'img2img' ? 'outpaint' : 'img2img'
        },
      ],
      [
        'unclosedproducer',
        (v) => {
          v.nativePhysicalExit.confirmed = false
        },
      ],
      [
        'lostsource',
        (v) => {
          v.savedPackage.sourceLayers = 0
        },
      ],
      [
        'wrongcursor',
        (v) => {
          v.savedPackage.lastActualSeedSnapshot = 0
        },
      ],
      [
        'unaccepted',
        (v) => {
          v.generations[7].accepted = false
        },
      ],
      [
        'wrongcomparisonowner',
        (v) => {
          v.comparisons[7].queueItemId = v.comparisons[0].queueItemId
        },
      ],
      [
        'mutatingcomparison',
        (v) => {
          v.comparisons[0].readOnly = false
        },
      ],
      [
        'wronglastrecipe',
        (v) => {
          v.generations[7].provenance.generationConfiguration.sampling.actualSeed = 0
        },
      ],
    ]) {
      const wrong = structuredClone(baseline)
      mutate(wrong)
      assert.throws(
        () => assertBaseline({ baseline: wrong, fixture, plan: prefixPlan, reference }),
        undefined,
        label,
      )
    }
    for (const [actual, plan] of [
      [full, fullPlan],
      [selected, prefixPlan],
    ]) {
      const pixels = pixelGenerations(actual, plan),
        evidence = assertPixels(pixels, plan)
      const comparisons =
        evidence.iterationSeed.length +
        evidence.positiveAlternatives.length +
        evidence.negativeAlternatives.length +
        evidence.combinedAlternatives.length
      assert.equal(comparisons, plan.stage === 'baseline' ? 16 : 1)
      assert.equal(evidence.scalarWeightCausalityClaim, false)
      assert.equal(evidence.tensorDirectionClaim, false)
      for (const mutate of [
        (v) => {
          v[1].rgba = Buffer.from(v[0].rgba)
        },
        (v) => {
          v[1].rgba[3] = v[0].rgba[3] ? 0 : 255
        },
        (v) => {
          v[1].frozen.context.target.sha256 = '9'.repeat(64)
        },
        (v) => {
          v.reverse()
        },
      ]) {
        const wrong = structuredClone(pixels)
        mutate(wrong)
        assert.throws(() => assertPixels(wrong, plan))
      }
    }
  })
