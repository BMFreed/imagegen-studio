import assert from 'node:assert/strict'
import test from 'node:test'

import {
  defaultIllustriousNoiseProfile,
  equalIllustriousNoiseProfiles,
  isDefaultIllustriousNoiseProfile,
  isIllustriousNoiseProfileV1,
  supportsIllustriousNoiseProfile,
} from './illustrious-noise-profile.js'
import { ILLUSTRIOUS_SCHEDULER_PAIRS } from './illustrious-scheduler.js'

test('profile schema rejects partial, unversioned or extended execution semantics', () => {
  const baseline = defaultIllustriousNoiseProfile()
  assert.ok(isIllustriousNoiseProfileV1(baseline))
  for (const spacing of ['leading', 'linspace', 'trailing'] as const) {
    assert.ok(isIllustriousNoiseProfileV1({ ...baseline, timestepSpacing: spacing }))
  }
  for (const value of [
    null,
    { ...baseline, schemaVersion: 2 },
    { ...baseline, baseSchedule: 'inferred' },
    { ...baseline, timestepSpacing: 'unknown' },
    { ...baseline, rescaleBetasZeroSnr: 1 },
    { ...baseline, betaStart: 0.01 },
    { ...baseline, timestepSpacing: undefined },
  ]) {
    assert.equal(isIllustriousNoiseProfileV1(value), false)
  }
})

test('legacy frozen profile means original baseline; each actual field changes execution identity', () => {
  const baseline = defaultIllustriousNoiseProfile()
  assert.ok(equalIllustriousNoiseProfiles(undefined, baseline))
  assert.ok(isDefaultIllustriousNoiseProfile(baseline))
  for (const changed of [
    { ...baseline, rescaleBetasZeroSnr: true },
    { ...baseline, timestepSpacing: 'trailing' as const },
    { ...baseline, timestepSpacing: 'linspace' as const },
  ]) {
    assert.equal(equalIllustriousNoiseProfiles(undefined, changed), false)
    assert.equal(isDefaultIllustriousNoiseProfile(changed), false)
  }
})

test('all catalog methods retain native spacing; only SDE refuses unsupported zero-SNR', () => {
  for (const pair of ILLUSTRIOUS_SCHEDULER_PAIRS) {
    for (const timestepSpacing of ['leading', 'linspace', 'trailing'] as const) {
      const profile = { ...defaultIllustriousNoiseProfile(), timestepSpacing }
      assert.ok(supportsIllustriousNoiseProfile(pair.invokeKey, profile))
      assert.equal(
        supportsIllustriousNoiseProfile(pair.invokeKey, { ...profile, rescaleBetasZeroSnr: true }),
        pair.sampler !== 'DPM++ SDE',
      )
    }
  }
})
