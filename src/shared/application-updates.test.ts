import assert from 'node:assert/strict'
import test from 'node:test'

import {
  APPLICATION_UPDATE_NOTES_MAX_LENGTH,
  APPLICATION_UPDATE_STATUSES,
  APPLICATION_UPDATE_VERSION_MAX_LENGTH,
  type ApplicationUpdateInstallationRequest,
  type ApplicationUpdateInstallPreview,
  type ApplicationUpdateSnapshot,
  isApplicationUpdateInstallationRequest,
  isApplicationUpdateInstallPreview,
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

const installPreview = (): ApplicationUpdateInstallPreview => ({
  activeModelInstallCount: 0,
  availableVersion: '0.2.0',
  generationStorageUnavailable: false,
  installationAvailable: false,
  openProjectCount: 2,
  preparingModelInstallCount: 0,
  resourceRemovalActive: false,
  unacceptedResultCount: 3,
  unfinishedJobCount: 4,
  unsavedProjectCount: 1,
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

test('install preview admits exact Main counts and marks unavailable generation counts as unknown', () => {
  for (const value of [
    installPreview(),
    Object.freeze(installPreview()),
    Object.assign(Object.create(null), installPreview()),
    { ...installPreview(), openProjectCount: 0, unsavedProjectCount: 0 },
    { ...installPreview(), openProjectCount: 2, unsavedProjectCount: 2 },
    { ...installPreview(), unacceptedResultCount: 0, unfinishedJobCount: 0 },
    { ...installPreview(), resourceRemovalActive: true },
    { ...installPreview(), installationAvailable: true },
    {
      ...installPreview(),
      generationStorageUnavailable: true,
      unacceptedResultCount: null,
      unfinishedJobCount: null,
    },
  ]) {
    assert.equal(isApplicationUpdateInstallPreview(value), true)
  }

  for (const field of [
    'activeModelInstallCount',
    'openProjectCount',
    'preparingModelInstallCount',
    'unsavedProjectCount',
    'unfinishedJobCount',
    'unacceptedResultCount',
  ] as const) {
    for (const invalid of [
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      '1',
      false,
      null,
    ]) {
      assert.equal(
        isApplicationUpdateInstallPreview({ ...installPreview(), [field]: invalid }),
        false,
        `${field}: ${String(invalid)}`,
      )
    }
  }
  for (const patch of [
    { availableVersion: '/private/update.AppImage' },
    { availableVersion: '01.2.0' },
    { availableVersion: null },
    { unsavedProjectCount: 3 },
    { generationStorageUnavailable: 1 },
    { resourceRemovalActive: 'yes' },
    { installationAvailable: 'yes' },
    { installationAvailable: undefined },
    { generationStorageUnavailable: true },
    { generationStorageUnavailable: true, unfinishedJobCount: null },
    { generationStorageUnavailable: true, unacceptedResultCount: null },
    { unacceptedResultCount: null, unfinishedJobCount: null },
  ]) {
    assert.equal(isApplicationUpdateInstallPreview({ ...installPreview(), ...patch }), false)
  }
})

test('install preview never exposes native capabilities and refuses accessors without executing them', () => {
  let reads = 0
  const accessor = installPreview()
  Object.defineProperty(accessor, 'unfinishedJobCount', {
    enumerable: true,
    get: () => {
      reads++
      return 4
    },
  })
  const hidden = installPreview()
  Object.defineProperty(hidden, 'availableVersion', { enumerable: false, value: '0.2.0' })
  const missing: Partial<ApplicationUpdateInstallPreview> = installPreview()
  delete missing.resourceRemovalActive
  for (const value of [
    null,
    undefined,
    [],
    false,
    1,
    '',
    new Date(),
    missing,
    accessor,
    hidden,
    Object.assign(Object.create({ inherited: true }), installPreview()),
    { ...installPreview(), [Symbol('private')]: true },
    ...['path', 'feed', 'manifest', 'backupPath', 'install', 'token', 'releaseNotes'].map(
      (key) => ({ ...installPreview(), [key]: '/private/provider' }),
    ),
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
    new Proxy(installPreview(), {
      getOwnPropertyDescriptor: () => {
        throw new Error('private')
      },
    }),
  ]) {
    assert.equal(isApplicationUpdateInstallPreview(value), false)
  }
  assert.equal(reads, 0)
})

test('installation request is an exact close acknowledgement rather than an installed or restarted result', () => {
  const request: ApplicationUpdateInstallationRequest = {
    availableVersion: '0.2.0',
    status: 'close-requested',
  }
  for (const value of [
    request,
    Object.freeze({ ...request }),
    Object.assign(Object.create(null), request),
  ]) {
    assert.equal(isApplicationUpdateInstallationRequest(value), true)
  }
  for (const value of [
    null,
    undefined,
    false,
    [],
    new Date(),
    {},
    { availableVersion: '0.2.0' },
    { status: 'close-requested' },
    { ...request, availableVersion: '/private/next.AppImage' },
    { ...request, availableVersion: '01.2.0' },
    { ...request, availableVersion: null },
    ...['installed', 'restarting', 'ready', 'canceled', true, null].map((status) => ({
      ...request,
      status,
    })),
    ...['path', 'manifest', 'backupPath', 'scheduler', 'engineReady'].map((key) => ({
      ...request,
      [key]: true,
    })),
    { ...request, [Symbol('private')]: true },
    Object.assign(Object.create({ inherited: true }), request),
  ]) {
    assert.equal(isApplicationUpdateInstallationRequest(value), false)
  }
})

test('installation acknowledgement refuses hidden data, accessors and hostile reflection without reading them', () => {
  const request = { availableVersion: '0.2.0', status: 'close-requested' }
  let reads = 0
  const accessor = Object.defineProperty({ ...request }, 'status', {
    enumerable: true,
    get: () => {
      reads++
      return 'close-requested'
    },
  })
  const hidden = Object.defineProperty({ ...request }, 'availableVersion', {
    enumerable: false,
    value: '0.2.0',
  })
  for (const value of [
    accessor,
    hidden,
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
    new Proxy(request, {
      getOwnPropertyDescriptor: () => {
        throw new Error('private')
      },
    }),
  ]) {
    assert.equal(isApplicationUpdateInstallationRequest(value), false)
  }
  assert.equal(reads, 0)
})
