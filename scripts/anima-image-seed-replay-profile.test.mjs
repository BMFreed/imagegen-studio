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
  animaImageSeedReplayBaselineSources,
} from './anima-image-seed-replay-qualification.mjs'
import {
  createInstalledDynamicBatchDeadlineBounds,
  invokeBaselineAdapter,
  invokeComparisonAdapter,
  shouldCompareCompletionBaseline,
  invokeCrashLayersAdapter,
  invokeRecoveredInputAdapter,
} from './installed-dynamic-batch-driver.mjs'
import {
  authored,
  comparisonInput,
  generations,
  produced,
  retainedBaseline,
  testBaseSeed,
  envelope,
} from './anima-image-seed-replay-test-fixtures.mjs'
import {
  authoring as recoveryAuthoring,
  produced as recoveryProduced,
} from './anima-image-reuse-crash-main-fixtures.mjs'

test('Random/Fixed image profile injects unchanged entropy/image hooks and keeps all numerical inputs in own references', () => {
  for (const hook of ['beforeAdmission', 'afterAdmission', 'restoreAdmissionObservation'])
    assert.equal(profile[hook], seeds[hook])
  for (const hook of [
    'prepareInput',
    'assertTarget',
    'assertOutput',
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

// Owned lexical descriptors and UI views are disclosed peers; actual rows come from Main fixtures.
function recoveryEnvelope(stage, mode = 'img2img', baseSeed = 31) {
  const fixture = envelope('replay', mode, baseSeed)
  delete fixture.replaySeed
  return {
    ...fixture,
    stage,
    baseSeed,
    artifacts: fixture.artifacts.replace('replay-', `${stage}-`),
    baseline: {
      ...fixture.baseline,
      reportPath: fixture.baseline.reportPath.replace('random-', 'replay-'),
    },
    baselineSourceSnapshots: Object.fromEntries(
      animaImageSeedReplayBaselineSources.map((source) => [
        source,
        {
          path: fixture.referenceFixture.path.replace(
            'reference.json',
            `prior-${source.split('/').at(-1)}`,
          ),
          sha256: 'd'.repeat(64),
        },
      ]),
    ),
    ...(stage === 'reuse'
      ? {
          crashSource: {
            reportPath: fixture.referenceFixture.path.replace(
              'reference.json',
              `crash-${mode}/report.json`,
            ),
            reportSha256: 'e'.repeat(64),
          },
        }
      : {}),
  }
}

test('recovery authoring preserves genuine Reuse policy, delegates ordinary seed inputs and binds three exact historical harness sources', async () => {
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['crash', 'reuse']) {
      const reference = authored().reference,
        fixture = recoveryEnvelope(stage, mode),
        plan = literal(stage, mode, 31),
        draft = recoveryAuthoring(reference, stage, mode, 31)
      profile.assertAuthored(draft, reference, fixture, plan)
      assert.equal(profile.expectedBaselineStage(fixture), 'replay')
      assert.deepEqual(profile.baselineSourceChanges(fixture), animaImageSeedReplayBaselineSources)
      assert.equal(profile.provisionalOnly(fixture), false)
      assert.equal(createInstalledDynamicBatchDeadlineBounds(profile, fixture).seconds, 1800)
      if (stage === 'reuse') {
        await profile.authorSeed({
          currentPlan: plan,
          window: {
            getByRole() {
              assert.fail('Driver alone authors public Reuse; no numeric substitute')
            },
          },
        })
        assert.deepEqual(draft.seed, { policy: 'reuse', value: null })
      } else assert.deepEqual(draft.seed, { policy: 'fixed', value: 31 })
      const wrong = structuredClone(draft)
      wrong.seed = { policy: 'fixed', value: 31 }
      if (stage === 'reuse')
        assert.throws(() => profile.assertAuthored(wrong, reference, fixture, plan))
    }
  // Exercise the reused actual authorSeed body with an explicit DOM peer, without UI claims.
  const state = { seed: { policy: 'fixed', value: 0 } },
    calls = []
  const expect = (node) => ({
    toHaveAttribute: async (attribute, value) => {
      assert.equal(attribute, 'aria-checked')
      assert.equal(await node.getAttribute(), value)
    },
    toBeEnabled: async () => {},
  })
  expect.poll = (read) => ({ toEqual: async (value) => assert.deepEqual(await read(), value) })
  const context = {
    currentPlan: literal('crash', 'img2img', 31),
    window: { getByRole: () => ({ getAttribute: async () => 'false' }), locator: () => ({}) },
    expect,
    tab: async () => ({ generationDraft: state }),
    project: {},
    setInput: async (name, value) => {
      calls.push([name, value])
      state.seed = { policy: 'fixed', value }
    },
  }
  await profile.authorSeed(context)
  assert.deepEqual(calls, [['Generation seed', 31]])
})

test('crash layers keep the ordinary source and current full source view decoder preserves the hidden recovered layer', async () => {
  const fixture = recoveryEnvelope('reuse'),
    plan = literal('reuse', 'img2img', 31)
  const source = {
    id: 'd765a0f5-37af-4399-9db1-2b4044fde758',
    kind: 'raster',
    name: 'Imported source',
    locked: false,
    visible: true,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDegrees: 0 },
    opacity: 1,
    blendMode: 'normal',
    asset: {
      path: 'assets/source.img',
      sha256: 'a'.repeat(64),
      bytes: 47531,
      width: 256,
      height: 256,
    },
    sourceIccProfile: { path: 'profiles/source.icc', sha256: 'b'.repeat(64), bytes: 524 },
  }
  // Two distinct production DTO shapes from RasterLayerSchema and ProjectRasterLayerView.
  const sourceView = {
    id: source.id,
    name: source.name,
    locked: source.locked,
    visible: source.visible,
    transform: structuredClone(source.transform),
    opacity: source.opacity,
    blendMode: source.blendMode,
    width: 256,
    height: 256,
    imageUrl: 'igs-layer://current-source',
  }
  const input = {
    layerId: source.id,
    bbox: plan.bbox,
    source: fixture.sourceImage,
    sourceRect: { x: 0, y: 0, width: 256, height: 256 },
  }
  const crash = {
    layers: [structuredClone(sourceView)],
    sourceLayers: [source],
    plan,
    inputPrecondition: input,
  }
  invokeCrashLayersAdapter(profile, crash)
  assert.equal(Object.hasOwn(sourceView, 'asset'), false)
  assert.equal(Object.hasOwn(sourceView, 'kind'), false)
  assert.equal(Object.hasOwn(source, 'width'), false)
  assert.equal(Object.hasOwn(source, 'imageUrl'), false)
  for (const mutate of [
    (v) => {
      v.layers[0].id = 'other-source'
    },
    (v) => {
      v.layers[0].name = 'Renamed source'
    },
    (v) => {
      v.layers[0].locked = true
    },
    (v) => {
      v.layers[0].width = 255
    },
    (v) => {
      v.layers[0].height = 255
    },
    (v) => {
      v.layers[0].opacity = 0.5
    },
    (v) => {
      v.layers[0].blendMode = 'multiply'
    },
    (v) => {
      v.sourceLayers[0].kind = 'smart-patch'
    },
    (v) => {
      v.sourceLayers[0].generationProvenance = {}
    },
    (v) => {
      v.layers[0].visible = false
    },
    (v) => {
      v.layers[0].transform.x = 1
    },
    (v) => {
      v.layers.push(v.layers[0])
    },
  ]) {
    const wrong = structuredClone(crash)
    mutate(wrong)
    assert.throws(() => invokeCrashLayersAdapter(profile, wrong))
  }
  const current = {
      layers: [{ id: 'recovered', visible: false }, structuredClone(sourceView)],
      primaryBbox: plan.bbox,
      generationDraft: { sampling: { denoisingStrength: 0.5 } },
    },
    seen = []
  const ctx = {
    fixture,
    plan,
    sourceLayers: [source],
    crashSource: {
      stage: 'crash',
      literalPlan: literal('crash', 'img2img', 31),
      inputPrecondition: input,
    },
    project: {},
    tab: async () => current,
    window: {
      evaluate: async (_body, url) => {
        seen.push(url)
        return { width: 256, height: 256, pixelSha256: fixture.sourceImage.pixelSha256 }
      },
    },
    expect: { poll: (read) => ({ toBe: async (value) => assert.equal(await read(), value) }) },
  }
  const result = await invokeRecoveredInputAdapter(profile, ctx)
  assert.deepEqual(result, input)
  assert.deepEqual(seen, [sourceView.imageUrl])
  assert.equal(current.layers[0].visible, false)
  for (const mutate of [
    (v) => {
      v.layers[0].visible = true
    },
    (v) => {
      v.layers[1].transform.x = 1
    },
    (v) => {
      v.primaryBbox.x = 1
    },
  ]) {
    const wrong = structuredClone(current)
    mutate(wrong)
    await assert.rejects(() =>
      invokeRecoveredInputAdapter(profile, { ...ctx, tab: async () => wrong }),
    )
  }
  await assert.rejects(() =>
    invokeRecoveredInputAdapter(profile, {
      ...ctx,
      window: { evaluate: async () => ({ width: 256, height: 256, pixelSha256: 'f'.repeat(64) }) },
    }),
  )
})

test('reuse batch visibility changes only new variants and keeps original source plus recovered candidate unchanged', async () => {
  const fixture = recoveryEnvelope('reuse'),
    plan = literal('reuse', 'img2img', 31),
    source = { id: 'source', name: 'source', visible: true },
    recovered = { id: 'recovered', name: 'recovered', visible: false }
  let views = [
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `new${index}`,
      name: `new${index}`,
      visible: index === 0,
    })),
    recovered,
    source,
  ]
  const original = structuredClone(views),
    clicked = []
  const ctx = {
    fixture,
    plan,
    sourceLayers: [source],
    recoveredGeneration: { layerId: recovered.id, expectedItem: { stage: 'crash' } },
    project: {},
    tab: async () => ({ layers: views }),
    window: {
      getByRole: (_role, { name }) => ({
        click: async () => {
          clicked.push(name)
          const view = views.find(({ name: layerName }) => name === `Show ${layerName}`)
          assert.ok(view)
          view.visible = true
        },
      }),
    },
    expect: { poll: (read) => ({ toBe: async (value) => assert.equal(await read(), value) }) },
  }
  const evidence = await profile.afterAcceptance(ctx)
  assert.equal(clicked.length, 7)
  assert.equal(evidence.recoveredLayerHidden, true)
  assert.deepEqual(evidence.initialGeneratedVisibleIds, ['new0'])
  assert.deepEqual(views.slice(-2), original.slice(-2))
  views = structuredClone(original)
  views[8].visible = true
  await assert.rejects(() => profile.afterAcceptance(ctx))
})

test('owning Reuse comparisons include the recovered Fixed crash layer and every actual local cursor0/31 branch', async () => {
  for (const mode of ['img2img', 'outpaint'])
    for (const baseSeed of [0, 31]) {
      const old = authored('replay', mode, baseSeed),
        fixture = recoveryEnvelope('reuse', mode, baseSeed),
        scope = {
          ...old,
          fixture,
          draft: recoveryAuthoring(old.reference, 'reuse', mode, baseSeed),
        }
      const actual = await recoveryProduced(old.reference, 'reuse', mode, { baseSeed }),
        plan = literal('reuse', mode, baseSeed)
      for (const item of plan.items) {
        const peer = comparisonInput(scope, item),
          { fixture: active, ...inputs } = peer.context
        const observed = await invokeComparisonAdapter(profile, active, inputs)
        assert.equal(observed['seed.policy'].status, 'Changed')
        assert.equal(observed['seed.actual'].status, item.seed === 37 ? 'Same' : 'Changed')
      }
      const crash = await recoveryProduced(old.reference, 'crash', mode, { baseSeed }),
        item = resolve(literal('crash', mode, baseSeed), crash.rows).items[0]
      const peer = comparisonInput(scope, item),
        { fixture: active, ...inputs } = peer.context
      const observed = await invokeComparisonAdapter(profile, active, inputs)
      assert.equal(observed['seed.policy'].status, 'Same')
      const wrong = structuredClone(actual.rows[0])
      wrong.frozen_payload_json = JSON.stringify({
        ...JSON.parse(wrong.frozen_payload_json),
        context: {
          ...JSON.parse(wrong.frozen_payload_json).context,
          sampling: { ...JSON.parse(wrong.frozen_payload_json).context.sampling, seed: 91 },
        },
      })
      assert.throws(() => resolve(plan, [wrong, ...actual.rows.slice(1)]))
    }
})

test('recovery summaries keep old immutable crash candidate unaccepted until later explicit Add and require exact ten-layer save', async () => {
  const reference = authored().reference,
    baseSeed = 31
  for (const stage of ['crash', 'reuse']) {
    const fixture = recoveryEnvelope(stage, 'img2img', baseSeed),
      plan = literal(stage, 'img2img', baseSeed),
      actual = await recoveryProduced(reference, stage, 'img2img', { baseSeed })
    const all = generations(actual, plan, stage !== 'crash'),
      report = { generations: stage === 'crash' ? all.slice(0, 1) : all }
    for (const generation of report.generations)
      generation.baseline = {
        reportPath: fixture.baseline.reportPath,
        reportSha256: fixture.baseline.reportSha256,
        beforeExplicitAdd: true,
        allowedMetadataDifferences: ['requestedSeedPolicy'],
        actualPixelSha256: generation.dimensions.pixelSha256,
        expectedPixelSha256: generation.dimensions.pixelSha256,
      }
    if (stage === 'crash') {
      report.outcome = 'crash-confirmed'
      report.crash = {
        rows: [{ status: 'completed' }, { status: 'running' }, { status: 'pending' }],
        physicalExit: { confirmed: true },
        savedSnapshot: null,
      }
    } else {
      report.recovery = {
        lastActualSeed: baseSeed,
        recoveredLayerHidden: true,
        portableSnapshot: null,
      }
      report.savedPackage = {
        acceptedLayers: 9,
        sourceLayers: 1,
        totalLayers: 10,
        reopened: true,
        lastActualSeedSnapshot: 38,
      }
    }
    const summary = profile.summaryClaims({ fixture, plan, report })
    assert.equal(summary.acceptedSavedReopenedClaim, stage === 'reuse')
    assert.equal(summary.crashRecoveredReuseClaim, stage === 'reuse')
    for (const mutate of [
      (v) => {
        v.generations[0].accepted = stage === 'crash'
      },
      ...(stage === 'crash'
        ? [
            (v) => {
              v.crash.rows[1].status = 'completed'
            },
            (v) => {
              v.crash.savedSnapshot = 31
            },
          ]
        : [
            (v) => {
              v.savedPackage.totalLayers = 9
            },
            (v) => {
              v.recovery.recoveredLayerHidden = false
            },
            (v) => {
              v.recovery.portableSnapshot = 31
            },
          ]),
    ]) {
      const wrong = structuredClone(report)
      mutate(wrong)
      assert.throws(() => profile.summaryClaims({ fixture, plan, report: wrong }))
    }
  }
})
