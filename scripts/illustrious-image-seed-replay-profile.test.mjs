/** Actual adapter/helper invocations; retained-report/UI/decoded-pixel doubles, no Electron claim. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  invokeBaselineAdapter,
  invokeComparisonAdapter,
} from './installed-dynamic-batch-driver.mjs'
import { generationSeedBoundaryProfile as seeds } from './generation-seed-boundary-profile.mjs'
import { illustriousDynamicImageProfile as image } from './illustrious-dynamic-image-profile.mjs'
import { illustriousImageSeedReplayProfile as profile } from './illustrious-image-seed-replay-profile.mjs'
import {
  assertIllustriousImageSeedReplayPixels,
  literalIllustriousImageSeedReplayPlan,
  resolveIllustriousImageSeedReplayPlan,
} from './illustrious-image-seed-replay-qualification.mjs'
import {
  authoring,
  envelope,
  installedFixture,
  lateAuthoring,
} from './illustrious-image-seed-replay-test-fixtures.mjs'

function retainedRandom(objective, mode, base = 37) {
  const initial = literalIllustriousImageSeedReplayPlan('random', objective, mode)
  const rows = initial.items.map((item, index) => ({
    id: `queue-${index}`,
    frozen: {
      context: {
        sampling: {
          seed: (base + index) % 4294967296,
          requestedSeedPolicy: 'random',
          seedBehavior: 'per-prompt',
        },
      },
      workerJob: { sampling: { seed: (base + index) % 4294967296 } },
    },
  }))
  const plan = resolveIllustriousImageSeedReplayPlan(initial, rows)
  return {
    status: 'passed',
    profile: 'illustrious-image-seed-replay',
    stage: 'random',
    objective,
    resolvedPlan: plan,
    nativePhysicalExit: { confirmed: true },
    seedAdmissionObservation: {
      producer: 'Main node:crypto.randomBytes(4).readUInt32LE(0)',
      outputSubstitution: false,
      originalIdentityRestored: true,
      firstAdmittedQueueItemId: 'queue-0',
      calls: [{ seed: base, argumentCount: 1, byteSize: 4, synchronous: true }],
    },
    savedPackage: {
      acceptedLayers: 8,
      sourceLayers: 1,
      totalLayers: 9,
      reopened: true,
      lastActualSeedSnapshot: plan.items.at(-1).seed,
    },
    admissions: rows.map((row) => ({ row })),
    generations: rows.map((row, index) => ({
      queueItemId: row.id,
      expectedItem: plan.items[index],
      frozen: row.frozen,
      row: { status: 'completed' },
      accepted: true,
      provenance: {
        generationConfiguration: {
          sampling: { requestedSeedPolicy: 'random', actualSeed: plan.items[index].seed },
        },
      },
    })),
    comparisons: rows.map(({ id }) => ({ queueItemId: id, readOnly: true })),
  }
}

test('image replay adapter preserves real import/worker/Add/Save hooks and original crypto observer', async () => {
  await invokeBaselineAdapter(image, {})
  for (const key of [
    'prepareInput',
    'assertTarget',
    'assertOutput',
    'extraInputFiles',
    'afterAcceptance',
    'assertSaved',
    'authorComponents',
  ])
    assert.equal(profile[key], image[key])
  for (const key of [
    'beforeAdmission',
    'afterAdmission',
    'restoreAdmissionObservation',
    'authorSeed',
  ])
    assert.equal(profile[key], seeds[key])
  for (const stage of ['random', 'replay'])
    for (const objective of ['epsilon', 'v_prediction'])
      for (const mode of ['img2img', 'outpaint']) {
        const fixture = envelope(stage, objective, mode, 37)
        const plan = profile.validateFixture(fixture)
        const reference = installedFixture()
        const draft = authoring(
          reference,
          objective,
          mode,
          stage === 'random' ? 'random' : 'fixed',
          stage === 'random' ? null : 37,
        )
        profile.assertAuthored(draft, reference, fixture, plan)
        profile.assertEdited(lateAuthoring(reference, objective, mode), reference, fixture)
        assert.equal(
          profile.modelKey(fixture),
          objective === 'epsilon' ? 'illustriousEpsilon' : 'illustrious',
        )
        assert.equal(profile.sampling(fixture).value, objective === 'epsilon' ? 'Euler a' : 'Euler')
        assert.equal(profile.operation(fixture), `illustrious-${mode}`)
        assert.equal(profile.inferenceSteps(fixture), 3)
        assert.equal(profile.observedSteps(fixture), 2)
        assert.equal(profile.provisionalOnly(fixture), false)
        assert.equal(profile.expectedBaselineStage(fixture), 'random')
        assert.deepEqual(profile.baselineSourceChanges(fixture), [])
        assert.deepEqual(profile.baselineMetadataDifferences(fixture), ['requestedSeedPolicy'])
        assert.ok(
          plan.items.every((expectedItem) =>
            profile.shouldCompareBaseline({ fixture, expectedItem }),
          ),
        )
        assert.ok(!profile.comparisonChanged(fixture).includes('seed.actual'))
        assert.ok(!profile.comparisonSame(fixture).includes('seed.policy'))
        if (stage === 'replay') {
          const application = {
            evaluate: async () => assert.fail('Fixed replay does not install the Random observer.'),
          }
          assert.equal(await profile.beforeAdmission({ application, fixture }), undefined)
          assert.equal(
            await profile.afterAdmission({ application, fixture, handle: undefined }),
            undefined,
          )
        }
        for (const mutate of [
          (v) => {
            v.seed.policy = stage === 'random' ? 'fixed' : 'random'
          },
          (v) => {
            v.seed.value = 0
          },
          (v) => {
            v.dynamicPrompt.seedBehavior = 'per-iteration'
          },
          (v) => {
            v.loras[0].weight = -0.25
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

test('real baseline helper rejects a wrong numeric replay and incomplete retained ownership before launch', async () => {
  for (const objective of ['epsilon', 'v_prediction'])
    for (const mode of ['img2img', 'outpaint']) {
      const fixture = envelope('replay', objective, mode, 37)
      const plan = profile.validateFixture(fixture)
      const baseline = retainedRandom(objective, mode)
      await invokeBaselineAdapter(profile, { baseline, fixture, plan })
      for (const mutate of [
        (v) => {
          v.resolvedPlan.baseSeed++
        },
        (v) => {
          v.resolvedPlan.mode = mode === 'outpaint' ? 'img2img' : 'outpaint'
        },
        (v) => {
          v.seedAdmissionObservation.calls[0].seed++
        },
        (v) => {
          v.seedAdmissionObservation.calls.push(v.seedAdmissionObservation.calls[0])
        },
        (v) => {
          v.seedAdmissionObservation.outputSubstitution = true
        },
        (v) => {
          v.seedAdmissionObservation.originalIdentityRestored = false
        },
        (v) => {
          v.generations[1].expectedItem.seed = 37
        },
        (v) => {
          v.generations[1].frozen.workerJob.sampling.seed = 37
        },
        (v) => {
          v.generations[1].provenance.generationConfiguration.sampling.requestedSeedPolicy = 'fixed'
        },
        (v) => {
          v.generations[1].accepted = false
        },
        (v) => {
          v.generations[1].queueItemId = v.generations[0].queueItemId
        },
        (v) => {
          v.comparisons[1].queueItemId = v.generations[0].queueItemId
        },
        (v) => {
          v.nativePhysicalExit.confirmed = false
        },
        (v) => {
          v.savedPackage.reopened = false
        },
        (v) => {
          v.savedPackage.lastActualSeedSnapshot = 37
        },
      ]) {
        const changed = structuredClone(baseline)
        mutate(changed)
        await assert.rejects(invokeBaselineAdapter(profile, { baseline: changed, fixture, plan }))
      }
      const wrong = envelope('replay', objective, mode, 38)
      await assert.rejects(
        invokeBaselineAdapter(profile, {
          baseline,
          fixture: wrong,
          plan: profile.validateFixture(wrong),
        }),
      )
    }
})

function comparison(stage, objective, mode, index, base) {
  const fixture = envelope(stage, objective, mode, base)
  const plan =
    stage === 'random'
      ? retainedRandom(objective, mode, base).resolvedPlan
      : profile.validateFixture(fixture)
  const item = plan.items[index]
  const reference = installedFixture()
  const lora = reference.illustriousLora
  const values = {
    'sampling.invokeScheduler': [item.invokeScheduler, item.invokeScheduler],
    'sampling.sampler': [item.sampler, item.sampler],
    'sampling.scheduler': ['Normal', 'Normal'],
    'context.mode': [mode, 'img2img'],
    'guidance.steps': ['3', '3'],
    'guidance.cfg': ['5', '5'],
    'denoisingStrength.value': ['0.5', '0.5'],
    'seed.actual': [String(item.seed), '37'],
    'seed.policy': [stage === 'random' ? 'random' : 'fixed', 'fixed'],
    'seed.behavior': ['per-prompt', 'per-iteration'],
    'prompt.text': [item.prompts.positive, 'a (green:1.1) glass bowl, later authoring edit'],
    'negativePrompt.text': [item.prompts.negative, '(grainy:0.8), later authoring edit'],
    'prompt.embeddings': ['None', 'None'],
    'negativePrompt.embeddings': ['None', 'None'],
    'loras.stack': [
      `Enabled · ${lora.name} · ${lora.versionName}\nSHA-256 ${lora.sha256}\nWeight -0.5`,
      `Enabled · ${lora.name} · ${lora.versionName}\nSHA-256 ${lora.sha256}\nWeight -0.25`,
    ],
  }
  const rows = Object.fromEntries(
    Object.entries(values).map(([key, values]) => [
      key,
      { key, values, status: values[0] === values[1] ? 'Same' : 'Changed' },
    ]),
  )
  const dialog = {
    locator(selector) {
      const key = /^\[data-setting="([^"]+)"\]$/.exec(selector)?.[1]
      assert.ok(rows[key])
      return {
        ...rows[key],
        locator: () => ({ ...rows[key], allTextContents: async () => rows[key].values }),
      }
    },
  }
  const expect = (row) => ({
    toHaveAttribute: async (name, value) => {
      assert.equal(name, 'data-status')
      assert.equal(row.status, value)
    },
    toHaveText: async (value) => assert.deepEqual(row.values, value),
  })
  return {
    rows,
    fixture,
    inputs: {
      expect,
      dialog,
      generation: { expectedItem: item },
      reference,
      currentDraft: lateAuthoring(reference, objective, mode),
    },
  }
}

test('every Random/Fixed saved comparison owns its seed policy and supports the seed37 coincidence', async () => {
  for (const stage of ['random', 'replay'])
    for (const objective of ['epsilon', 'v_prediction'])
      for (const mode of ['img2img', 'outpaint'])
        for (let index = 0; index < 8; index++) {
          const ctx = comparison(stage, objective, mode, index, 37)
          const proof = await invokeComparisonAdapter(profile, ctx.fixture, ctx.inputs)
          assert.deepEqual(Object.keys(proof).sort(), Object.keys(ctx.rows).sort())
          assert.equal(proof['seed.actual'].status, index === 0 ? 'Same' : 'Changed')
          assert.equal(proof['seed.policy'].status, stage === 'random' ? 'Changed' : 'Same')
        }
  for (const stage of ['random', 'replay'])
    for (const [base, index, status] of [
      [36, 0, 'Changed'],
      [36, 1, 'Same'],
      [0, 0, 'Changed'],
      [4294967295, 0, 'Changed'],
    ]) {
      const ctx = comparison(stage, 'epsilon', 'img2img', index, base)
      const proof = await invokeComparisonAdapter(profile, ctx.fixture, ctx.inputs)
      assert.equal(proof['seed.actual'].status, status)
      assert.equal(proof['seed.policy'].status, stage === 'random' ? 'Changed' : 'Same')
    }
  for (const key of [
    'seed.actual',
    'seed.policy',
    'seed.behavior',
    'prompt.text',
    'negativePrompt.text',
  ]) {
    const ctx = comparison('random', 'epsilon', 'outpaint', 1, 37)
    ctx.rows[key].values[0] = 'wrong frozen value'
    await assert.rejects(invokeComparisonAdapter(profile, ctx.fixture, ctx.inputs))
  }
})

test('pixel oracle measures only four within-pair seed contrasts and rejects hidden-only OUT changes', () => {
  const baseline = retainedRandom('epsilon', 'outpaint', 37)
  const plan = baseline.resolvedPlan
  const generations = baseline.generations.map((generation, index) => {
    const rgba = Buffer.alloc(65536 * 4)
    for (let pixel = 0; pixel < 65536; pixel++) {
      rgba[pixel * 4] = index * 10
      rgba[pixel * 4 + 3] = pixel % 256 >= 168 ? 255 : 0
    }
    const frozen = {
      kind: 'illustrious-outpaint',
      context: {
        sampling: {
          seed: plan.items[index].seed,
          requestedSeedPolicy: 'random',
          seedBehavior: 'per-prompt',
          invokeScheduler: 'euler_a',
          sampler: 'Euler a',
          scheduler: 'Normal',
        },
        prompts: plan.items[index].prompts,
      },
      workerJob: {
        sampling: { seed: plan.items[index].seed, scheduler: 'euler_a' },
        prompts: plan.items[index].prompts,
      },
    }
    return { ...generation, frozen, rgba }
  })
  const proof = assertIllustriousImageSeedReplayPixels(generations, plan)
  assert.equal(proof.iterationSeed.length, 4)
  assert.deepEqual(proof.positiveAlternatives, [])
  assert.deepEqual(proof.negativeAlternatives, [])
  assert.deepEqual(proof.combinedAlternatives, [])
  assert.equal(proof.pairwiseDistinct, false)
  const hiddenOnly = generations.map((generation) => ({
    ...generation,
    rgba: Buffer.from(generation.rgba),
  }))
  hiddenOnly[1].rgba.set(hiddenOnly[0].rgba)
  hiddenOnly[1].rgba[0]++
  assert.throws(() => assertIllustriousImageSeedReplayPixels(hiddenOnly, plan))
  const wrongSeed = structuredClone(generations)
  wrongSeed[1].frozen.workerJob.sampling.seed = 37
  assert.throws(() => assertIllustriousImageSeedReplayPixels(wrongSeed, plan))
})

test('partial stages cannot claim accepted saved replay or broaden the finite installed boundary', () => {
  for (const stage of ['random', 'replay']) {
    const fixture = envelope(stage)
    const baseline = retainedRandom('epsilon', 'img2img')
    const plan = stage === 'random' ? baseline.resolvedPlan : profile.validateFixture(fixture)
    const generations = structuredClone(baseline.generations)
    for (const [index, generation] of generations.entries()) {
      generation.expectedItem = plan.items[index]
      generation.frozen.context.sampling.requestedSeedPolicy = plan.requestedSeedPolicy
      generation.provenance.generationConfiguration.sampling.requestedSeedPolicy =
        plan.requestedSeedPolicy
    }
    const report = { generations, seedAdmissionObservation: baseline.seedAdmissionObservation }
    const claims = profile.summaryClaims({ fixture, plan, report })
    assert.equal(claims.randomClaim, stage === 'random')
    assert.equal(claims.randomNumericReplayClaim, stage === 'replay')
    for (const key of [
      'fullMvpClaim',
      'imageReuseClaim',
      'uint32WrapClaim',
      'max32InferenceClaim',
      'exactRawPreviewClaim',
    ])
      assert.equal(claims[key], false)
    const partial = structuredClone(report)
    partial.generations[1].accepted = false
    assert.throws(() => profile.summaryClaims({ fixture, plan, report: partial }))
  }
})
