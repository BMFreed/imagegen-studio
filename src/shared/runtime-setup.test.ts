import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { RuntimeSetupReview } from './runtime-setup.js'

import { isRuntimeSetupMode, isRuntimeSetupReview, isRuntimeSetupToken } from './runtime-setup.js'

const review = (): RuntimeSetupReview => ({
  additionalInstalledBytes: null,
  downloadBytes: 205_669_692,
  installedBytes: null,
  mode: 'install',
  outpaintInfillReused: false,
  releaseId: 'reviewed-release-v1',
  requiredFreeBytes: null,
  runtimeRequiredFreeBytes: 20 * 1024 ** 3,
  runtimeSourceCached: true,
  scope: 'engine',
  source: 'verified-local-cache',
  token: randomUUID(),
})

test('public setup review preserves unknown aggregate sizes and known nonnegative transfer/reuse facts', () => {
  assert.equal(isRuntimeSetupReview(structuredClone(review())), true)
  assert.equal(
    isRuntimeSetupReview({
      ...review(),
      additionalInstalledBytes: 0,
      downloadBytes: 0,
      installedBytes: 205_669_692,
      mode: 'repair',
      outpaintInfillReused: true,
    }),
    true,
  )
  assert.equal(
    isRuntimeSetupReview({
      ...review(),
      additionalInstalledBytes: Number.MAX_SAFE_INTEGER,
      downloadBytes: Number.MAX_SAFE_INTEGER,
      installedBytes: Number.MAX_SAFE_INTEGER,
      runtimeRequiredFreeBytes: Number.MAX_SAFE_INTEGER,
    }),
    true,
  )
  assert.equal(isRuntimeSetupReview(Object.freeze(review())), true)
  assert.equal(isRuntimeSetupReview(Object.assign(Object.create(null), review())), true)
})

test('authenticated metadata reviews describe uncached transfer or freshly verified cached source without changing the public shape', () => {
  for (const runtimeSourceCached of [false, true]) {
    const metadataReview: RuntimeSetupReview = {
      ...review(),
      downloadBytes: runtimeSourceCached ? 205_669_692 : 2 * 1024 ** 3 + 205_669_692,
      runtimeSourceCached,
      source: 'verified-metadata',
    }
    assert.equal(isRuntimeSetupReview(metadataReview), true)
    assert.equal(metadataReview.installedBytes, null)
    assert.equal(metadataReview.requiredFreeBytes, null)
    assert.deepEqual(Object.keys(metadataReview).sort(), Object.keys(review()).sort())
    assert.equal(isRuntimeSetupReview({ ...metadataReview, trustedKeys: {} }), false)
    assert.equal(
      isRuntimeSetupReview({ ...metadataReview, sourceUrl: 'https://publisher.test/runtime.zip' }),
      false,
    )
  }
  assert.equal(
    isRuntimeSetupReview({
      ...review(),
      runtimeSourceCached: false,
      source: 'verified-local-cache',
    }),
    false,
  )
})

test('setup mode and opaque token shape admit only the domain inputs and never establish authority', () => {
  for (const mode of ['install', 'repair']) {
    assert.equal(isRuntimeSetupMode(mode), true)
  }
  for (const invalid of ['', 'Install', 'update', 'install ', null, undefined, 0, true, [], {}]) {
    assert.equal(isRuntimeSetupMode(invalid), false)
    assert.equal(isRuntimeSetupReview({ ...review(), mode: invalid }), false)
  }
  const token = randomUUID()
  assert.equal(isRuntimeSetupToken(token), true)
  assert.equal(isRuntimeSetupToken(token.toUpperCase()), true)
  for (const invalid of [
    '',
    token.replaceAll('-', ''),
    `${token}-extra`,
    ` ${token}`,
    `${token}\n`,
    `${token}\r`,
    `${token}\u2028`,
    `/tmp/${token}`,
    'not-a-review-token',
    null,
    undefined,
    1,
    true,
    {},
    [],
  ]) {
    assert.equal(isRuntimeSetupToken(invalid), false)
    assert.equal(isRuntimeSetupReview({ ...review(), token: invalid }), false)
  }
})

test('missing fields and private Main capabilities cannot cross the exact public review boundary', () => {
  const valid = review()
  for (const field of Object.keys(valid)) {
    const missing: Record<string, unknown> = { ...valid }
    delete missing[field]
    assert.equal(isRuntimeSetupReview(missing), false, `missing ${field}`)
  }
  for (const extra of [
    { path: '/runtime/slot' },
    { trustedKeys: {} },
    { envelope: 'signed-release-bytes' },
    { transportDirectory: '/cache/source' },
    { planId: randomUUID() },
    { auxiliaryPlanId: randomUUID() },
    { pointerSha256: 'a'.repeat(64) },
    { verifiedPayloadBytes: 321 },
    { plan: { artifacts: [] } },
  ]) {
    assert.equal(isRuntimeSetupReview({ ...valid, ...extra }), false)
  }
  assert.equal(isRuntimeSetupReview({ ok: true, value: valid }), false)
  assert.equal(isRuntimeSetupReview({ ...valid, scope: 'python-runtime-slot' }), false)
  assert.equal(isRuntimeSetupReview({ ...valid, scope: 'auxiliary-weights' }), false)
})

test('source provenance, cached-source and installed-reuse flags cannot imply another workflow', () => {
  for (const invalid of ['download-url', 'installed-runtime', '', null, undefined, true, {}]) {
    assert.equal(isRuntimeSetupReview({ ...review(), source: invalid }), false)
  }
  for (const invalid of [false, 'true', 1, null, undefined, {}, []]) {
    assert.equal(isRuntimeSetupReview({ ...review(), runtimeSourceCached: invalid }), false)
  }
  for (const invalid of ['true', 1, null, undefined, {}, []]) {
    assert.equal(
      isRuntimeSetupReview({
        ...review(),
        runtimeSourceCached: invalid,
        source: 'verified-metadata',
      }),
      false,
    )
  }
  for (const invalid of ['true', 'false', 0, 1, null, undefined, {}, []]) {
    assert.equal(isRuntimeSetupReview({ ...review(), outpaintInfillReused: invalid }), false)
  }
  assert.equal(isRuntimeSetupReview({ ...review(), outpaintInfillReused: true }), true)
  assert.equal(isRuntimeSetupReview({ ...review(), outpaintInfillReused: false }), true)
})

test('release ID matches the signed manifest safe identifier boundary without paths or unbounded labels', () => {
  for (const releaseId of ['a', '1', 'release+local_1.2-3', 'A'.repeat(128)]) {
    assert.equal(isRuntimeSetupReview({ ...review(), releaseId }), true)
  }
  for (const releaseId of [
    '',
    'a'.repeat(129),
    '.release',
    '../release',
    '/runtime/release',
    'release/child',
    String.raw`release\child`,
    'release:name',
    ' release',
    'release ',
    'release\n',
    'release\r',
    'release\u2028',
    'release\u2029',
    'release\0',
    null,
    undefined,
    1,
    {},
  ]) {
    assert.equal(isRuntimeSetupReview({ ...review(), releaseId }), false)
  }
})

test('all byte quantities are exact safe integers and the aggregate free-space peak stays explicitly unknown', () => {
  const invalidNumbers = [
    -1,
    0.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '0',
    '205669692',
    true,
    undefined,
    {},
    [],
    1n,
  ]
  for (const field of [
    'downloadBytes',
    'installedBytes',
    'additionalInstalledBytes',
    'runtimeRequiredFreeBytes',
  ] as const) {
    for (const invalid of invalidNumbers) {
      assert.equal(isRuntimeSetupReview({ ...review(), [field]: invalid }), false, field)
    }
  }
  for (const field of ['downloadBytes', 'runtimeRequiredFreeBytes'] as const) {
    assert.equal(isRuntimeSetupReview({ ...review(), [field]: null }), false, field)
  }
  for (const field of ['installedBytes', 'runtimeRequiredFreeBytes'] as const) {
    assert.equal(isRuntimeSetupReview({ ...review(), [field]: 0 }), false, field)
  }
  assert.equal(isRuntimeSetupReview({ ...review(), downloadBytes: 0 }), true)
  assert.equal(isRuntimeSetupReview({ ...review(), additionalInstalledBytes: 0 }), true)
  for (const invalid of [0, 1, 20 * 1024 ** 3, 'unknown', undefined, false, {}, []]) {
    assert.equal(isRuntimeSetupReview({ ...review(), requiredFreeBytes: invalid }), false)
  }
})

test('known additional footprint cannot exceed known complete footprint and null is not coerced into zero', () => {
  assert.equal(
    isRuntimeSetupReview({ ...review(), additionalInstalledBytes: 101, installedBytes: 100 }),
    false,
  )
  assert.equal(
    isRuntimeSetupReview({ ...review(), additionalInstalledBytes: 100, installedBytes: 100 }),
    true,
  )
  assert.equal(
    isRuntimeSetupReview({ ...review(), additionalInstalledBytes: 0, installedBytes: 100 }),
    true,
  )
  assert.equal(
    isRuntimeSetupReview({ ...review(), additionalInstalledBytes: 100, installedBytes: null }),
    true,
  )
  assert.equal(
    isRuntimeSetupReview({ ...review(), additionalInstalledBytes: null, installedBytes: 100 }),
    true,
  )
})

test('nonrecords, inherited or hidden fields, accessors and throwing reflection are refused without executing getters', () => {
  for (const invalid of [null, undefined, [], [review()], '', 0, true, new Date(), new Map()]) {
    assert.equal(isRuntimeSetupReview(invalid), false)
  }
  assert.equal(isRuntimeSetupReview(Object.create(review())), false)
  class ClassRecord {
    constructor() {
      Object.assign(this, review())
    }
  }
  assert.equal(isRuntimeSetupReview(new ClassRecord()), false)
  const symbolic = { ...review(), [Symbol('private')]: '/private/path' }
  assert.equal(isRuntimeSetupReview(symbolic), false)
  const hiddenExtra = Object.defineProperty(review(), 'trustedKeys', { value: {} })
  assert.equal(isRuntimeSetupReview(hiddenExtra), false)
  const hiddenField = Object.defineProperty(review(), 'token', { enumerable: false })
  assert.equal(isRuntimeSetupReview(hiddenField), false)
  let getterCalls = 0
  const accessor = Object.defineProperty(review(), 'token', {
    enumerable: true,
    get: () => {
      getterCalls++
      return randomUUID()
    },
  })
  assert.equal(isRuntimeSetupReview(accessor), false)
  assert.equal(getterCalls, 0)
  const throwing = new Proxy(review(), {
    getPrototypeOf: () => {
      throw new Error('Controlled uncloneable input')
    },
  })
  assert.equal(isRuntimeSetupReview(throwing), false)
})
