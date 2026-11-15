import assert from 'node:assert/strict'
import test from 'node:test'

import {
  APPLICATION_UPDATE_NOTES_MAX_LENGTH,
  APPLICATION_UPDATE_STATUSES,
  APPLICATION_UPDATE_VERSION_MAX_LENGTH,
  type ApplicationUpdateSnapshot,
  isApplicationUpdateSnapshot,
  isApplicationUpdateVersion,
} from './application-updates.js'

const snapshot = (): ApplicationUpdateSnapshot => ({
  availableVersion: null,
  currentVersion: '0.1.0-dev.1',
  downloadedBytes: null,
  notesTruncated: false,
  releaseNotes: null,
  status: 'idle',
  totalBytes: null,
  verification: null,
})
const available = (): ApplicationUpdateSnapshot => ({
  ...snapshot(),
  availableVersion: '0.1.0',
  releaseNotes: 'Release notes are plain text.',
  status: 'available',
  verification: 'metadata-only',
})

test('application update snapshots cover the exact explicit check/download state domain', () => {
  for (const status of APPLICATION_UPDATE_STATUSES) {
    const carriesVersion = ['available', 'download-error', 'downloaded', 'downloading'].includes(
      status,
    )
    const value = carriesVersion ? { ...available(), status } : { ...snapshot(), status }
    if (status === 'downloaded') {
      value.downloadedBytes = 128
      value.totalBytes = 128
    }
    assert.equal(isApplicationUpdateSnapshot(value), true, status)
  }
  assert.equal(isApplicationUpdateSnapshot(Object.freeze(snapshot())), true)
  assert.equal(isApplicationUpdateSnapshot(Object.assign(Object.create(null), snapshot())), true)
  for (const status of ['installed', 'installing', 'canceled', 'ready', '']) {
    assert.equal(isApplicationUpdateSnapshot({ ...snapshot(), status }), false)
  }
})

test('only an available update can carry a distinct version and bounded plain-text notes', () => {
  for (const releaseNotes of [
    null,
    '',
    'Text\n<em>is not executable markup</em>',
    'x'.repeat(16_000),
  ]) {
    assert.equal(isApplicationUpdateSnapshot({ ...available(), releaseNotes }), true)
  }
  assert.equal(
    isApplicationUpdateSnapshot({
      ...available(),
      notesTruncated: true,
      releaseNotes: 'x'.repeat(APPLICATION_UPDATE_NOTES_MAX_LENGTH),
    }),
    true,
  )
  for (const status of APPLICATION_UPDATE_STATUSES.filter(
    (value) => !['available', 'download-error', 'downloaded', 'downloading'].includes(value),
  )) {
    for (const patch of [
      { availableVersion: '1.0.0' },
      { notesTruncated: true },
      { releaseNotes: '' },
    ]) {
      assert.equal(isApplicationUpdateSnapshot({ ...snapshot(), status, ...patch }), false)
    }
  }
  for (const patch of [
    { availableVersion: null },
    { availableVersion: snapshot().currentVersion },
    { notesTruncated: true, releaseNotes: null },
    { releaseNotes: 'x'.repeat(APPLICATION_UPDATE_NOTES_MAX_LENGTH + 1) },
    { releaseNotes: [{ note: 'private structure', version: '1.0.0' }] },
    { releaseNotes: 1 },
    { notesTruncated: 1 },
  ]) {
    assert.equal(isApplicationUpdateSnapshot({ ...available(), ...patch }), false)
  }
})

test('public versions are bounded strict SemVer labels instead of paths or provider data', () => {
  for (const value of ['0.0.0', '1.2.3', '10.20.30-alpha.1', '1.2.3-rc-1+build.0001']) {
    assert.equal(isApplicationUpdateVersion(value), true, value)
    assert.equal(isApplicationUpdateSnapshot({ ...snapshot(), currentVersion: value }), true)
    assert.equal(isApplicationUpdateSnapshot({ ...available(), availableVersion: value }), true)
  }
  const maximum = `1.2.3+${'x'.repeat(APPLICATION_UPDATE_VERSION_MAX_LENGTH - 6)}`
  assert.equal(maximum.length, APPLICATION_UPDATE_VERSION_MAX_LENGTH)
  assert.equal(isApplicationUpdateVersion(maximum), true)
  for (const value of [
    null,
    undefined,
    123,
    '',
    'v1.2.3',
    '1.2',
    '1.2.3.4',
    '01.2.3',
    '1.02.3',
    '1.2.03',
    '1.2.3-01',
    '1.2.3-alpha..1',
    '1.2.3+',
    '1.2.3\n',
    '1.2.3 ',
    ' 1.2.3',
    '1.2.3-версия',
    'https://provider.example/1.2.3',
    '/private/1.2.3',
    `${maximum}x`,
  ]) {
    assert.equal(isApplicationUpdateVersion(value), false)
    assert.equal(isApplicationUpdateSnapshot({ ...snapshot(), currentVersion: value }), false)
    assert.equal(isApplicationUpdateSnapshot({ ...available(), availableVersion: value }), false)
  }
})

test('download progress cannot imply completion or carry unbounded/native data', () => {
  const downloading = { ...available(), status: 'downloading' }
  assert.equal(isApplicationUpdateSnapshot(downloading), true)
  assert.equal(
    isApplicationUpdateSnapshot({ ...downloading, downloadedBytes: 0, totalBytes: 1 }),
    true,
  )
  assert.equal(
    isApplicationUpdateSnapshot({ ...downloading, downloadedBytes: 1, totalBytes: 1 }),
    true,
  )
  for (const patch of [
    { downloadedBytes: -1, totalBytes: 1 },
    { downloadedBytes: 2, totalBytes: 1 },
    { downloadedBytes: 0, totalBytes: 0 },
    { downloadedBytes: null, totalBytes: 1 },
    { downloadedBytes: 1, totalBytes: null },
    { downloadedBytes: 0.5, totalBytes: 1 },
    { downloadedBytes: 0, totalBytes: Number.POSITIVE_INFINITY },
    { downloadedBytes: 0, totalBytes: Number.MAX_SAFE_INTEGER + 1 },
    { downloadedBytes: '1', totalBytes: 1 },
  ]) {
    assert.equal(isApplicationUpdateSnapshot({ ...downloading, ...patch }), false)
  }
  for (const status of ['available', 'download-error', 'idle', 'error', 'checking']) {
    assert.equal(
      isApplicationUpdateSnapshot({ ...available(), downloadedBytes: 1, status, totalBytes: 1 }),
      false,
    )
  }
  assert.equal(isApplicationUpdateSnapshot({ ...available(), status: 'downloaded' }), false)
  assert.equal(
    isApplicationUpdateSnapshot({
      ...available(),
      downloadedBytes: 2,
      status: 'downloaded',
      totalBytes: 3,
    }),
    false,
  )
  assert.equal(
    isApplicationUpdateSnapshot({
      ...available(),
      downloadedBytes: 3,
      status: 'downloaded',
      totalBytes: 3,
    }),
    true,
  )
})

test('the exact public snapshot rejects missing/private fields without executing accessors', () => {
  let reads = 0
  const accessor = snapshot()
  Object.defineProperty(accessor, 'status', {
    enumerable: true,
    get: () => {
      reads++
      return 'idle'
    },
  })
  const hidden = snapshot()
  Object.defineProperty(hidden, 'status', { enumerable: false, value: 'idle' })
  const missing: Partial<ApplicationUpdateSnapshot> = snapshot()
  delete missing.releaseNotes
  for (const value of [
    null,
    undefined,
    false,
    1,
    '',
    [],
    new Date(),
    missing,
    accessor,
    hidden,
    Object.assign(Object.create({ inherited: true }), snapshot()),
    { ...snapshot(), [Symbol('private')]: true },
    ...['url', 'feed', 'path', 'sha512', 'downloadPromise', 'install', 'error'].map((key) => ({
      ...snapshot(),
      [key]: '/private/provider-data',
    })),
    new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error('private')
        },
      },
    ),
    new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('private')
        },
      },
    ),
    new Proxy(snapshot(), {
      getOwnPropertyDescriptor: () => {
        throw new Error('private')
      },
    }),
  ]) {
    assert.equal(isApplicationUpdateSnapshot(value), false)
  }
  assert.equal(reads, 0)
})

test('verification describes signed metadata without exposing installer authority', () => {
  for (const verification of ['metadata-only', 'signed-release'] as const) {
    assert.equal(isApplicationUpdateSnapshot({ ...available(), verification }), true)
  }
  for (const verification of [null, true, 'ready-to-install', 'trusted-runtime', '/private/key']) {
    assert.equal(isApplicationUpdateSnapshot({ ...available(), verification }), false)
  }
  assert.equal(
    isApplicationUpdateSnapshot({ ...snapshot(), verification: 'signed-release' }),
    false,
  )
  assert.equal(
    isApplicationUpdateSnapshot({ ...available(), verifiedArtifact: { path: '/private/cache' } }),
    false,
  )
  assert.equal(isApplicationUpdateSnapshot({ ...available(), manifest: {} }), false)
  const missing: Partial<ApplicationUpdateSnapshot> = available()
  delete missing.verification
  assert.equal(isApplicationUpdateSnapshot(missing), false)
})
