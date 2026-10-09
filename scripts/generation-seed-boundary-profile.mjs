/** Finite Random/replay/uint32 authoring and observation injected into the durable UI runner. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { animaDynamicBatchProfile } from './anima-dynamic-batch-profile.mjs'
import {
  assertSeedBoundaryConfiguration,
  assertSeedBoundaryFrozen,
  normalizeSeedBoundaryExecutionInputs,
  normalizeSeedBoundaryNativeInputs,
  resolveSeedBoundaryPlan,
  validateSeedBoundaryFixture,
} from './generation-seed-boundary-qualification.mjs'
import { illustriousDynamicBatchProfile } from './illustrious-dynamic-batch-profile.mjs'

function familyProfile(fixture) {
  assert.ok(['anima', 'epsilon', 'v_prediction'].includes(fixture.objective))
  return fixture.objective === 'anima' ? animaDynamicBatchProfile : illustriousDynamicBatchProfile
}

async function authorSeed({ window, expect, tab, project, currentPlan, setInput }) {
  const random = window.getByRole('switch', { name: 'Random seed switch', exact: true })
  if (currentPlan.requestedSeedPolicy === 'random') {
    if ((await random.getAttribute('aria-checked')) !== 'true') await random.click()
    await expect(random).toHaveAttribute('aria-checked', 'true')
    await expect(window.locator('input[aria-label="Generation seed"]')).toBeDisabled()
    await expect
      .poll(async () => (await tab(project)).generationDraft.seed)
      .toEqual({
        policy: 'random',
        value: null,
      })
  } else {
    assert.equal(currentPlan.requestedSeedPolicy, 'fixed')
    assert.ok(Number.isInteger(currentPlan.fixedSeed))
    assert.ok(currentPlan.fixedSeed >= 0 && currentPlan.fixedSeed <= 4294967295)
    if ((await random.getAttribute('aria-checked')) === 'true') await random.click()
    await expect(random).toHaveAttribute('aria-checked', 'false')
    await expect(window.locator('input[aria-label="Generation seed"]')).toBeEnabled()
    await setInput('Generation seed', currentPlan.fixedSeed)
    await expect
      .poll(async () => (await tab(project)).generationDraft.seed)
      .toEqual({
        policy: 'fixed',
        value: currentPlan.fixedSeed,
      })
  }
}

/** Observe Main's original cryptographic choice without replacing any random value. */
async function beforeAdmission({ application, fixture }) {
  if (fixture.stage !== 'random') return undefined
  const handle = { key: `igsSeedBoundary${randomUUID().replaceAll('-', '')}`, restored: false }
  const installed = await application.evaluate(async (_electron, key) => {
    const crypto = process.getBuiltinModule('node:crypto')
    if (Object.hasOwn(globalThis, key)) throw new Error('Seed observer key already exists.')
    const original = crypto.randomBytes
    if (typeof original !== 'function') throw new Error('Main randomBytes is unavailable.')
    const calls = []
    function observedRandomBytes(...args) {
      const stack = new Error('Seed admission observation').stack ?? ''
      const relevant = args[0] === 4 && /prepare(?:Normal|Anima)GenerationInternal/.test(stack)
      const result = Reflect.apply(original, this, args)
      if (relevant)
        calls.push({
          argumentCount: args.length,
          byteSize: args[0],
          synchronous: Buffer.isBuffer(result),
          seed: Buffer.isBuffer(result) && result.length === 4 ? result.readUInt32LE(0) : null,
          stack: stack.slice(0, 4096),
        })
      return result
    }
    crypto.randomBytes = observedRandomBytes
    if (crypto.randomBytes !== observedRandomBytes)
      throw new Error('Main randomBytes cannot be observed without changing its producer.')
    globalThis[key] = { original, observedRandomBytes, calls }
    return { installed: true, producer: 'node:crypto.randomBytes', outputSubstitution: false }
  }, handle.key)
  assert.deepEqual(installed, {
    installed: true,
    producer: 'node:crypto.randomBytes',
    outputSubstitution: false,
  })
  return handle
}

async function restoreAdmissionObservation({ application, handle }) {
  if (!handle || handle.restored) return
  const observation = await application.evaluate(async (_electron, key) => {
    const crypto = process.getBuiltinModule('node:crypto')
    const state = globalThis[key]
    if (!state) throw new Error('Seed observation was lost before restoration.')
    if (crypto.randomBytes !== state.observedRandomBytes)
      throw new Error('Main randomBytes changed while its admission observer was active.')
    crypto.randomBytes = state.original
    if (crypto.randomBytes !== state.original)
      throw new Error('Main randomBytes original identity was not restored.')
    const result = { calls: state.calls, originalIdentityRestored: true }
    delete globalThis[key]
    return result
  }, handle.key)
  handle.restored = true
  return observation
}

async function afterAdmission({ application, fixture, admitted, handle }) {
  if (fixture.stage !== 'random') {
    assert.equal(handle, undefined)
    return undefined
  }
  const observation = await restoreAdmissionObservation({ application, handle })
  assert.equal(observation.originalIdentityRestored, true)
  assert.equal(observation.calls.length, 1, 'One Random Generate must make one actual base pick.')
  const [call] = observation.calls
  assert.equal(call.argumentCount, 1)
  assert.equal(call.byteSize, 4)
  assert.equal(call.synchronous, true)
  assert.ok(Number.isInteger(call.seed) && call.seed >= 0 && call.seed <= 4294967295)
  assert.ok(admitted.length > 0)
  const first = JSON.parse(admitted[0].frozen_payload_json)
  assert.equal(call.seed, first.context.sampling.seed)
  return {
    producer: 'Main node:crypto.randomBytes(4).readUInt32LE(0)',
    outputSubstitution: false,
    calls: observation.calls,
    originalIdentityRestored: true,
    firstAdmittedQueueItemId: admitted[0].id,
  }
}

export const generationSeedBoundaryProfile = Object.freeze({
  profile: 'generation-seed-boundary',
  entrySource: 'scripts/qualify-installed-generation-seed-boundary.mjs',
  adapterSource: 'scripts/generation-seed-boundary-profile.mjs',
  oracleSource: 'scripts/generation-seed-boundary-qualification.mjs',
  sourceDependencies: [
    'scripts/anima-dynamic-batch-profile.mjs',
    'scripts/anima-dynamic-batch-qualification.mjs',
    'scripts/illustrious-dynamic-batch-profile.mjs',
    'scripts/illustrious-dynamic-batch-qualification.mjs',
  ],
  validateFixture: validateSeedBoundaryFixture,
  assertFrozen: assertSeedBoundaryFrozen,
  assertConfiguration: assertSeedBoundaryConfiguration,
  normalizeNativeInputs: normalizeSeedBoundaryNativeInputs,
  normalizeExecutionInputs: normalizeSeedBoundaryExecutionInputs,
  normalizeReferenceInputs: (frozen, { fixture, plan }) =>
    fixture.stage === 'replay'
      ? normalizeSeedBoundaryExecutionInputs(frozen, plan)
      : normalizeSeedBoundaryNativeInputs(frozen),
  resolveAdmissionPlan: ({ plan, admitted }) => {
    const resolved = resolveSeedBoundaryPlan(plan, admitted)
    return { plan: resolved, evidence: resolved.randomBaseSource }
  },
  expectedBaselineStage: (fixture) => (fixture.stage === 'replay' ? 'random' : 'wrap'),
  baselineMetadataDifferences: (fixture) =>
    fixture.stage === 'replay' ? ['requestedSeedPolicy'] : [],
  modelKey: (fixture) => familyProfile(fixture).modelKey(fixture),
  loraKey: (fixture) => familyProfile(fixture).loraKey,
  originalSourceKeys: (fixture) => familyProfile(fixture).originalSourceKeys(fixture),
  operation: (fixture) => familyProfile(fixture).operation,
  cfgScale: (fixture) => familyProfile(fixture).cfgScale,
  sampling: (fixture) => familyProfile(fixture).sampling(fixture),
  async authorComponents(context) {
    await familyProfile(context.fixture).authorComponents?.(context)
  },
  authorSeed,
  assertAuthored(draft, reference, fixture, currentPlan) {
    familyProfile(fixture).assertAuthored?.(draft, reference)
    assert.deepEqual(draft.positivePrompt.embeddingRefs, [])
    assert.deepEqual(draft.negativePrompt.embeddingRefs, [])
    assert.deepEqual(draft.seed, {
      policy: currentPlan.requestedSeedPolicy,
      value: currentPlan.requestedSeedPolicy === 'random' ? null : currentPlan.fixedSeed,
    })
  },
  comparisonChanged: (fixture) =>
    familyProfile(fixture).comparisonChanged.filter((key) => key !== 'seed.actual'),
  comparisonSame: (fixture) => familyProfile(fixture).comparisonSame,
  async assertComparison({ expect, dialog, generation, currentDraft }) {
    const expected = generation?.expectedItem
    assert.ok(expected, 'Comparison must belong to its saved actual queue item.')
    assert.deepEqual(currentDraft.seed, { policy: 'fixed', value: 37 })
    const expectedRows = [
      ['seed.actual', expected.seed === currentDraft.seed.value ? 'Same' : 'Changed'],
      [
        'seed.policy',
        expected.requestedSeedPolicy === currentDraft.seed.policy ? 'Same' : 'Changed',
      ],
      [
        'seed.behavior',
        expected.seedBehavior === currentDraft.dynamicPrompt.seedBehavior ? 'Same' : 'Changed',
      ],
    ]
    const observedRows = []
    for (const [key, status] of expectedRows) {
      const row = dialog.locator(`[data-setting="${key}"]`)
      await expect(row).toHaveCount(1)
      await expect(row).toHaveAttribute('data-status', status)
      observedRows.push({ key, status, observedStatus: await row.getAttribute('data-status') })
    }
    return { seedRows: observedRows }
  },
  beforeAdmission,
  afterAdmission,
  restoreAdmissionObservation,
  summaryClaims: ({ fixture }) => ({
    randomClaim: fixture.stage === 'random',
    randomNumericReplayClaim: fixture.stage === 'replay',
    uint32WrapClaim: fixture.stage === 'wrap',
    uint32RestorationClaim: fixture.stage === 'restored',
    max32InferenceClaim: false,
    fullMvpClaim: false,
  }),
  boundary: {
    actual:
      'Built Electron renderer/preload/Main, public Random switch and Fixed seed input, Generate/Results/Add/Save/reopen, original Main cryptographic output observation, installed worker0.14, actual SQLite/PNG/.igs and native physical exit.',
    preconditions:
      'One canonical qualified runtime/catalog; exact Anima or Illustrious-family EPS/V model/components and signed LoRA. No download, installation, runtime/model copies or deterministic RNG replacement.',
    limits:
      '256x256, three TXT evaluations; four actual Random jobs, four same-input Fixed numeric replay jobs, four MAX/0/1/2 wrap jobs or two fresh MAX/0 restoration controls per selected objective. Maximum32-job inference, image quality, broad compatibility and release qualification remain outside this claim.',
  },
})
