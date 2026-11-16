import { type ApiResult, ipcChannels } from '../../shared/api.js'
import type {
  ApplicationUpdateInstallationRequest,
  ApplicationUpdateInstallPreview,
  ApplicationUpdateSnapshot,
} from '../../shared/application-updates.js'

/** Controlled check service ports; no installer, Electron network or shipping qualification. */
import assert from 'node:assert/strict'
import test from 'node:test'

import { registerApplicationUpdateIpc } from './application-update-ipc.js'
import {
  ApplicationUpdateCurrentSourceError,
  ApplicationUpdateRecoveryRequiredError,
} from './application-update-service.js'

type Handler = Parameters<Parameters<typeof registerApplicationUpdateIpc>[0]['handle']>[1]
type Request = Parameters<Handler>[0]
type Channel = keyof typeof ipcChannels.applicationUpdates

const snapshot = (
  status: ApplicationUpdateSnapshot['status'] = 'idle',
): ApplicationUpdateSnapshot => ({
  availableVersion: status === 'available' ? '0.1.0' : null,
  currentVersion: '0.1.0-dev.1',
  downloadedBytes: null,
  notesTruncated: false,
  releaseNotes: status === 'available' ? 'Changes' : null,
  status,
  totalBytes: null,
  verification: status === 'available' ? 'metadata-only' : null,
})

const preview = (availableVersion = '0.1.0'): ApplicationUpdateInstallPreview => ({
  activeModelInstallCount: 2,
  availableVersion,
  generationStorageUnavailable: false,
  installationAvailable: true,
  openProjectCount: 3,
  preparingModelInstallCount: 1,
  resourceRemovalActive: true,
  unacceptedResultCount: 4,
  unfinishedJobCount: 5,
  unsavedProjectCount: 2,
})

function value(result: ApiResult<unknown>): ApplicationUpdateSnapshot {
  assert.equal(result.ok, true)
  return result.value as ApplicationUpdateSnapshot
}
function failure(result: ApiResult<unknown>, code: string) {
  assert.equal(result.ok, false)
  if (result.ok) {
    throw new Error('Expected refusal')
  }
  assert.equal(result.error.code, code)
  return result.error
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, failed) => {
    resolve = done
    reject = failed
  })
  return { promise, reject, resolve }
}
function fixture(withInstallation = true) {
  const caller = { mainFrame: {} }
  const handlers = new Map<string, Handler>()
  const controls = {
    check: async (): Promise<ApplicationUpdateSnapshot> => snapshot('up-to-date'),
    download: async (_version: string): Promise<ApplicationUpdateSnapshot> => ({
      ...snapshot('available'),
      downloadedBytes: 128,
      status: 'downloaded',
      totalBytes: 128,
    }),
    getStatus: (): ApplicationUpdateSnapshot => snapshot(),
    install: async (
      availableVersion: string,
      isCurrent: () => boolean,
    ): Promise<ApplicationUpdateInstallationRequest> => {
      assert.equal(isCurrent(), true)
      return { availableVersion, status: 'close-requested' }
    },
    reviewInstallation: async (version: string): Promise<ApplicationUpdateInstallPreview> =>
      preview(version),
  }
  const calls = { check: 0, download: 0, getStatus: 0 }
  const previewVersions: string[] = []
  const installationVersions: string[] = []
  const lifetime = registerApplicationUpdateIpc(
    {
      handle: (channel, handler) => {
        assert.equal(handlers.has(channel), false)
        handlers.set(channel, handler)
      },
      removeHandler: (channel) => {
        handlers.delete(channel)
      },
    },
    caller,
    {
      check: async () => {
        calls.check++
        return await controls.check()
      },
      download: async (version) => {
        calls.download++
        return await controls.download(version)
      },
      getStatus: () => {
        calls.getStatus++
        return controls.getStatus()
      },
      reviewInstallation: async (version) => {
        previewVersions.push(version)
        return await controls.reviewInstallation(version)
      },
    },
    withInstallation
      ? async (version, isCurrent) => {
          installationVersions.push(version)
          return await controls.install(version, isCurrent)
        }
      : undefined,
  )
  const invoke = async (channel: Channel, args: unknown[] = [], request?: Request) => {
    const handler = handlers.get(ipcChannels.applicationUpdates[channel])
    assert.ok(handler)
    return await handler(request ?? { sender: caller, senderFrame: caller.mainFrame }, ...args)
  }
  return {
    caller,
    calls,
    controls,
    handlers,
    installationVersions,
    invoke,
    lifetime,
    previewVersions,
  }
}

test('read-only update getter copies the current service result and never invokes check', async () => {
  const f = fixture()
  const original = snapshot('available')
  f.controls.getStatus = () => original
  const result = value(await f.invoke('getStatus'))
  assert.deepEqual(result, original)
  result.releaseNotes = 'Renderer-local change'
  assert.equal(original.releaseNotes, 'Changes')
  assert.deepEqual(f.calls, { check: 0, download: 0, getStatus: 1 })
  assert.deepEqual([...f.handlers.keys()].sort(), [
    'application-updates:check',
    'application-updates:download',
    'application-updates:get-status',
    'application-updates:install',
    'application-updates:review-installation',
  ])
})

test('only the explicit zero-argument check invokes the service and exposes its bounded snapshot', async () => {
  const f = fixture()
  assert.equal(value(await f.invoke('check')).status, 'up-to-date')
  f.controls.check = async () => snapshot('available')
  const original = snapshot('available')
  f.controls.check = async () => original
  const returned = value(await f.invoke('check'))
  assert.deepEqual(returned, original)
  returned.availableVersion = '2.0.0'
  assert.equal(original.availableVersion, '0.1.0')
  assert.deepEqual(f.calls, { check: 2, download: 0, getStatus: 0 })
})

test('foreign sender/subframe, stale frame and arbitrary feed/key arguments cannot reach either service port', async () => {
  const f = fixture()
  const previous = f.caller.mainFrame
  f.caller.mainFrame = {}
  for (const channel of ['check', 'getStatus'] as const) {
    for (const request of [
      { sender: {}, senderFrame: f.caller.mainFrame },
      { sender: f.caller, senderFrame: {} },
      { sender: f.caller, senderFrame: previous },
      { sender: f.caller, senderFrame: null },
    ]) {
      failure(await f.invoke(channel, [], request), 'IPC_INVALID_CALLER')
    }
    for (const args of [
      [undefined],
      ['https://provider.example/feed'],
      [{ key: 'secret' }],
      [1, 2],
    ]) {
      failure(await f.invoke(channel, args), 'IPC_INVALID_CALLER')
    }
  }
  assert.deepEqual(f.calls, { check: 0, download: 0, getStatus: 0 })
})

test('document invalidation refuses an old pending result while the new document reads actual completed state', async () => {
  const f = fixture()
  const entered = deferred<void>()
  const completed = deferred<ApplicationUpdateSnapshot>()
  f.controls.check = async () => {
    entered.resolve()
    return await completed.promise
  }
  const old = f.invoke('check')
  await entered.promise
  f.lifetime.invalidateDocument()
  f.controls.getStatus = () => snapshot('available')
  completed.resolve(snapshot('available'))
  failure(await old, 'IPC_INVALID_CALLER')
  assert.equal(value(await f.invoke('getStatus')).status, 'available')
  assert.deepEqual(f.calls, { check: 1, download: 0, getStatus: 1 })
})

test('current frame is rechecked after pending success and after a pending native error', async () => {
  for (const rejected of [false, true]) {
    const f = fixture()
    const entered = deferred<void>()
    const completed = deferred<ApplicationUpdateSnapshot>()
    f.controls.check = async () => {
      entered.resolve()
      return await completed.promise
    }
    const old = f.invoke('check')
    await entered.promise
    f.caller.mainFrame = {}
    if (rejected) {
      completed.reject(new Error('/private/provider/secret'))
    } else {
      completed.resolve(snapshot('available'))
    }
    assert.deepEqual(failure(await old, 'IPC_INVALID_CALLER'), {
      code: 'IPC_INVALID_CALLER',
      message: 'Application update request was rejected.',
    })
    assert.equal(value(await f.invoke('getStatus')).status, 'idle')
  }
})

test('dispose removes both handlers and rejects retained/pending callbacks without checking again', async () => {
  const f = fixture()
  const entered = deferred<void>()
  const completed = deferred<ApplicationUpdateSnapshot>()
  f.controls.check = async () => {
    entered.resolve()
    return await completed.promise
  }
  const handler = f.handlers.get(ipcChannels.applicationUpdates.check)!
  const pending = f.invoke('check')
  await entered.promise
  f.lifetime.dispose()
  assert.equal(f.handlers.size, 0)
  completed.resolve(snapshot('up-to-date'))
  failure(await pending, 'IPC_INVALID_CALLER')
  failure(
    await handler({ sender: f.caller, senderFrame: f.caller.mainFrame }),
    'IPC_INVALID_CALLER',
  )
  assert.deepEqual(f.calls, { check: 1, download: 0, getStatus: 0 })
})

test('native errors and invalid service snapshots cannot leak provider paths or capabilities', async () => {
  for (const channel of ['check', 'getStatus'] as const) {
    const f = fixture()
    const privateError = () => {
      throw new Error('https://provider.example/private?key=secret')
    }
    f.controls.check = async () => privateError()
    f.controls.getStatus = privateError
    assert.deepEqual(failure(await f.invoke(channel), 'APPLICATION_UPDATE_CHECK_FAILED'), {
      code: 'APPLICATION_UPDATE_CHECK_FAILED',
      message: 'The application could not check for updates. Try again.',
    })
    const privateSnapshot = {
      ...snapshot(),
      feed: '/private/provider',
    } as ApplicationUpdateSnapshot
    f.controls.check = async () => privateSnapshot
    f.controls.getStatus = () => privateSnapshot
    assert.deepEqual(failure(await f.invoke(channel), 'IPC_INVALID_RESPONSE'), {
      code: 'IPC_INVALID_RESPONSE',
      message: 'The application returned an invalid update status.',
    })
  }
})

test('only a displayed version reaches explicit Download and stale document completion stays retired', async () => {
  const f = fixture()
  for (const args of [
    [],
    [undefined],
    ['https://private.example/app.AppImage'],
    ['0.1.0', 'extra'],
    [{ version: '0.1.0' }],
  ]) {
    failure(await f.invoke('download', args), 'IPC_INVALID_CALLER')
  }
  for (const request of [
    { sender: {}, senderFrame: f.caller.mainFrame },
    { sender: f.caller, senderFrame: {} },
  ]) {
    failure(await f.invoke('download', ['0.1.0'], request), 'IPC_INVALID_CALLER')
  }
  assert.equal(f.calls.download, 0)
  const entered = deferred<void>()
  const completed = deferred<ApplicationUpdateSnapshot>()
  f.controls.download = async (version) => {
    assert.equal(version, '0.1.0')
    entered.resolve()
    return await completed.promise
  }
  const pending = f.invoke('download', ['0.1.0'])
  await entered.promise
  f.lifetime.invalidateDocument()
  const downloaded: ApplicationUpdateSnapshot = {
    ...snapshot('available'),
    downloadedBytes: 128,
    status: 'downloaded',
    totalBytes: 128,
  }
  completed.resolve(downloaded)
  failure(await pending, 'IPC_INVALID_CALLER')
  f.controls.getStatus = () => downloaded
  assert.equal(value(await f.invoke('getStatus')).status, 'downloaded')
  assert.equal(f.calls.download, 1)
  assert.equal(f.calls.check, 0)
})

test('download errors are fixed public diagnostics and native file paths never escape', async () => {
  const f = fixture()
  f.controls.download = async () => {
    throw new Error('/private/cache/pending/app.AppImage')
  }
  assert.deepEqual(
    failure(await f.invoke('download', ['0.1.0']), 'APPLICATION_UPDATE_DOWNLOAD_FAILED'),
    {
      code: 'APPLICATION_UPDATE_DOWNLOAD_FAILED',
      message: 'The application could not download the update. Try again.',
    },
  )
  f.controls.download = async () =>
    ({
      ...snapshot('available'),
      path: '/private/cache/pending/app.AppImage',
    }) as ApplicationUpdateSnapshot
  failure(await f.invoke('download', ['0.1.0']), 'IPC_INVALID_RESPONSE')
})

test('explicit impact review accepts only one version from the current frame and returns a detached projection', async () => {
  const f = fixture()
  const original = preview()
  f.controls.reviewInstallation = async () => original
  const result = await f.invoke('reviewInstallation', ['0.1.0'])
  assert.equal(result.ok, true)
  if (!result.ok) {
    throw new Error('Expected an impact preview')
  }
  assert.deepEqual(result.value, original)
  assert.notEqual(result.value, original)
  result.value.unsavedProjectCount = 0
  assert.equal(original.unsavedProjectCount, 2)
  assert.deepEqual(f.previewVersions, ['0.1.0'])
  assert.deepEqual(f.calls, { check: 0, download: 0, getStatus: 0 })

  const previous = f.caller.mainFrame
  f.caller.mainFrame = {}
  for (const args of [
    [],
    [undefined],
    [null],
    [''],
    ['/private/update.AppImage'],
    ['0.1.0', {}],
    [{ version: '0.1.0' }],
  ]) {
    failure(await f.invoke('reviewInstallation', args), 'IPC_INVALID_CALLER')
  }
  for (const request of [
    { sender: {}, senderFrame: f.caller.mainFrame },
    { sender: f.caller, senderFrame: {} },
    { sender: f.caller, senderFrame: previous },
    { sender: f.caller, senderFrame: null },
  ]) {
    failure(await f.invoke('reviewInstallation', ['0.1.0'], request), 'IPC_INVALID_CALLER')
  }
  assert.deepEqual(f.previewVersions, ['0.1.0'])
})

test('review results and errors cannot cross document invalidation, frame replacement or disposal', async () => {
  for (const invalidation of ['document', 'frame', 'dispose'] as const) {
    for (const rejects of [false, true]) {
      const f = fixture()
      const entered = deferred<void>()
      const completed = deferred<ApplicationUpdateInstallPreview>()
      f.controls.reviewInstallation = async () => {
        entered.resolve()
        return await completed.promise
      }
      const handler = f.handlers.get(ipcChannels.applicationUpdates.reviewInstallation)!
      const pending = f.invoke('reviewInstallation', ['0.1.0'])
      await entered.promise
      if (invalidation === 'document') {
        f.lifetime.invalidateDocument()
      } else if (invalidation === 'frame') {
        f.caller.mainFrame = {}
      } else {
        f.lifetime.dispose()
      }
      if (rejects) {
        completed.reject(new Error('/private/preview/secret'))
      } else {
        completed.resolve(preview())
      }
      failure(await pending, 'IPC_INVALID_CALLER')
      if (invalidation === 'dispose') {
        assert.equal(f.handlers.size, 0)
        failure(
          await handler({ sender: f.caller, senderFrame: f.caller.mainFrame }, '0.1.0'),
          'IPC_INVALID_CALLER',
        )
      }
      assert.deepEqual(f.previewVersions, ['0.1.0'])
      assert.deepEqual(f.calls, { check: 0, download: 0, getStatus: 0 })
    }
  }
})

test('impact review refuses malformed or mismatched projections and sanitizes native failures', async () => {
  const f = fixture()
  f.controls.reviewInstallation = async () => {
    throw new Error('/private/staging/path?key=secret')
  }
  assert.deepEqual(
    failure(await f.invoke('reviewInstallation', ['0.1.0']), 'APPLICATION_UPDATE_PREVIEW_FAILED'),
    {
      code: 'APPLICATION_UPDATE_PREVIEW_FAILED',
      message: 'The application could not review installation impact. Try again.',
    },
  )
  for (const invalid of [
    { ...preview(), path: '/private/cache/update.AppImage' },
    { ...preview(), unsavedProjectCount: 4 },
    { ...preview(), unfinishedJobCount: null },
    { ...preview(), generationStorageUnavailable: true },
    preview('0.2.0'),
  ]) {
    f.controls.reviewInstallation = async () => invalid
    failure(await f.invoke('reviewInstallation', ['0.1.0']), 'IPC_INVALID_RESPONSE')
  }
})

for (const action of ['reviewInstallation', 'install'] as const) {
  test(`${action} exposes only the fixed retained-update refusal and grants no further close attempt`, async () => {
    const f = fixture()
    const error = new ApplicationUpdateRecoveryRequiredError()
    error.message = '/private/retained/journal.json?key=secret'
    if (action === 'install') {
      await f.invoke('reviewInstallation', ['0.1.0'])
      f.controls.install = async () => {
        throw error
      }
    } else {
      f.controls.reviewInstallation = async () => {
        throw error
      }
    }
    assert.deepEqual(
      failure(await f.invoke(action, ['0.1.0']), 'APPLICATION_UPDATE_RECOVERY_REQUIRED'),
      {
        code: 'APPLICATION_UPDATE_RECOVERY_REQUIRED',
        message:
          'Application update recovery is required before installation. Your Projects remain open.',
      },
    )
    failure(await f.invoke('install', ['0.1.0']), 'APPLICATION_UPDATE_INSTALL_FAILED')
    assert.equal(f.installationVersions.length, action === 'install' ? 1 : 0)
  })
}

test('an arbitrary native error with the recovery code cannot impersonate the typed refusal', async () => {
  const f = fixture()
  f.controls.reviewInstallation = async () => {
    throw Object.assign(new Error('/private/unknown'), {
      code: 'APPLICATION_UPDATE_RECOVERY_REQUIRED',
    })
  }
  failure(await f.invoke('reviewInstallation', ['0.1.0']), 'APPLICATION_UPDATE_PREVIEW_FAILED')
})

for (const action of ['reviewInstallation', 'install'] as const) {
  test(`${action} normalizes source-consistency refusal without preserving private diagnostics or close authority`, async () => {
    const f = fixture()
    const error = new ApplicationUpdateCurrentSourceError()
    error.message = '/private/native-archive/source?token=secret'
    if (action === 'install') {
      await f.invoke('reviewInstallation', ['0.1.0'])
      f.controls.install = async () => {
        throw error
      }
    } else {
      f.controls.reviewInstallation = async () => {
        throw error
      }
    }
    assert.deepEqual(
      failure(await f.invoke(action, ['0.1.0']), 'APPLICATION_UPDATE_CURRENT_SOURCE_UNAVAILABLE'),
      {
        code: 'APPLICATION_UPDATE_CURRENT_SOURCE_UNAVAILABLE',
        message:
          'The application changed or could not be checked. Restart ImageGen Studio before installing an update. Your Projects remain open.',
      },
    )
    failure(await f.invoke('install', ['0.1.0']), 'APPLICATION_UPDATE_INSTALL_FAILED')
    assert.equal(f.installationVersions.length, action === 'install' ? 1 : 0)
  })
}

test('a native error cannot impersonate source-consistency refusal by its code', async () => {
  const f = fixture()
  f.controls.reviewInstallation = async () => {
    throw Object.assign(new Error('/private/changed'), {
      code: 'APPLICATION_UPDATE_CURRENT_SOURCE_UNAVAILABLE',
    })
  }
  failure(await f.invoke('reviewInstallation', ['0.1.0']), 'APPLICATION_UPDATE_PREVIEW_FAILED')
})

/** Install remains a controlled Main callback here, not Electron close or executable acceptance. */
test('Install requires this document to review an eligible version before requesting normal close once', async () => {
  const f = fixture()
  failure(await f.invoke('install', ['0.1.0']), 'APPLICATION_UPDATE_INSTALL_FAILED')
  await f.invoke('reviewInstallation', ['0.1.0'])
  assert.equal(f.installationVersions.length, 0, 'Review never starts close.')
  failure(await f.invoke('install', ['0.2.0']), 'APPLICATION_UPDATE_INSTALL_FAILED')
  assert.equal(f.installationVersions.length, 0)
  const result = await f.invoke('install', ['0.1.0'])
  assert.deepEqual(result, {
    ok: true,
    value: { availableVersion: '0.1.0', status: 'close-requested' },
  })
  assert.deepEqual(f.installationVersions, ['0.1.0'])
  failure(await f.invoke('install', ['0.1.0']), 'APPLICATION_UPDATE_INSTALL_FAILED')
  assert.equal(
    f.installationVersions.length,
    1,
    'An old review cannot restart a later ordinary close.',
  )
  await f.invoke('reviewInstallation', ['0.1.0'])
  await f.invoke('install', ['0.1.0'])
  assert.deepEqual(f.installationVersions, ['0.1.0', '0.1.0'])
})

test('missing installer or unavailable eligibility never grants close authority', async () => {
  for (const installer of [false, true]) {
    const f = fixture(installer)
    f.controls.reviewInstallation = async () => ({
      ...preview(),
      installationAvailable: !installer,
    })
    assert.equal((await f.invoke('reviewInstallation', ['0.1.0'])).ok, true)
    failure(await f.invoke('install', ['0.1.0']), 'APPLICATION_UPDATE_INSTALL_FAILED')
    assert.equal(f.installationVersions.length, 0)
  }
})

test('Install rejects arbitrary arguments, foreign senders and stale frames before reaching Main', async () => {
  const f = fixture()
  await f.invoke('reviewInstallation', ['0.1.0'])
  for (const args of [
    [],
    [undefined],
    [null],
    [''],
    ['/private/next.AppImage'],
    ['0.1.0', preview()],
    [{ version: '0.1.0' }],
  ]) {
    failure(await f.invoke('install', args), 'IPC_INVALID_CALLER')
  }
  for (const request of [
    { sender: {}, senderFrame: f.caller.mainFrame },
    { sender: f.caller, senderFrame: {} },
    { sender: f.caller, senderFrame: null },
  ]) {
    failure(await f.invoke('install', ['0.1.0'], request), 'IPC_INVALID_CALLER')
  }
  assert.equal(f.installationVersions.length, 0)
  assert.equal((await f.invoke('install', ['0.1.0'])).ok, true)
})

for (const invalidation of ['none', 'document', 'frame', 'dispose'] as const) {
  test(`the trusted Install predicate after awaited preflight handles ${invalidation} before any close effect`, async () => {
    const f = fixture()
    const entered = deferred<void>()
    const completed = deferred<void>()
    let closeRequests = 0
    f.controls.install = async (availableVersion, isCurrent) => {
      entered.resolve()
      await completed.promise
      if (!isCurrent()) {
        throw new Error('The requesting document changed during validation.')
      }
      closeRequests++
      return { availableVersion, status: 'close-requested' }
    }
    await f.invoke('reviewInstallation', ['0.1.0'])
    const pending = f.invoke('install', ['0.1.0'])
    await entered.promise
    if (invalidation === 'document') {
      f.lifetime.invalidateDocument()
    }
    if (invalidation === 'frame') {
      f.caller.mainFrame = {}
    }
    if (invalidation === 'dispose') {
      f.lifetime.dispose()
    }
    completed.resolve()
    if (invalidation === 'none') {
      assert.deepEqual(await pending, {
        ok: true,
        value: { availableVersion: '0.1.0', status: 'close-requested' },
      })
      assert.equal(closeRequests, 1)
    } else {
      failure(await pending, 'IPC_INVALID_CALLER')
      assert.equal(closeRequests, 0)
    }
  })
}

test('pending Install refuses duplicate and competing actions while allowing read-only status', async () => {
  const f = fixture()
  const entered = deferred<void>()
  const completed = deferred<void>()
  f.controls.install = async (availableVersion, isCurrent) => {
    entered.resolve()
    await completed.promise
    assert.equal(isCurrent(), true, 'Refused competing actions must not revoke the active request.')
    return { availableVersion, status: 'close-requested' }
  }
  await f.invoke('reviewInstallation', ['0.1.0'])
  const pending = f.invoke('install', ['0.1.0'])
  await entered.promise
  try {
    for (const [channel, args] of [
      ['install', ['0.1.0']],
      ['check', []],
      ['download', ['0.1.0']],
      ['reviewInstallation', ['0.1.0']],
    ] as const) {
      failure(await f.invoke(channel, [...args]), 'APPLICATION_UPDATE_INSTALL_FAILED')
    }
    assert.equal(value(await f.invoke('getStatus')).status, 'idle')
    assert.deepEqual(f.calls, { check: 0, download: 0, getStatus: 1 })
    assert.deepEqual(f.previewVersions, ['0.1.0'])
    assert.deepEqual(f.installationVersions, ['0.1.0'])
  } finally {
    completed.resolve()
  }
  assert.equal((await pending).ok, true)
})

test('a new Check or Download retires review and a late old preview cannot grant installation', async () => {
  for (const action of ['check', 'download'] as const) {
    const f = fixture()
    await f.invoke('reviewInstallation', ['0.1.0'])
    await f.invoke(action, action === 'download' ? ['0.1.0'] : [])
    failure(await f.invoke('install', ['0.1.0']), 'APPLICATION_UPDATE_INSTALL_FAILED')
    assert.equal(f.installationVersions.length, 0)
  }
  const f = fixture()
  const entered = deferred<void>()
  const completed = deferred<ApplicationUpdateInstallPreview>()
  f.controls.reviewInstallation = async () => {
    entered.resolve()
    return await completed.promise
  }
  const pending = f.invoke('reviewInstallation', ['0.1.0'])
  await entered.promise
  await f.invoke('check')
  completed.resolve(preview())
  assert.equal(
    (await pending).ok,
    true,
    'The returned advisory DTO grants no capability by itself.',
  )
  failure(await f.invoke('install', ['0.1.0']), 'APPLICATION_UPDATE_INSTALL_FAILED')
  assert.equal(f.installationVersions.length, 0)
})

test('pre-close refusal sanitizes native details and requires another explicit review', async () => {
  const f = fixture()
  f.controls.install = async () => {
    throw new Error('/private/update/backup.AppImage?key=secret')
  }
  await f.invoke('reviewInstallation', ['0.1.0'])
  assert.deepEqual(
    failure(await f.invoke('install', ['0.1.0']), 'APPLICATION_UPDATE_INSTALL_FAILED'),
    {
      code: 'APPLICATION_UPDATE_INSTALL_FAILED',
      message: 'The application could not start installation. Review the update and try again.',
    },
  )
  failure(await f.invoke('install', ['0.1.0']), 'APPLICATION_UPDATE_INSTALL_FAILED')
  assert.deepEqual(f.installationVersions, ['0.1.0'])
})

test('Install response exposes only the requested close acknowledgement, never startup success or native authority', async () => {
  const f = fixture()
  for (const invalid of [
    { availableVersion: '0.2.0', status: 'close-requested' },
    { availableVersion: '0.1.0', status: 'installed' },
    { availableVersion: '0.1.0', path: '/private/next.AppImage', status: 'close-requested' },
    null,
  ]) {
    f.controls.install = async () => invalid as ApplicationUpdateInstallationRequest
    await f.invoke('reviewInstallation', ['0.1.0'])
    failure(await f.invoke('install', ['0.1.0']), 'IPC_INVALID_RESPONSE')
  }
  assert.equal(f.installationVersions.length, 4)
})
