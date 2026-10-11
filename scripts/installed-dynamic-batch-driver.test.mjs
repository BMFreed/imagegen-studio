/** Actual shared completion cache; collectors double only external capture/verification work. */
import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { homedir } from 'node:os'
import {
  assertReferenceSourceLineage,
  awaitVerifiedCompletions,
  createStickyCompletionCache,
  invokeCrashLayersAdapter,
  invokeComparisonAdapter,
  invokeRecoveredInputAdapter,
  shouldCompareCompletionBaseline,
} from './installed-dynamic-batch-driver.mjs'

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
