import assert from 'node:assert/strict'
import test from 'node:test'

import { tsImport } from 'tsx/esm/api'

// Importing the harness must not read fixtures, start workers or create test payloads.
const { fingerprint } = await tsImport('./qualify-installed-regional-init.mts', import.meta.url)

test('recipe fingerprint ignores property insertion order through nested validation snapshots', () => {
  const original = {
    seed: 123,
    regions: [{ regionId: 'left', coverage: { width: 2, alpha: Uint8Array.of(0, 255) } }],
    initializationProfile: 'invoke-cpu-f32-add-noise-v1',
  }
  const validated = {
    initializationProfile: 'invoke-cpu-f32-add-noise-v1',
    regions: [{ coverage: { alpha: Buffer.from([0, 255]), width: 2 }, regionId: 'left' }],
    seed: 123,
  }
  assert.equal(fingerprint(original), fingerprint(validated))
})

test('recipe fingerprint retains stream order, exact mask bytes and initialization identity', () => {
  const original = {
    initializationProfile: 'invoke-cpu-f32-add-noise-v1',
    regions: [
      { regionId: 'left', alpha: Uint8Array.of(0, 255), positive: 'red hair' },
      { regionId: 'right', alpha: Uint8Array.of(255, 0), positive: 'blue hair' },
    ],
    seed: 123,
  }
  for (const change of [
    (value) => value.regions.reverse(),
    (value) => value.regions[0].alpha.reverse(),
    (value) => {
      value.regions[0].positive = 'blue hair'
    },
    (value) => {
      value.seed = 124
    },
    (value) => {
      delete value.initializationProfile
    },
  ]) {
    const altered = structuredClone(original)
    change(altered)
    assert.notEqual(fingerprint(original), fingerprint(altered))
  }
  assert.equal(fingerprint(original), fingerprint(structuredClone(original)))
})
