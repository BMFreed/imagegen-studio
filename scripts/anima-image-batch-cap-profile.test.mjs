/** Actual DI/driver guards and Main DTOs; proc/systemd, DOM/report/pixel values are explicit peers. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { animaDynamicImageProfile as image } from './anima-dynamic-image-profile.mjs'
import { generationBatchCapProfile as cap } from './generation-batch-cap-profile.mjs'
import { animaImageBatchCapProfile as profile } from './anima-image-batch-cap-profile.mjs'
import { literalAnimaImageBatchCapPlan as literal } from './anima-image-batch-cap-qualification.mjs'
import {
  createInstalledDynamicBatchDeadlineBounds,
  invokeComparisonAdapter,
  shouldCompareCompletionBaseline,
} from './installed-dynamic-batch-driver.mjs'
import {
  authoring,
  comparisonInput,
  envelope,
  generations,
  installedFixture,
  produced,
} from './anima-image-batch-cap-test-fixtures.mjs'

test('Anima cap DI keeps real image/durable hooks and exact current-source preview/notice/refusal boundaries', async () => {
  for (const key of [
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
    assert.equal(profile[key], image[key])
  for (const key of ['assertPreview', 'assertQueuedNotice', 'authorSeed'])
    assert.equal(profile[key], cap[key])
  for (const source of [
    ...image.sourceDependencies,
    image.adapterSource,
    image.oracleSource,
    ...cap.sourceDependencies,
    cap.adapterSource,
    cap.oracleSource,
  ])
    assert.ok(profile.sourceDependencies.includes(source))
  assert.equal(profile.beforeAdmission, undefined, 'Fixed0 installs no Random observer.')
  assert.deepEqual(profile.baselineSourceChanges(), [])
  assert.equal(profile.completionTimeoutMs(), 1_600_000)
  assert.equal(await profile.afterCompletions({ fixture: envelope('prefix') }), undefined)
  const reference = installedFixture()
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['boundary', 'prefix']) {
      const fixture = envelope(stage, mode),
        plan = profile.validateFixture(fixture),
        draft = authoring(reference, stage, mode)
      profile.assertAuthored(draft, reference, fixture, plan)
      assert.equal(profile.sampling(fixture).code, 'euler')
      assert.equal(profile.provisionalOnly(fixture), false)
      assert.equal(profile.expectedBaselineStage(fixture), 'boundary')
      assert.deepEqual(
        profile.baselineMetadataDifferences(fixture),
        stage === 'prefix' ? ['seedBehavior'] : [],
      )
      for (const expectedItem of plan.items)
        assert.equal(shouldCompareCompletionBaseline(profile, fixture, expectedItem), true)
      for (const mutate of [
        (v) => {
          v.seed.value = 37
        },
        (v) => {
          v.seed.policy = 'reuse'
        },
        (v) => {
          v.dynamicPrompt.maxPrompts = 1
        },
        (v) => {
          v.dynamicPrompt.seedBehavior = stage === 'boundary' ? 'per-prompt' : 'per-iteration'
        },
        (v) => {
          v.loras[0].weight = 0.5
        },
        (v) => {
          v.vaePrecision = 'FP16'
        },
        (v) => {
          v.positivePrompt.text = 'substituted prompt'
        },
        (v) => {
          v.negativePrompt.embeddingRefs = [{ token: '<unsupported>' }]
        },
        (v) => {
          v.model.fileSha256 = '9'.repeat(64)
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

// Actual driver -> actual launcher/native guards, with only OS observation/commands doubled.
// Replacing either driver forwarding option with1800 must RED boundary; ordinary prefix is GREEN.
let nextPid = 985_000_000
for (const [stage, expectedSeconds] of [
  ['boundary', 2700],
  ['prefix', 1800],
])
  test(`Anima ${stage} forwards its captured ${expectedSeconds}s allowance to launcher and native guards`, async () => {
    const fixture = { stage },
      bounded = createInstalledDynamicBatchDeadlineBounds(profile, fixture)
    assert.equal(bounded.seconds, expectedSeconds)
    assert.equal(Object.isFrozen(bounded), true)
    fixture.stage = stage === 'boundary' ? 'prefix' : 'boundary'
    const launcherPid = nextPid++,
      launcherGroup =
        '/user.slice/user-1000.slice/user@1000.service/app.slice/anima-cap-launcher.service'
    const launcherFiles = new Map([
      [`/proc/${launcherPid}/cgroup`, `0::${launcherGroup}\n`],
      [`/sys/fs/cgroup${launcherGroup}/memory.max`, '2147483648'],
      [`/sys/fs/cgroup${launcherGroup}/memory.swap.max`, '0'],
    ])
    const launcher = await bounded.launcher({
      pid: launcherPid,
      maxRuntimeSeconds: 1,
      read: async (filename) => {
        assert.ok(
          launcherFiles.has(filename),
          'Only declared launcher observations may be consumed.',
        )
        return launcherFiles.get(filename)
      },
      exec: async (program, args) => {
        assert.equal(program, 'systemctl')
        assert.ok(args.includes('show') && args.includes('--property=RuntimeMaxUSec'))
        return { stdout: `ControlGroup=${launcherGroup}\nRuntimeMaxUSec=${expectedSeconds}s\n` }
      },
    })
    assert.equal(launcher.runtimeMaxSeconds, expectedSeconds)
    assert.equal(launcher.memoryMax, '2147483648')
    assert.equal(launcher.swapMax, '0')
    const nativePid = nextPid++,
      nativeGroup = `/user.slice/user-1000.slice/user@1000.service/app.slice/app-imagegen\\x2dstudio-${nativePid}.scope`
    const commands = [],
      nativeFiles = new Map([
        [`/proc/${nativePid}/stat`, `${nativePid} (electron) S ${'0 '.repeat(18)}123456 0`],
        [`/proc/${nativePid}/status`, 'PPid:\t1\n'],
        [`/proc/${nativePid}/cgroup`, `0::${nativeGroup}\n`],
        [`/sys/fs/cgroup${nativeGroup}/memory.max`, '12884901888'],
        [`/sys/fs/cgroup${nativeGroup}/memory.swap.max`, '0'],
        [`/sys/fs/cgroup${nativeGroup}/memory.peak`, '62345678'],
      ])
    const native = await bounded.native(nativePid, {
      deadlineSeconds: 1,
      entries: async () => [String(nativePid)],
      read: async (filename) => {
        assert.ok(nativeFiles.has(filename), 'Only declared native observations may be consumed.')
        return nativeFiles.get(filename)
      },
      execute: async (program, args) => {
        commands.push({ program, args })
        return { stdout: args.includes('show') ? `${nativeGroup}\n` : '' }
      },
    })
    assert.equal(native.ownedScopeDeadlineSeconds, expectedSeconds)
    assert.equal(native.memoryCeilingPerGroup, 12 * 1024 ** 3)
    assert.equal(native.zeroSwap, true)
    const timers = commands.filter(({ program }) => program === 'systemd-run')
    assert.equal(timers.length, 1)
    assert.ok(timers[0].args.includes(`--on-active=${expectedSeconds}s`))
    assert.ok(
      commands.some(
        ({ args }) => args.includes('MemoryMax=12G') && args.includes('MemorySwapMax=0'),
      ),
    )
    assert.equal(
      commands.some(({ args }) => args.includes('kill') || args.includes('stop')),
      false,
    )
  })

test('Anima confirmed33 wrapper rejects a missing imported source before public Generate', async () => {
  let generated = false
  const context = {
    fixture: envelope('boundary'),
    plan: literal('boundary', 'img2img'),
    project: { id: 'declared-project' },
    report: {},
    expect: {
      poll: (read) => ({ toEqual: async (value) => assert.deepEqual(await read(), value) }),
    },
    window: {
      getByRole: (role) => ({
        fill: async () => assert.equal(role, 'textbox'),
        click: async () => {
          generated = true
          assert.fail('Missing source must refuse before Generate.')
        },
      }),
    },
    tab: async () => ({
      generationDraft: { dynamicPrompt: { maxPrompts: 1, seedBehavior: 'per-iteration' } },
    }),
    setDynamic: async () => {},
    setInput: async () => {},
    save: async () => {},
    runtimeUsers: async () => [],
    checkpoint: async () => {},
    captureAdmissionEffects: async () => ({
      proof: { projectCandidateCount: 32, layerCount: 0 },
      effects: {
        tab: { layers: [], generationDraft: { seed: { policy: 'fixed', value: 0 } } },
        results: {
          candidates: Array.from({ length: 32 }, (_, index) => ({
            candidateId: `candidate-${index}`,
          })),
        },
      },
    }),
  }
  await assert.rejects(
    () => profile.afterCompletions(context),
    (error) => {
      assert.equal(error.actual, 0)
      assert.equal(error.expected, 1)
      return true
    },
  )
  assert.equal(generated, false)
  assert.equal(context.report.refusal33.unchanged, false)
})

test('all76 owning comparisons bind actual Main seeds/raw weighted text against separate later draft edits', async () => {
  const reference = installedFixture()
  let count = 0
  for (const mode of ['img2img', 'outpaint'])
    for (const stage of ['boundary', 'prefix']) {
      const fixture = envelope(stage, mode),
        plan = literal(stage, mode),
        draft = authoring(reference, stage, mode)
      const actual = await produced(reference, stage, mode)
      const resolved = profile.resolveAdmissionPlan({ plan, admitted: actual.rows }).plan
      assert.deepEqual(resolved, plan)
      for (const [index, row] of actual.rows.entries()) {
        profile.assertFrozen(JSON.parse(row.frozen_payload_json), plan.items[index], reference)
        profile.assertConfiguration(actual.configs[index], plan.items[index], reference)
        const peer = comparisonInput({ fixture, reference, plan, draft }, index),
          { fixture: active, ...inputs } = peer.context
        const evidence = await invokeComparisonAdapter(profile, active, inputs)
        assert.deepEqual(evidence['seed.actual'].values, [String(plan.items[index].seed), '37'])
        assert.equal(evidence['seed.policy'].status, 'Same')
        assert.equal(evidence['seed.behavior'].status, 'Changed')
        count++
        if (index === 0) {
          const wrongItem = structuredClone(plan.items[index])
          wrongItem.seed = 37
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
    }
  assert.equal(count, 76)
})

test('summary accepts only exact accepted32/6 stacks, zero-loss refusal and six own prefix bindings', async () => {
  const reference = installedFixture()
  for (const stage of ['boundary', 'prefix']) {
    const fixture = envelope(stage),
      plan = literal(stage, 'img2img'),
      actual = await produced(reference, stage, 'img2img')
    const report = {
      generations: generations(actual, plan, true),
      savedPackage: {
        acceptedLayers: plan.expectedCompletions,
        sourceLayers: 1,
        totalLayers: plan.expectedCompletions + 1,
        reopened: true,
        lastActualSeedSnapshot: stage === 'boundary' ? 7 : 5,
      },
      ...(stage === 'boundary'
        ? {
            refusal33: {
              unchanged: true,
              before: { projectCandidateCount: 32, layerCount: 1 },
              after: { projectCandidateCount: 32, layerCount: 1 },
              ui: {
                reviewCount: 32,
                mainStateObservation: { value: { error: { code: 'BATCH_TOO_LARGE' } } },
              },
            },
          }
        : {}),
    }
    if (stage === 'prefix')
      for (const generation of report.generations)
        generation.baseline = {
          ...fixture.baseline,
          beforeExplicitAdd: true,
          allowedMetadataDifferences: ['seedBehavior'],
          expectedPixelSha256: generation.dimensions.pixelSha256,
          actualPixelSha256: generation.dimensions.pixelSha256,
        }
    const claims = profile.summaryClaims({ fixture, plan, report })
    assert.equal(claims.max32InferenceClaim, stage === 'boundary')
    assert.equal(claims.boundedTruncationClaim, stage === 'prefix')
    assert.equal(claims.preservedResultsOn33RefusalClaim, stage === 'boundary')
    for (const key of [
      'fullMvpClaim',
      'exactRawPreviewClaim',
      'compiledPromptPortableClaim',
      'imageReuseClaim',
      'randomClaim',
      'uint32WrapClaim',
      'scalarWeightCausalityClaim',
      'qualityClaim',
    ])
      assert.equal(claims[key], false)
    for (const mutate of [
      (v) => {
        v.generations.pop()
      },
      (v) => {
        v.generations[0].accepted = false
      },
      (v) => {
        v.generations[0].provenance.generationConfiguration.sampling.actualSeed = 37
      },
      (v) => {
        v.savedPackage.lastActualSeedSnapshot = 0
      },
      (v) => {
        v.savedPackage.totalLayers--
      },
      (v) => {
        v.savedPackage.reopened = false
      },
      ...(stage === 'boundary'
        ? [
            (v) => {
              v.refusal33.after.projectCandidateCount = 31
            },
            (v) => {
              v.refusal33.after.layerCount = 0
            },
            (v) => {
              v.refusal33.ui.reviewCount = 31
            },
            (v) => {
              v.refusal33.ui.mainStateObservation.value.error.code = 'RUNTIME_NOT_READY'
            },
          ]
        : [
            (v) => {
              v.generations[0].baseline.reportPath = '/wrong-own-control'
            },
            (v) => {
              v.generations[0].baseline.allowedMetadataDifferences = ['seedBehavior', 'seed']
            },
            (v) => {
              v.generations[0].baseline.beforeExplicitAdd = false
            },
            (v) => {
              v.generations[0].baseline.actualPixelSha256 = '9'.repeat(64)
            },
          ]),
    ]) {
      const wrong = structuredClone(report)
      mutate(wrong)
      assert.throws(() => profile.summaryClaims({ fixture, plan, report: wrong }))
    }
  }
})
