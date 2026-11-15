import { type ApiResult, ipcChannels } from '../../shared/api.js'
import type { ApplicationUpdateSnapshot } from '../../shared/application-updates.js'

/** Controlled check service ports; no installer, Electron network or shipping qualification. */
import assert from 'node:assert/strict'
import test from 'node:test'

import { registerApplicationUpdateIpc } from './application-update-ipc.js'

type Handler = Parameters<Parameters<typeof registerApplicationUpdateIpc>[0]['handle']>[1]
type Request = Parameters<Handler>[0]
type Channel = keyof typeof ipcChannels.applicationUpdates

const snapshot = (
  status: ApplicationUpdateSnapshot['status'] = 'idle',
): ApplicationUpdateSnapshot => ({
  availableVersion: status === 'available' ? '0.1.0' : null,
  currentVersion: '0.1.0-dev.1',
  notesTruncated: false,
  releaseNotes: status === 'available' ? 'Changes' : null,
  status,
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
function fixture() {
  const caller = { mainFrame: {} }
  const handlers = new Map<string, Handler>()
  const controls = {
    check: async (): Promise<ApplicationUpdateSnapshot> => snapshot('up-to-date'),
    getStatus: (): ApplicationUpdateSnapshot => snapshot(),
  }
  const calls = { check: 0, getStatus: 0 }
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
      getStatus: () => {
        calls.getStatus++
        return controls.getStatus()
      },
    },
  )
  const invoke = async (channel: Channel, args: unknown[] = [], request?: Request) => {
    const handler = handlers.get(ipcChannels.applicationUpdates[channel])
    assert.ok(handler)
    return await handler(request ?? { sender: caller, senderFrame: caller.mainFrame }, ...args)
  }
  return { caller, calls, controls, handlers, invoke, lifetime }
}

test('read-only update getter copies the current service result and never invokes check', async () => {
  const f = fixture()
  const original = snapshot('available')
  f.controls.getStatus = () => original
  const result = value(await f.invoke('getStatus'))
  assert.deepEqual(result, original)
  result.releaseNotes = 'Renderer-local change'
  assert.equal(original.releaseNotes, 'Changes')
  assert.deepEqual(f.calls, { check: 0, getStatus: 1 })
  assert.deepEqual([...f.handlers.keys()].sort(), [
    'application-updates:check',
    'application-updates:get-status',
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
  assert.deepEqual(f.calls, { check: 2, getStatus: 0 })
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
  assert.deepEqual(f.calls, { check: 0, getStatus: 0 })
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
  assert.deepEqual(f.calls, { check: 1, getStatus: 1 })
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
  assert.deepEqual(f.calls, { check: 1, getStatus: 0 })
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
