/** Real profile mechanics and Node crypto observation; these adapters are not native UI evidence. */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createContext, Script } from 'node:vm'

import { animaDynamicBatchProfile } from './anima-dynamic-batch-profile.mjs'
import { generationSeedBoundaryProfile as profile } from './generation-seed-boundary-profile.mjs'
import {
  assertSeedBoundaryConfiguration,
  assertSeedBoundaryFrozen,
  normalizeSeedBoundaryExecutionInputs,
  normalizeSeedBoundaryNativeInputs,
  validateSeedBoundaryFixture,
} from './generation-seed-boundary-qualification.mjs'
import { illustriousDynamicBatchProfile } from './illustrious-dynamic-batch-profile.mjs'

const root = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs/seed-profile-mechanics')
function fixture(objective = 'anima', stage = 'random', replaySeed = 0) {
  return {
    schemaVersion: 1,
    profile: 'generation-seed-boundary',
    objective,
    stage,
    referenceFixture: { path: path.join(root, 'reference.json'), sha256: 'a'.repeat(64) },
    workerBaseline: { path: path.join(root, 'worker.json'), sha256: 'b'.repeat(64) },
    artifacts: path.join(root, 'output'),
    ...(['replay', 'restored'].includes(stage)
      ? { baseline: { reportPath: path.join(root, 'healthy.json'), reportSha256: 'c'.repeat(64) } }
      : {}),
    ...(stage === 'replay' ? { replaySeed } : {}),
  }
}

function admitted(seeds, policy = 'random', behavior = 'per-iteration') {
  return seeds.map((seed, index) => ({
    id: `actual-queue-${index}`,
    frozen_payload_json: JSON.stringify({
      context: { sampling: { seed, requestedSeedPolicy: policy, seedBehavior: behavior } },
    }),
  }))
}

test('real injected profile binds the independent oracle and all existing native resource choices', () => {
  assert.equal(profile.validateFixture, validateSeedBoundaryFixture)
  assert.equal(profile.assertFrozen, assertSeedBoundaryFrozen)
  assert.equal(profile.assertConfiguration, assertSeedBoundaryConfiguration)
  assert.equal(profile.normalizeNativeInputs, normalizeSeedBoundaryNativeInputs)
  assert.equal(profile.normalizeExecutionInputs, normalizeSeedBoundaryExecutionInputs)
  assert.deepEqual(profile.sourceDependencies, [
    'scripts/anima-dynamic-batch-profile.mjs',
    'scripts/anima-dynamic-batch-qualification.mjs',
    'scripts/illustrious-dynamic-batch-profile.mjs',
    'scripts/illustrious-dynamic-batch-qualification.mjs',
  ])
  for (const [objective, model, lora, operation, cfg] of [
    ['anima', 'anima', 'animaLora', 'anima-txt2img', 4],
    ['epsilon', 'illustriousEpsilon', 'illustriousLora', 'illustrious-txt2img', 5],
    ['v_prediction', 'illustrious', 'illustriousLora', 'illustrious-txt2img', 5],
  ]) {
    const input = fixture(objective)
    const delegate =
      objective === 'anima' ? animaDynamicBatchProfile : illustriousDynamicBatchProfile
    assert.equal(profile.modelKey(input), model)
    assert.equal(profile.loraKey(input), lora)
    assert.equal(profile.operation(input), operation)
    assert.equal(profile.cfgScale(input), cfg)
    assert.deepEqual(profile.sampling(input), delegate.sampling(input))
    assert.deepEqual(profile.originalSourceKeys(input), delegate.originalSourceKeys(input))
    assert.deepEqual(
      profile.comparisonChanged(input),
      delegate.comparisonChanged.filter((key) => key !== 'seed.actual'),
    )
    assert.deepEqual(profile.comparisonSame(input), delegate.comparisonSame)
  }
  for (const objective of [undefined, 'sdxl', 'EPS', 'v-prediction'])
    for (const method of ['modelKey', 'loraKey', 'operation', 'cfgScale', 'sampling'])
      assert.throws(() => profile[method]({ objective }))
})

test('late Random projections use first frozen seed and reject independent subsequent drift', () => {
  const plan = profile.validateFixture(fixture('epsilon'))
  assert.deepEqual(
    plan.items.map(({ seed }) => seed),
    [null, null, null, null],
  )
  const rows = admitted([4294967295, 0, 4294967295, 0])
  const resolved = profile.resolveAdmissionPlan({ plan, admitted: rows })
  assert.deepEqual(
    resolved.plan.items.map(({ seed }) => seed),
    [4294967295, 0, 4294967295, 0],
  )
  assert.deepEqual(resolved.evidence, {
    kind: 'first-admitted-frozen-request',
    queueItemId: 'actual-queue-0',
    seed: 4294967295,
  })
  assert.equal(Object.isFrozen(resolved.plan), true)
  assert.deepEqual(
    plan.items.map(({ seed }) => seed),
    [null, null, null, null],
  )
  assert.throws(() => profile.resolveAdmissionPlan({ plan, admitted: admitted([0, 1, 2, 3]) }))
  const wrongPolicy = admitted([0, 1, 0, 1], 'fixed')
  assert.throws(() => profile.resolveAdmissionPlan({ plan, admitted: wrongPolicy }))
  const wrap = profile.validateFixture(fixture('epsilon', 'wrap'))
  assert.deepEqual(
    wrap.items.map(({ seed }) => seed),
    [4294967295, 0, 1, 2],
  )
  const observed = profile.resolveAdmissionPlan({
    plan: wrap,
    admitted: admitted([4294967295, 0, 1, 2], 'fixed', 'per-prompt'),
  })
  assert.deepEqual(observed.plan, wrap)
  assert.equal(observed.evidence, null)
})

test('reference matching omits only Random requested policy for declared Fixed replay', () => {
  const frozen = {
    kind: 'illustrious-txt2img',
    context: {
      documentId: 'source-document',
      documentRevision: 7,
      sampling: { seed: 0, requestedSeedPolicy: 'random', seedBehavior: 'per-iteration' },
    },
    workerJob: { sampling: { seed: 0 }, prompt: 'same actual input' },
  }
  const original = structuredClone(frozen)
  const replay = fixture('epsilon', 'replay')
  const projected = profile.normalizeReferenceInputs(frozen, {
    fixture: replay,
    plan: profile.validateFixture(replay),
  })
  assert.deepEqual(projected.context.sampling, { seed: 0, seedBehavior: 'per-iteration' })
  assert.deepEqual(projected.workerJob, original.workerJob)
  assert.deepEqual(frozen, original)
  assert.equal(profile.expectedBaselineStage(replay), 'random')
  assert.deepEqual(profile.baselineMetadataDifferences(replay), ['requestedSeedPolicy'])
  for (const stage of ['random', 'wrap', 'restored']) {
    const input = fixture('epsilon', stage)
    const projected = profile.normalizeReferenceInputs(frozen, {
      fixture: input,
      plan: profile.validateFixture(input),
    })
    assert.deepEqual(projected.context.sampling, original.context.sampling)
    assert.deepEqual(profile.baselineMetadataDifferences(input), [])
  }
})

function mechanicalSeedUI(seed = { policy: 'fixed', value: 0 }) {
  const state = { seed: structuredClone(seed), calls: [] }
  const random = {
    async getAttribute(name) {
      assert.equal(name, 'aria-checked')
      return state.seed.policy === 'random' ? 'true' : 'false'
    },
    async click() {
      state.calls.push('Random switch click')
      state.seed =
        state.seed.policy === 'random'
          ? { policy: 'fixed', value: 0 }
          : { policy: 'random', value: null }
    },
  }
  const input = { seedInput: true }
  const window = {
    getByRole(role, options) {
      assert.equal(role, 'switch')
      assert.deepEqual(options, { name: 'Random seed switch', exact: true })
      return random
    },
    locator(selector) {
      assert.equal(selector, 'input[aria-label="Generation seed"]')
      return input
    },
  }
  function expect(target) {
    return {
      async toHaveAttribute(name, expected) {
        assert.equal(await target.getAttribute(name), expected)
      },
      async toBeDisabled() {
        assert.equal(target, input)
        assert.equal(state.seed.policy, 'random')
      },
      async toBeEnabled() {
        assert.equal(target, input)
        assert.equal(state.seed.policy, 'fixed')
      },
    }
  }
  expect.poll = (read) => ({
    async toEqual(value) {
      assert.deepEqual(await read(), value)
    },
  })
  return {
    state,
    context: {
      window,
      expect,
      project: { id: 'mechanical-authoring-project' },
      async tab() {
        return { generationDraft: { seed: structuredClone(state.seed) } }
      },
      async setInput(label, value) {
        assert.equal(label, 'Generation seed')
        assert.equal(state.seed.policy, 'fixed')
        state.calls.push(['Generation seed input', value])
        state.seed.value = value
      },
    },
  }
}

test('actual profile authors Random through the switch and numeric boundaries through the fixed input', async () => {
  const ui = mechanicalSeedUI()
  const random = profile.validateFixture(fixture('anima'))
  await profile.authorSeed({ ...ui.context, currentPlan: random })
  assert.deepEqual(ui.state.seed, { policy: 'random', value: null })
  assert.deepEqual(ui.state.calls, ['Random switch click'])
  await profile.authorSeed({ ...ui.context, currentPlan: random })
  assert.equal(ui.state.calls.length, 1, 'Already-on Random cannot be toggled off.')
  for (const seed of [0, 4294967295]) {
    const replay = profile.validateFixture(fixture('anima', 'replay', seed))
    await profile.authorSeed({ ...ui.context, currentPlan: replay })
    assert.deepEqual(ui.state.seed, { policy: 'fixed', value: seed })
  }
  assert.deepEqual(ui.state.calls, [
    'Random switch click',
    'Random switch click',
    ['Generation seed input', 0],
    ['Generation seed input', 4294967295],
  ])
  const wrap = profile.validateFixture(fixture('anima', 'wrap'))
  await profile.authorSeed({ ...ui.context, currentPlan: wrap })
  assert.deepEqual(ui.state.seed, { policy: 'fixed', value: 4294967295 })
  await assert.rejects(
    profile.authorSeed({
      ...ui.context,
      currentPlan: { requestedSeedPolicy: 'fixed', fixedSeed: 4294967296 },
    }),
  )
})

test('actual authored assertion distinguishes Random, numeric replay zero and uint32 maximum', () => {
  for (const [stage, policy, value] of [
    ['random', 'random', null],
    ['replay', 'fixed', 0],
    ['wrap', 'fixed', 4294967295],
  ]) {
    const input = fixture('anima', stage)
    const plan = profile.validateFixture(input)
    const draft = {
      positivePrompt: { embeddingRefs: [] },
      negativePrompt: { embeddingRefs: [] },
      seed: { policy, value },
    }
    profile.assertAuthored(draft, {}, input, plan)
    const wrong = structuredClone(draft)
    wrong.seed = { policy: 'fixed', value: 37 }
    assert.throws(() => profile.assertAuthored(wrong, {}, input, plan))
    for (const sign of ['positivePrompt', 'negativePrompt']) {
      const unexpectedEmbedding = structuredClone(draft)
      unexpectedEmbedding[sign].embeddingRefs.push({ token: '<unexpected>' })
      assert.throws(() => profile.assertAuthored(unexpectedEmbedding, {}, input, plan))
    }
  }
})

const application = {
  async evaluate(callback, value) {
    return await callback({}, value)
  },
}
function prepareNormalGenerationInternal() {
  return crypto.randomBytes(4)
}
function prepareAnimaGenerationInternal() {
  return crypto.randomBytes(4)
}

test('real Node crypto observer preserves original buffer and CJS/ESM identity then restores it', async () => {
  const original = crypto.randomBytes
  const cjs = createRequire(import.meta.url)('node:crypto')
  assert.equal(typeof process.getBuiltinModule, 'function')
  assert.equal(process.getBuiltinModule('node:crypto'), cjs)
  assert.equal(process.getBuiltinModule('node:crypto'), crypto)
  assert.equal(cjs.randomBytes, original)
  for (const objective of ['epsilon', 'anima']) {
    const input = fixture(objective)
    const handle = await profile.beforeAdmission({ application, fixture: input })
    try {
      assert.notEqual(crypto.randomBytes, original)
      assert.equal(cjs.randomBytes, crypto.randomBytes)
      const ignored = crypto.randomBytes(4)
      assert.equal(ignored.length, 4)
      const bytes =
        objective === 'anima' ? prepareAnimaGenerationInternal() : prepareNormalGenerationInternal()
      assert.equal(Buffer.isBuffer(bytes), true)
      assert.equal(bytes.length, 4)
      const seed = bytes.readUInt32LE(0)
      const observation = await profile.afterAdmission({
        application,
        fixture: input,
        admitted: admitted([seed, (seed + 1) % 4294967296, seed, (seed + 1) % 4294967296]),
        handle,
      })
      assert.equal(observation.outputSubstitution, false)
      assert.equal(observation.calls.length, 1)
      assert.equal(observation.calls[0].seed, seed)
      assert.equal(observation.calls[0].argumentCount, 1)
      assert.match(observation.calls[0].stack, /prepare(?:Normal|Anima)GenerationInternal/)
      assert.ok(observation.calls[0].stack.length <= 4096)
      assert.equal(observation.originalIdentityRestored, true)
      assert.equal(crypto.randomBytes, original)
      assert.equal(Object.hasOwn(globalThis, handle.key), false)
    } finally {
      await profile.restoreAdmissionObservation({ application, handle })
      assert.equal(crypto.randomBytes, original)
    }
  }
})

test('serialized evaluate callbacks work without dynamic-import loader and reject the former bootstrap mutation', async () => {
  const original = crypto.randomBytes
  function serializedApplication(legacyImportMutation = false) {
    const context = createContext({ process, Buffer })
    return {
      async evaluate(callback, argument) {
        context.argument = structuredClone(argument)
        let source = callback.toString()
        if (legacyImportMutation) {
          assert.ok(source.includes("process.getBuiltinModule('node:crypto')"))
          source = source.replace(
            "process.getBuiltinModule('node:crypto')",
            "(await import('node:crypto')).default",
          )
        }
        // No importModuleDynamically callback: these functions must be self-contained, as they
        // are when ElectronApplication.evaluate serializes them across the Main boundary.
        const script = new Script(`(${source})(undefined, argument)`)
        return structuredClone(await script.runInContext(context, { timeout: 1000 }))
      },
    }
  }
  const input = fixture('epsilon')
  const serialized = serializedApplication()
  let handle
  try {
    handle = await profile.beforeAdmission({ application: serialized, fixture: input })
    const bytes = prepareNormalGenerationInternal()
    const seed = bytes.readUInt32LE(0)
    const observation = await profile.afterAdmission({
      application: serialized,
      fixture: input,
      admitted: admitted([seed]),
      handle,
    })
    assert.equal(observation.calls.length, 1)
    assert.equal(observation.calls[0].seed, seed)
    assert.equal(observation.originalIdentityRestored, true)
    assert.equal(crypto.randomBytes, original)
  } finally {
    await profile.restoreAdmissionObservation({ application: serialized, handle })
    assert.equal(crypto.randomBytes, original)
  }
  await assert.rejects(
    profile.beforeAdmission({ application: serializedApplication(true), fixture: input }),
    /dynamic import callback/i,
  )
  assert.equal(crypto.randomBytes, original)
})

test('observer returns the exact real producer Buffer and forwards its original arguments and receiver', async () => {
  const original = crypto.randomBytes
  let captured
  function captureActualProducer(...args) {
    const result = Reflect.apply(original, this, args)
    captured = { result, args, receiver: this }
    return result
  }
  crypto.randomBytes = captureActualProducer
  const input = fixture('epsilon')
  let handle
  try {
    handle = await profile.beforeAdmission({ application, fixture: input })
    const actual = prepareNormalGenerationInternal()
    assert.equal(actual, captured.result, 'Observation cannot clone or replace actual RNG output.')
    assert.deepEqual(captured.args, [4])
    assert.equal(captured.receiver, crypto)
    const seed = actual.readUInt32LE(0)
    await profile.afterAdmission({
      application,
      fixture: input,
      admitted: admitted([seed]),
      handle,
    })
    assert.equal(crypto.randomBytes, captureActualProducer)
  } finally {
    await profile.restoreAdmissionObservation({ application, handle })
    crypto.randomBytes = original
  }
})

test('actual observer rejects repeated base picks and mismatch after restoring original crypto', async () => {
  const original = crypto.randomBytes
  const input = fixture('epsilon')
  for (const mutation of ['two-picks', 'wrong-frozen-seed', 'no-pick']) {
    const handle = await profile.beforeAdmission({ application, fixture: input })
    try {
      const actual = mutation === 'no-pick' ? 0 : prepareNormalGenerationInternal().readUInt32LE(0)
      if (mutation === 'two-picks') prepareNormalGenerationInternal()
      const frozenSeed = mutation === 'wrong-frozen-seed' ? (actual + 1) % 4294967296 : actual
      await assert.rejects(
        profile.afterAdmission({
          application,
          fixture: input,
          admitted: admitted([frozenSeed]),
          handle,
        }),
      )
      assert.equal(crypto.randomBytes, original)
      assert.equal(handle.restored, true)
    } finally {
      await profile.restoreAdmissionObservation({ application, handle })
    }
  }
  const canceled = await profile.beforeAdmission({ application, fixture: input })
  await profile.restoreAdmissionObservation({ application, handle: canceled })
  assert.equal(crypto.randomBytes, original)
  for (const stage of ['replay', 'wrap', 'restored']) {
    const fixed = fixture('epsilon', stage)
    assert.equal(await profile.beforeAdmission({ application, fixture: fixed }), undefined)
    assert.equal(
      await profile.afterAdmission({ application, fixture: fixed, handle: undefined }),
      undefined,
    )
    assert.equal(crypto.randomBytes, original)
  }
})

test('finite stage summaries cannot turn replay or partial restoration into whole-MVP claims', () => {
  for (const [stage, claim] of [
    ['random', 'randomClaim'],
    ['replay', 'randomNumericReplayClaim'],
    ['wrap', 'uint32WrapClaim'],
    ['restored', 'uint32RestorationClaim'],
  ]) {
    const claims = profile.summaryClaims({ fixture: fixture('anima', stage) })
    assert.deepEqual(
      Object.keys(claims).filter((key) => claims[key]),
      [claim],
    )
    assert.equal(claims.max32InferenceClaim, false)
    assert.equal(claims.fullMvpClaim, false)
  }
})

test('per-layer comparisons preserve legal Random 36/37 and Fixed zero/MAX without false changes', async () => {
  for (const policy of ['random', 'fixed']) {
    for (const seed of [36, 37, 0, 4294967295]) {
      const statuses = {
        'seed.actual': seed === 37 ? 'Same' : 'Changed',
        'seed.policy': policy === 'fixed' ? 'Same' : 'Changed',
        'seed.behavior': 'Changed',
      }
      function context(statusOverrides = {}) {
        const actual = { ...statuses, ...statusOverrides }
        return {
          generation: {
            expectedItem: { seed, requestedSeedPolicy: policy, seedBehavior: 'per-iteration' },
          },
          currentDraft: {
            seed: { policy: 'fixed', value: 37 },
            dynamicPrompt: { seedBehavior: 'per-prompt' },
          },
          dialog: {
            locator(selector) {
              const match = /^\[data-setting="(seed\.(?:actual|policy|behavior))"\]$/.exec(selector)
              assert.ok(match)
              return {
                async getAttribute(name) {
                  assert.equal(name, 'data-status')
                  return actual[match[1]]
                },
              }
            },
          },
          expect(row) {
            return {
              async toHaveCount(value) {
                assert.equal(value, 1)
              },
              async toHaveAttribute(name, value) {
                assert.equal(await row.getAttribute(name), value)
              },
            }
          },
        }
      }
      const observed = await profile.assertComparison(context())
      assert.deepEqual(
        observed.seedRows,
        Object.entries(statuses).map(([key, status]) => ({ key, status, observedStatus: status })),
      )
      for (const [key, status] of Object.entries(statuses))
        await assert.rejects(
          profile.assertComparison(context({ [key]: status === 'Same' ? 'Changed' : 'Same' })),
        )
    }
  }
})
