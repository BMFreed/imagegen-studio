/** Actual shared completion cache; collectors double only external capture/verification work. */
import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { homedir } from 'node:os'
import {
  assertReferenceSourceLineage,
  awaitVerifiedCompletions,
  awaitVerifiedTerminalFailure,
  createStickyCompletionCache,
  createInstalledDynamicBatchDeadlineBounds,
  expectedInstalledTerminalFailure,
  invokeCrashLayersAdapter,
  invokeComparisonAdapter,
  invokeRecoveredInputAdapter,
  shouldCompareCompletionBaseline,
} from './installed-dynamic-batch-driver.mjs'
import { illustriousImageBatchCapProfile } from './illustrious-image-batch-cap-profile.mjs'
import { illustriousImageSeedWrapProfile } from './illustrious-image-seed-wrap-profile.mjs'

const terminalFailure = {
  code: 'GENERATION_UNET_NON_FINITE',
  message:
    'The UNet produced non-finite values. Review the checkpoint prediction type and noise settings; Retry uses the original settings.',
}
const failurePlan = () => ({
  expectedAdmissions: 1,
  expectedCompletions: 0,
  expectedFailed: 1,
  expectedCanceled: 0,
  items: [{ seed: 0 }],
})

// Production boundary: actual shared driver opt-in/verification helpers.
// Mutation: drop the preservation oracle await or accept an ordinary completion plan as failure.
// Neighbor: ordinary adapters still use the existing completion path and have no failure opt-in.
test('expected terminal failure requires an explicit frozen single-job failure plan before admission', () => {
  const adapter = {
    expectedTerminalFailure: () => terminalFailure,
    assertTerminalFailure: async () => {},
  }
  const expected = expectedInstalledTerminalFailure(
    adapter,
    { stage: 'control' },
    failurePlan(),
    true,
  )
  assert.deepEqual(expected, terminalFailure)
  assert.equal(Object.isFrozen(expected), true)
  assert.notEqual(expected, terminalFailure)
  assert.equal(expectedInstalledTerminalFailure({}, {}, { expectedCompletions: 1 }, false), null)
  assert.equal(
    expectedInstalledTerminalFailure({ expectedTerminalFailure: () => null }, {}, {}, false),
    null,
  )
  for (const changes of [
    { expectedAdmissions: 2 },
    { expectedCompletions: 1 },
    { expectedFailed: 0 },
    { expectedCanceled: 1 },
    { items: [] },
  ])
    assert.throws(() =>
      expectedInstalledTerminalFailure(
        adapter,
        { stage: 'control' },
        { ...failurePlan(), ...changes },
        true,
      ),
    )
  assert.throws(() => expectedInstalledTerminalFailure(adapter, {}, failurePlan(), false))
  assert.throws(() => expectedInstalledTerminalFailure({}, {}, failurePlan(), true))
  for (const stage of ['crash', 'reuse'])
    assert.throws(() => expectedInstalledTerminalFailure(adapter, { stage }, failurePlan(), true))
  for (const expectedTerminalFailure of [undefined, null, false, terminalFailure])
    assert.throws(() =>
      expectedInstalledTerminalFailure(
        { ...adapter, expectedTerminalFailure },
        {},
        failurePlan(),
        true,
      ),
    )
  for (const value of [
    undefined,
    false,
    {},
    { ...terminalFailure, extra: true },
    { ...terminalFailure, code: 'malformed' },
    { ...terminalFailure, message: 'x'.repeat(513) },
  ])
    assert.throws(() =>
      expectedInstalledTerminalFailure(
        { ...adapter, expectedTerminalFailure: () => value },
        {},
        failurePlan(),
        true,
      ),
    )
  assert.throws(() =>
    expectedInstalledTerminalFailure(
      { expectedTerminalFailure: () => terminalFailure },
      {},
      failurePlan(),
      true,
    ),
  )
})

test('the terminal failure boundary waits for actual status then awaits the one preservation oracle', async () => {
  const order = []
  const admitted = [{ id: 'real-admission-id' }]
  let release
  const barrier = new Promise((resolve) => {
    release = resolve
  })
  let settled = false
  const evidence = { queueItemId: admitted[0].id, outcome: 'qualified-terminal-failure' }
  const pending = awaitVerifiedTerminalFailure({
    admitted,
    waitForFailed: async () => {
      order.push('actual-failed-row')
    },
    observeFailed: async (row) => {
      assert.equal(row, admitted[0])
      order.push('preservation-oracle')
      await barrier
      return evidence
    },
  }).then((value) => {
    settled = true
    return value
  })
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(order, ['actual-failed-row', 'preservation-oracle'])
  assert.equal(settled, false)
  release()
  assert.equal(await pending, evidence)
})

test('terminal failure checks preserve exact poll and oracle rejection without completing or accepting', async () => {
  const fault = new Error('wrong durable error or changed accepted source')
  for (const atPoll of [true, false]) {
    let oracleCalls = 0
    await assert.rejects(
      awaitVerifiedTerminalFailure({
        admitted: [{ id: 'real-admission-id' }],
        waitForFailed: async () => {
          if (atPoll) throw fault
        },
        observeFailed: async () => {
          oracleCalls++
          throw fault
        },
      }),
      (error) => error === fault,
    )
    assert.equal(oracleCalls, atPoll ? 0 : 1)
  }
  for (const evidence of [
    undefined,
    null,
    false,
    { queueItemId: 'another-job', outcome: 'qualified-terminal-failure' },
    { queueItemId: 'real-admission-id', outcome: 'completed' },
  ])
    await assert.rejects(
      awaitVerifiedTerminalFailure({
        admitted: [{ id: 'real-admission-id' }],
        waitForFailed: async () => {},
        observeFailed: async () => evidence,
      }),
    )
})

// Only proc/cgroup/systemd observations are doubled. Both guards and actual profile selection run.
// Mutation: replace either forwarded seconds option with1800; the2700 boundary becomes RED while
// the ordinary profile and cap prefix remain GREEN. Inference, apps and signals are not launched.
let nextDeadlinePid = 980_000_000
for (const [adapter, stage, expectedSeconds] of [
  [illustriousImageBatchCapProfile, 'boundary', 2700],
  [illustriousImageBatchCapProfile, 'prefix', 1800],
  [illustriousImageSeedWrapProfile, 'wrap', 1800],
])
  test(`the real driver binds ${stage}/${expectedSeconds}s to launcher readback and every native timer`, async () => {
    const fixture = { stage }
    const bounded = createInstalledDynamicBatchDeadlineBounds(adapter, fixture)
    assert.equal(bounded.seconds, expectedSeconds)
    assert.equal(Object.isFrozen(bounded), true)
    // Later authoring cannot make the native scope disagree with its launcher allowance.
    fixture.stage = 'later-edit'
    const launcherPid = nextDeadlinePid++
    const launcherGroup =
      '/user.slice/user-1000.slice/user@1000.service/app.slice/driver-launcher.service'
    const launcherFiles = new Map([
      [`/proc/${launcherPid}/cgroup`, `0::${launcherGroup}\n`],
      [`/sys/fs/cgroup${launcherGroup}/memory.max`, '2147483648'],
      [`/sys/fs/cgroup${launcherGroup}/memory.swap.max`, '0'],
    ])
    let launcher
    await assert.doesNotReject(async () => {
      launcher = await bounded.launcher({
        pid: launcherPid,
        maxRuntimeSeconds: 1,
        read: async (filename) => {
          assert.ok(
            launcherFiles.has(filename),
            'Only the actual launcher guard reads its declared boundary.',
          )
          return launcherFiles.get(filename)
        },
        exec: async (program, args) => {
          assert.equal(program, 'systemctl')
          assert.ok(args.includes('show'))
          assert.ok(args.includes('--property=RuntimeMaxUSec'))
          return { stdout: `ControlGroup=${launcherGroup}\nRuntimeMaxUSec=${expectedSeconds}s\n` }
        },
      })
    }, 'The actual launcher must accept its selected finite profile allowance.')
    assert.equal(launcher.runtimeMaxSeconds, expectedSeconds)
    assert.equal(launcher.memoryMax, '2147483648')
    assert.equal(launcher.swapMax, '0')
    const nativePid = nextDeadlinePid++
    const nativeGroup = `/user.slice/user-1000.slice/user@1000.service/app.slice/app-imagegen\\x2dstudio-${nativePid}.scope`
    const commands = []
    const nativeFiles = new Map([
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
        assert.ok(
          nativeFiles.has(filename),
          'Only actual native guard boundary observations are provided.',
        )
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
    const timer = commands.filter(({ program }) => program === 'systemd-run')
    assert.equal(timer.length, 1)
    assert.ok(timer[0].args.includes(`--on-active=${expectedSeconds}s`))
    assert.ok(timer[0].args.includes('MemorySwapMax=0'))
    assert.ok(timer[0].args.includes('RuntimeMaxSec=30'))
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

test('driver deadline opt-in rejects malformed or unbounded allowances before any launch', () => {
  assert.equal(createInstalledDynamicBatchDeadlineBounds({}, {}).seconds, 1800)
  for (const value of [0, -1, NaN, Infinity, 2701, 2700.5, '2700', null, undefined])
    assert.throws(
      () =>
        createInstalledDynamicBatchDeadlineBounds(
          { qualificationDeadlineSeconds: () => value },
          {},
        ),
      /qualificationDeadlineSeconds must be a finite positive integer no larger than 2700/,
    )
  for (const value of [null, undefined, false, 2700])
    assert.throws(() =>
      createInstalledDynamicBatchDeadlineBounds({ qualificationDeadlineSeconds: value }, {}),
    )
})

test('recovered image layer assertions receive their actual owner and cannot disappear into TXT defaults', () => {
  const inputs = {
    layers: [{ id: 'source', visible: true }],
    sourceLayers: [{ id: 'source', asset: { sha256: 'a'.repeat(64) } }],
    fixture: { stage: 'reuse' },
    plan: { items: [{ seed: 73 }] },
    reference: { installed: true },
    inputPrecondition: { layerId: 'source' },
  }
  let observed
  invokeCrashLayersAdapter(
    {
      assertCrashLayers: (context) => {
        observed = context
      },
    },
    inputs,
  )
  assert.equal(observed, inputs)
  assert.equal(observed.layers, inputs.layers)
  assert.equal(observed.sourceLayers, inputs.sourceLayers)
  invokeCrashLayersAdapter({}, { layers: [], sourceLayers: [] })
  assert.throws(() => invokeCrashLayersAdapter({}, inputs))
  assert.throws(() =>
    invokeCrashLayersAdapter({}, { layers: [], sourceLayers: inputs.sourceLayers }),
  )
  const changedSource = new Error('original source visibility changed')
  assert.throws(
    () =>
      invokeCrashLayersAdapter(
        {
          assertCrashLayers: () => {
            throw changedSource
          },
        },
        inputs,
      ),
    (error) => error === changedSource,
  )
  for (const value of [undefined, null, false, 'assertion'])
    assert.throws(() => invokeCrashLayersAdapter({ assertCrashLayers: value }, inputs))
  assert.throws(() =>
    invokeCrashLayersAdapter({ assertCrashLayers: () => Promise.resolve() }, inputs),
  )
})

test('recovered input verification is mandatory and awaits its retained source result before proceeding', async () => {
  const inputs = {
    sourceLayers: [{ id: 'source' }],
    crashSource: { inputPrecondition: { layerId: 'source' } },
    project: { id: 'recovered-project' },
  }
  let release
  const barrier = new Promise((resolve) => {
    release = resolve
  })
  let observed
  let finished = false
  const verification = invokeRecoveredInputAdapter(
    {
      prepareRecoveredInput: async (context) => {
        observed = context
        await barrier
        return context.crashSource.inputPrecondition
      },
    },
    inputs,
  ).then((value) => {
    finished = true
    return value
  })
  await Promise.resolve()
  assert.equal(observed, inputs)
  assert.equal(finished, false)
  release()
  assert.equal(await verification, inputs.crashSource.inputPrecondition)
  assert.equal(finished, true)
  const changedTarget = new Error('recovered image target changed')
  await assert.rejects(
    invokeRecoveredInputAdapter(
      {
        prepareRecoveredInput: async () => {
          throw changedTarget
        },
      },
      inputs,
    ),
    (error) => error === changedTarget,
  )
  for (const value of [undefined, null, false, 'verification'])
    await assert.rejects(invokeRecoveredInputAdapter({ prepareRecoveredInput: value }, inputs))
})

test('comparison receives the captured scenario separately from result and current draft inputs', async () => {
  const fixture = { seedBehavior: 'per-prompt' }
  const generation = { expectedItem: { seed: 7 } }
  const currentDraft = { seed: 37 }
  const values = { generation, currentDraft, fixture: { seedBehavior: 'per-iteration' } }
  let observed
  const result = await invokeComparisonAdapter(
    {
      assertComparison: async (context) => {
        observed = context
        return { readOnly: true }
      },
    },
    fixture,
    values,
  )
  assert.deepEqual(result, { readOnly: true })
  assert.equal(observed.fixture, fixture)
  assert.equal(observed.generation, generation)
  assert.equal(observed.currentDraft, currentDraft)
  assert.equal(values.fixture.seedBehavior, 'per-iteration')
  assert.equal(invokeComparisonAdapter({}, fixture, values), undefined)
})

test('historical harness lineage pins prior bytes and refuses native producer drift', () => {
  const harness = 'scripts/installed-dynamic-batch-driver.mjs'
  const producer = 'src/main/projects/generation-orchestrator.ts'
  const prior = { [harness]: 'a'.repeat(64), [producer]: 'b'.repeat(64) }
  const current = { ...prior, [harness]: 'c'.repeat(64) }
  const snapshot = {
    path: path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/lineage/driver.mjs'),
    sha256: prior[harness],
  }
  const snapshots = { [harness]: snapshot }
  assert.deepEqual(assertReferenceSourceLineage(prior, prior), [])
  assert.deepEqual(assertReferenceSourceLineage(prior, current, [harness], snapshots), [
    { source: harness, snapshot, currentSha256: current[harness] },
  ])
  assert.throws(() => assertReferenceSourceLineage(prior, current))
  assert.throws(() =>
    assertReferenceSourceLineage(
      prior,
      { ...current, [producer]: 'd'.repeat(64) },
      [harness],
      snapshots,
    ),
  )
  assert.throws(() => assertReferenceSourceLineage(prior, current, [producer], snapshots))
  assert.throws(() => assertReferenceSourceLineage(prior, current, [harness, harness], snapshots))
  assert.throws(() => assertReferenceSourceLineage(prior, current, [harness], {}))
  assert.throws(() =>
    assertReferenceSourceLineage(prior, current, [harness], {
      [harness]: { ...snapshot, sha256: current[harness] },
    }),
  )
  for (const invalidPath of ['/tmp/driver.mjs', 'driver.mjs', snapshot.path + '/../other.mjs'])
    assert.throws(() =>
      assertReferenceSourceLineage(prior, current, [harness], {
        [harness]: { ...snapshot, path: invalidPath },
      }),
    )
  assert.throws(() =>
    assertReferenceSourceLineage(prior, current, [harness], {
      ...snapshots,
      [producer]: snapshot,
    }),
  )
  assert.throws(() =>
    assertReferenceSourceLineage(prior, { [harness]: current[harness] }, [harness], snapshots),
  )
})

test('image seed replay lineage permits only explicitly pinned profile and oracle changes', () => {
  const profile = 'scripts/illustrious-image-seed-replay-profile.mjs'
  const oracle = 'scripts/illustrious-image-seed-replay-qualification.mjs'
  const producer = 'src/main/projects/project-generation-preparation.ts'
  const prior = {
    [profile]: 'a'.repeat(64),
    [oracle]: 'b'.repeat(64),
    [producer]: 'c'.repeat(64),
  }
  const current = { ...prior, [profile]: 'd'.repeat(64), [oracle]: 'e'.repeat(64) }
  const snapshots = Object.fromEntries(
    [profile, oracle].map((source) => [
      source,
      {
        path: path.join(
          homedir(),
          '.codex/artifacts/imagegen-studio/runs/lineage',
          path.basename(source),
        ),
        sha256: prior[source],
      },
    ]),
  )
  assert.equal(assertReferenceSourceLineage(prior, current, [profile, oracle], snapshots).length, 2)
  assert.throws(() => assertReferenceSourceLineage(prior, current, [profile], snapshots))
  assert.throws(() => assertReferenceSourceLineage(prior, current, [profile, oracle], {}))
  assert.throws(() =>
    assertReferenceSourceLineage(
      prior,
      { ...current, [producer]: 'f'.repeat(64) },
      [profile, oracle],
      snapshots,
    ),
  )
  assert.throws(() =>
    assertReferenceSourceLineage(
      prior,
      { ...current, 'scripts/new-hook.mjs': 'f'.repeat(64) },
      [profile, oracle],
      snapshots,
    ),
  )
})

test('Anima recovery lineage binds both prior harness snapshots without admitting producer drift', () => {
  const sources = [
    'scripts/anima-image-seed-replay-profile.mjs',
    'scripts/anima-image-seed-replay-qualification.mjs',
  ]
  const producer = 'src/main/projects/anima-generation-preparation.ts'
  const prior = Object.fromEntries([...sources, producer].map((source) => [source, 'a'.repeat(64)]))
  const current = {
    ...prior,
    ...Object.fromEntries(sources.map((source) => [source, 'b'.repeat(64)])),
  }
  const snapshots = Object.fromEntries(
    sources.map((source) => [
      source,
      {
        path: path.join(
          homedir(),
          '.codex/artifacts/imagegen-studio/runs/lineage',
          path.basename(source),
        ),
        sha256: prior[source],
      },
    ]),
  )
  assert.equal(assertReferenceSourceLineage(prior, current, sources, snapshots).length, 2)
  assert.throws(() => assertReferenceSourceLineage(prior, current, sources, {}))
  assert.throws(() => assertReferenceSourceLineage(prior, current, sources.slice(0, 1), snapshots))
  assert.throws(() =>
    assertReferenceSourceLineage(
      prior,
      { ...current, [producer]: 'c'.repeat(64) },
      sources,
      snapshots,
    ),
  )
  assert.throws(() =>
    assertReferenceSourceLineage(
      prior,
      { ...current, 'scripts/new-hook.mjs': 'c'.repeat(64) },
      sources,
      snapshots,
    ),
  )
})

test('completion reference opt-in cannot silently replace legacy selection or return truthy values', () => {
  for (const stage of ['baseline', 'control', 'restored'])
    for (const promptPairIndex of [0, 1, 2, 3])
      assert.equal(shouldCompareCompletionBaseline({}, { stage }, { promptPairIndex }), true)
  assert.equal(
    shouldCompareCompletionBaseline({}, { stage: 'reuse' }, { promptPairIndex: 0 }),
    true,
  )
  assert.equal(
    shouldCompareCompletionBaseline({}, { stage: 'reuse' }, { promptPairIndex: 1 }),
    false,
  )
  const fixture = { stage: 'baseline' }
  const expectedItem = { promptPairIndex: 3 }
  let observed
  assert.equal(
    shouldCompareCompletionBaseline(
      {
        shouldCompareBaseline: (inputs) => {
          observed = inputs
          return false
        },
      },
      fixture,
      expectedItem,
    ),
    false,
  )
  assert.equal(observed.fixture, fixture)
  assert.equal(observed.expectedItem, expectedItem)
  for (const value of [undefined, null, 0, 1, 'false', {}, []])
    assert.throws(() =>
      shouldCompareCompletionBaseline(
        { shouldCompareBaseline: () => value },
        fixture,
        expectedItem,
      ),
    )
  for (const value of [undefined, null, false, 0, 'false'])
    assert.throws(() =>
      shouldCompareCompletionBaseline({ shouldCompareBaseline: value }, fixture, expectedItem),
    )
})

test('a retained raw completion cannot clear numerical RED on repeated or concurrent observation', async () => {
  const cache = createStickyCompletionCache()
  const raw = []
  const numericalRed = new Error('same-input pixels differ')
  let verificationCalls = 0
  let release
  const barrier = new Promise((resolve) => {
    release = resolve
  })
  const first = cache.observe('seed-1', async () => {
    raw.push({ accepted: false, pixelSha256: 'mutant' })
    await barrier
    verificationCalls++
    throw numericalRed
  })
  const pendingRetry = cache.observe('seed-1', async () =>
    assert.fail('Concurrent retry cannot recapture.'),
  )
  const observed = Promise.allSettled([first, pendingRetry])
  release()
  for (const result of await observed) {
    assert.equal(result.status, 'rejected')
    assert.equal(result.reason, numericalRed)
  }
  for (let attempt = 0; attempt < 3; attempt++)
    await assert.rejects(
      cache.observe('seed-1', async () => assert.fail('Retry cannot bypass RED.')),
      (error) => error === numericalRed,
    )
  assert.equal(raw.length, 1)
  assert.equal(raw[0].accepted, false)
  assert.equal(verificationCalls, 1)
  let neighborCalls = 0
  const neighbor = { accepted: false, pixelSha256: 'healthy' }
  assert.equal(
    await cache.observe('seed-0', async () => {
      neighborCalls++
      return neighbor
    }),
    neighbor,
  )
  assert.equal(
    await cache.observe('seed-0', async () => assert.fail('GREEN is observed once.')),
    neighbor,
  )
  assert.equal(neighborCalls, 1)
  await assert.rejects(
    cache.observe('seed-1', () => neighbor),
    (error) => error === numericalRed,
  )
})

test('capture failure stays closed and invalid identities cannot alias another completion', async () => {
  const cache = createStickyCompletionCache()
  const captureFailure = new Error('receipt unavailable')
  let calls = 0
  await assert.rejects(
    cache.observe('job', () => {
      calls++
      throw captureFailure
    }),
    (error) => error === captureFailure,
  )
  await assert.rejects(
    cache.observe('job', () => ({ accepted: true })),
    (error) => error === captureFailure,
  )
  assert.equal(calls, 1)
  for (const id of ['', undefined, null, 1]) assert.throws(() => cache.observe(id, () => {}))
  assert.throws(() => cache.observe('other-job', null))
})

test('batch waits for terminal completion then numerical RED rejects directly before acceptance', async () => {
  let release
  const terminal = new Promise((resolve) => {
    release = resolve
  })
  const events = []
  const numericalRed = new Error('seed1 pixels differ')
  let accepted = false
  const verification = awaitVerifiedCompletions({
    waitForCompleted: async () => {
      events.push('waiting')
      await terminal
      events.push('completed')
    },
    admitted: [{ id: 'seed0' }, { id: 'seed1' }],
    observeCompleted: async (row, index) => {
      events.push(`${row.id}/${index}`)
      if (row.id === 'seed1') throw numericalRed
    },
  }).then(() => {
    accepted = true
  })
  const rejected = assert.rejects(verification, (error) => error === numericalRed)
  await Promise.resolve()
  assert.deepEqual(events, ['waiting'])
  release()
  await rejected
  assert.deepEqual(events, ['waiting', 'completed', 'seed0/0', 'seed1/1'])
  assert.equal(accepted, false)
  const neighbor = []
  await awaitVerifiedCompletions({
    waitForCompleted: async () => neighbor.push('complete'),
    admitted: [{ id: 'a' }, { id: 'b' }],
    observeCompleted: async (row) => neighbor.push(row.id),
  })
  assert.deepEqual(neighbor, ['complete', 'a', 'b'])
  let observed = false
  await assert.rejects(
    awaitVerifiedCompletions({
      waitForCompleted: async () => {
        throw new Error('failed queue')
      },
      admitted: [{ id: 'a' }],
      observeCompleted: () => {
        observed = true
      },
    }),
    /failed queue/,
  )
  assert.equal(observed, false)
})
