import { type ApiResult, ipcChannels, type RuntimeStatus } from '../../shared/api.js'
import type { RuntimeSetupMode, RuntimeSetupReview } from '../../shared/runtime-setup.js'

/** Protocol/capability tests with explicit controlled manager ports; no installer/native claim. */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createEngineInstallPlan,
  ENGINE_OUTPAINT_INFILL_ARTIFACT_ID,
} from './engine-install-plan.js'
import { type RuntimeInstallationReview, RuntimeManager, type RuntimeRoots } from './index.js'
import { LAMA_OUTPAINT_ARTIFACT } from './lama-manifest.js'
import { registerRuntimeSetupIpc } from './runtime-setup-ipc.js'

type Handler = Parameters<Parameters<typeof registerRuntimeSetupIpc>[0]['handle']>[1]
type Request = Parameters<Handler>[0]
type Service = Parameters<typeof registerRuntimeSetupIpc>[2]
type Channel = keyof Pick<
  typeof ipcChannels.runtime,
  'discardInstallationReview' | 'getStatus' | 'install' | 'previewInstallation' | 'repair'
>

const firstToken = '11111111-1111-4111-8111-111111111111'
const secondToken = '22222222-2222-4222-8222-222222222222'
const ready: RuntimeStatus = { detail: 'Controlled ready', kind: 'ready', profile: 'linux-nvidia' }
const success = <T>(value: T): ApiResult<T> => ({ ok: true, value })

function value<T>(result: ApiResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.code)
  }
  assert.equal(result.ok, true)
  return result.value
}

function failure(result: ApiResult<unknown>, code: string): void {
  assert.equal(result.ok, false)
  if (result.ok) {
    throw new Error('Expected a domain refusal')
  }
  assert.equal(result.error.code, code)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  return {
    promise: new Promise<T>((done) => {
      resolve = done
    }),
    resolve,
  }
}

function engineReview(
  mode: RuntimeSetupMode = 'install',
  token = firstToken,
  reused = false,
): Extract<RuntimeInstallationReview, { scope: 'engine' }> {
  const runtime = {
    filename: 'runtime-payload.zip',
    id: 'python-runtime-transport',
    installedSizeBytes: null,
    sha256: 'a'.repeat(64),
    sizeBytes: 1024,
  }
  return {
    mode,
    plan: createEngineInstallPlan({
      runtimeArtifacts: [runtime],
      verifiedCachedRuntimeArtifacts: [
        {
          filename: runtime.filename,
          id: runtime.id,
          sha256: runtime.sha256,
          sizeBytes: runtime.sizeBytes,
        },
      ],
      verifiedInstalledArtifacts: reused
        ? [
            {
              filename: LAMA_OUTPAINT_ARTIFACT.filename,
              id: ENGINE_OUTPAINT_INFILL_ARTIFACT_ID,
              kind: 'outpaint-infill',
              sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
              sizeBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
            },
          ]
        : [],
    }),
    releaseId: 'controlled-engine-review',
    requiredFreeBytes: null,
    runtimeRequiredFreeBytes: 20 * 1024 ** 3,
    scope: 'engine',
    token,
    verifiedPayloadBytes: 4096,
  }
}

function fixture(supplied?: Service) {
  const caller = { mainFrame: {} }
  const handlers = new Map<string, Handler>()
  const calls: { action: string; input?: string }[] = []
  const controls: {
    install?: (token?: string) => Promise<ApiResult<RuntimeStatus>>
    preview?: (mode: RuntimeSetupMode) => Promise<ApiResult<RuntimeInstallationReview>>
    repair?: (token?: string) => Promise<ApiResult<RuntimeStatus>>
    status?: () => Promise<ApiResult<RuntimeStatus>>
  } = {}
  const service: Service = supplied ?? {
    getStatus: async () => {
      calls.push({ action: 'status' })
      return controls.status ? await controls.status() : success(ready)
    },
    install: async (token) => {
      calls.push({ action: 'install', input: token })
      return controls.install ? await controls.install(token) : success(ready)
    },
    previewInstallation: async (mode) => {
      calls.push({ action: 'preview', input: mode })
      return controls.preview ? await controls.preview(mode) : success(engineReview(mode))
    },
    repair: async (token) => {
      calls.push({ action: 'repair', input: token })
      return controls.repair ? await controls.repair(token) : success(ready)
    },
  }
  const lifetime = registerRuntimeSetupIpc(
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
    service,
  )
  const invoke = async (channel: Channel, args: unknown[] = [], request?: Request) => {
    const handler = handlers.get(ipcChannels.runtime[channel])
    assert.ok(handler)
    return await handler(request ?? { sender: caller, senderFrame: caller.mainFrame }, ...args)
  }
  return { caller, calls, controls, handlers, invoke, lifetime }
}

test('public engine review projects existing byte plan and exact core token without private inputs', async () => {
  for (const reused of [false, true]) {
    const f = fixture()
    f.controls.preview = async (mode) => {
      const review = engineReview(mode, firstToken, reused)
      Object.assign(review, {
        privatePath: '/controlled/private',
        trustedKeys: { private: 'never-public' },
      })
      return success(review)
    }
    const result = value(await f.invoke('previewInstallation', ['repair'])) as RuntimeSetupReview
    assert.deepEqual(result, {
      additionalInstalledBytes: null,
      downloadBytes: reused ? 0 : LAMA_OUTPAINT_ARTIFACT.sizeBytes,
      installedBytes: null,
      mode: 'repair',
      outpaintInfillReused: reused,
      releaseId: 'controlled-engine-review',
      requiredFreeBytes: null,
      runtimeRequiredFreeBytes: 20 * 1024 ** 3,
      runtimeSourceCached: true,
      scope: 'engine',
      source: 'verified-local-cache',
      token: firstToken,
    })
    assert.deepEqual(f.calls, [{ action: 'preview', input: 'repair' }])
    assert.equal(JSON.stringify(result).includes('private'), false)
    assert.equal(Object.hasOwn(result, 'plan'), false)
    assert.equal(Object.hasOwn(result, 'verifiedPayloadBytes'), false)
    assert.deepEqual(value(await f.invoke('repair', [firstToken])), ready)
    assert.deepEqual(f.calls.at(-1), { action: 'repair', input: firstToken })
  }
})

test('trusted main frame and exact arguments protect an issued review from foreign requests', async () => {
  const f = fixture()
  value(await f.invoke('previewInstallation', ['install']))
  for (const request of [
    { sender: {}, senderFrame: f.caller.mainFrame },
    { sender: f.caller, senderFrame: {} },
  ]) {
    for (const [channel, args] of [
      ['previewInstallation', ['repair']],
      ['discardInstallationReview', []],
      ['install', [firstToken]],
      ['repair', []],
      ['getStatus', []],
    ] as [Channel, unknown[]][]) {
      failure(await f.invoke(channel, args, request), 'IPC_INVALID_CALLER')
    }
  }
  for (const [channel, args] of [
    ['previewInstallation', []],
    ['previewInstallation', ['unsupported']],
    ['previewInstallation', ['install', '/renderer/path']],
    ['discardInstallationReview', [firstToken]],
    ['install', [null]],
    ['install', ['not-a-token']],
    ['install', [firstToken, {}]],
    ['getStatus', [{}]],
  ] as [Channel, unknown[]][]) {
    failure(await f.invoke(channel, args), 'IPC_INVALID_CALLER')
  }
  failure(await f.invoke('repair', [firstToken]), 'RUNTIME_INVALID_REVIEW')
  failure(await f.invoke('install', [secondToken]), 'RUNTIME_INVALID_REVIEW')
  assert.equal(f.calls.length, 1)
  value(await f.invoke('install', [firstToken]))
  failure(await f.invoke('install', [firstToken]), 'RUNTIME_INVALID_REVIEW')
  assert.deepEqual(f.calls, [
    { action: 'preview', input: 'install' },
    { action: 'install', input: firstToken },
  ])
})

test('zero-argument legacy actions stay unavailable even with a backend and revoke prior consent', async () => {
  const f = fixture()
  for (const channel of ['install', 'repair'] as const) {
    value(await f.invoke('previewInstallation', [channel]))
    const refused = await f.invoke(channel)
    failure(refused, 'RUNTIME_INSTALL_UNAVAILABLE')
    if (!refused.ok) {
      assert.equal(
        refused.error.message,
        'Verified release artifacts and a complete setup preview are not available in this build.',
      )
    }
    failure(await f.invoke(channel, [firstToken]), 'RUNTIME_INVALID_REVIEW')
  }
  assert.deepEqual(
    f.calls.map((call) => call.action),
    ['preview', 'preview'],
  )
})

test('discard and document invalidation revoke only unconsumed consent', async () => {
  const f = fixture()
  value(await f.invoke('previewInstallation', ['install']))
  assert.equal(value(await f.invoke('discardInstallationReview')), null)
  failure(await f.invoke('install', [firstToken]), 'RUNTIME_INVALID_REVIEW')
  value(await f.invoke('previewInstallation', ['repair']))
  f.lifetime.invalidateReview()
  failure(await f.invoke('repair', [firstToken]), 'RUNTIME_INVALID_REVIEW')
  value(await f.invoke('previewInstallation', ['install']))
  value(await f.invoke('install', [firstToken]))
  assert.equal(f.calls.filter((call) => call.action === 'install').length, 1)
})

test('a failed, thrown or slot-only new preview never preserves an older public capability', async () => {
  const f = fixture()
  for (const kind of ['failure', 'throw', 'slot'] as const) {
    f.controls.preview = async (mode) => success(engineReview(mode))
    value(await f.invoke('previewInstallation', ['install']))
    f.controls.preview = async (mode) => {
      if (kind === 'throw') {
        throw new Error('Controlled private diagnostic')
      }
      if (kind === 'failure') {
        return {
          error: { code: 'RUNTIME_INSTALL_UNAVAILABLE', message: 'Controlled no provider' },
          ok: false,
        }
      }
      return success({
        mode,
        releaseId: 'slot-only',
        requiredFreeBytes: 10,
        scope: 'python-runtime-slot',
        token: secondToken,
        verifiedPayloadBytes: 1,
      })
    }
    failure(
      await f.invoke('previewInstallation', ['install']),
      kind === 'throw' ? 'RUNTIME_INTERNAL_ERROR' : 'RUNTIME_INSTALL_UNAVAILABLE',
    )
    failure(await f.invoke('install', [firstToken]), 'RUNTIME_INVALID_REVIEW')
  }
  assert.equal(
    f.calls.some((call) => call.action === 'install'),
    false,
  )
})

test('overlapping preview is refused without queueing and its older pending response stays revoked', async () => {
  const f = fixture()
  const entered = deferred<void>()
  const pending = deferred<ApiResult<RuntimeInstallationReview>>()
  f.controls.preview = async () => {
    entered.resolve()
    return await pending.promise
  }
  const first = f.invoke('previewInstallation', ['install'])
  try {
    await entered.promise
    failure(await f.invoke('previewInstallation', ['repair']), 'RUNTIME_INSTALL_BUSY')
    assert.equal(f.calls.length, 1)
    pending.resolve(success(engineReview()))
    failure(await first, 'RUNTIME_INVALID_REVIEW')
    failure(await f.invoke('install', [firstToken]), 'RUNTIME_INVALID_REVIEW')
    f.controls.preview = async (mode) => success(engineReview(mode, secondToken))
    value(await f.invoke('previewInstallation', ['repair']))
    value(await f.invoke('repair', [secondToken]))
  } finally {
    pending.resolve(success(engineReview()))
    await first
  }
})

test('late preview cannot issue a capability after navigation, changed frame, discard or disposal', async () => {
  for (const cause of ['navigation', 'frame', 'discard', 'dispose'] as const) {
    const f = fixture()
    const entered = deferred<void>()
    const pending = deferred<ApiResult<RuntimeInstallationReview>>()
    f.controls.preview = async () => {
      entered.resolve()
      return await pending.promise
    }
    const response = f.invoke('previewInstallation', ['install'])
    try {
      await entered.promise
      switch (cause) {
        case 'discard': {
          value(await f.invoke('discardInstallationReview'))
          break
        }
        case 'frame': {
          f.caller.mainFrame = {}
          break
        }
        case 'navigation': {
          f.lifetime.invalidateReview()
          break
        }
        default: {
          f.lifetime.dispose()
        }
      }
      pending.resolve(success(engineReview()))
      failure(await response, 'RUNTIME_INVALID_REVIEW')
      if (cause === 'dispose') {
        assert.equal(f.handlers.size, 0)
      } else {
        failure(await f.invoke('install', [firstToken]), 'RUNTIME_INVALID_REVIEW')
      }
    } finally {
      pending.resolve(success(engineReview()))
      await response
    }
  }
})

test('matching consent is consumed before awaiting core and discard/dispose never cancel accepted work', async () => {
  const f = fixture()
  const entered = deferred<void>()
  const pending = deferred<ApiResult<RuntimeStatus>>()
  let attempts = 0
  f.controls.install = async () => {
    if (++attempts > 1) {
      return success(ready)
    }
    entered.resolve()
    return await pending.promise
  }
  value(await f.invoke('previewInstallation', ['install']))
  const queuedHandler = f.handlers.get(ipcChannels.runtime.previewInstallation)!
  const operation = f.invoke('install', [firstToken])
  try {
    await entered.promise
    failure(await f.invoke('install', [firstToken]), 'RUNTIME_INVALID_REVIEW')
    value(await f.invoke('discardInstallationReview'))
    f.lifetime.dispose()
    failure(
      await queuedHandler({ sender: f.caller, senderFrame: f.caller.mainFrame }, 'install'),
      'IPC_INVALID_CALLER',
    )
    pending.resolve(success(ready))
    assert.deepEqual(value(await operation), ready)
    assert.equal(attempts, 1)
  } finally {
    pending.resolve(success(ready))
    await operation
  }
})

test('core refusal or throw consumes the accepted token and hides private thrown diagnostics', async () => {
  const f = fixture()
  for (const kind of ['refusal', 'throw'] as const) {
    value(await f.invoke('previewInstallation', ['install']))
    f.controls.install = async () => {
      if (kind === 'throw') {
        throw new Error('Controlled private diagnostic')
      }
      return {
        error: { code: 'RUNTIME_INSTALL_POINTER_CHANGED', message: 'Controlled changed pointer' },
        ok: false,
      }
    }
    const result = await f.invoke('install', [firstToken])
    failure(result, kind === 'throw' ? 'RUNTIME_INTERNAL_ERROR' : 'RUNTIME_INSTALL_POINTER_CHANGED')
    if (!result.ok && kind === 'throw') {
      assert.equal(result.error.message, 'Runtime service failed.')
    }
    failure(await f.invoke('install', [firstToken]), 'RUNTIME_INVALID_REVIEW')
  }
})

test('engine projection rejects incomplete/nonpinned/miscounted private plans without a mutating call', async (t) => {
  const changes: [string, (review: ReturnType<typeof engineReview>) => void][] = [
    [
      'missing runtime',
      (r) => {
        ;(r.plan.artifacts as unknown[]).splice(0, 1)
      },
    ],
    [
      'extra artifact',
      (r) => {
        ;(r.plan.artifacts as unknown[]).push({ ...r.plan.artifacts[0] })
      },
    ],
    [
      'uncached runtime',
      (r) => {
        Object.assign(r.plan.artifacts[0], { sourceCached: false })
      },
    ],
    [
      'runtime falsely installed',
      (r) => {
        Object.assign(r.plan.artifacts[0], { reused: true })
      },
    ],
    [
      'changed LaMa hash',
      (r) => {
        Object.assign(r.plan.artifacts[1], { sha256: 'b'.repeat(64) })
      },
    ],
    [
      'changed LaMa size',
      (r) => {
        Object.assign(r.plan.artifacts[1], { sizeBytes: 1 })
      },
    ],
    [
      'changed LaMa name',
      (r) => {
        Object.assign(r.plan.artifacts[1], { filename: 'other.pt' })
      },
    ],
    [
      'changed LaMa identity',
      (r) => {
        Object.assign(r.plan.artifacts[1], { id: 'other-resource' })
      },
    ],
    [
      'miscounted total',
      (r) => {
        Object.assign(r.plan.totals, { downloadBytes: 1 })
      },
    ],
    [
      'invented footprint',
      (r) => {
        Object.assign(r, { requiredFreeBytes: 1 })
      },
    ],
    [
      'unsafe slot floor',
      (r) => {
        r.runtimeRequiredFreeBytes = Number.MAX_SAFE_INTEGER + 1
      },
    ],
    [
      'wrong mode',
      (r) => {
        r.mode = 'repair'
      },
    ],
    [
      'unsafe token',
      (r) => {
        r.token = 'not-a-token'
      },
    ],
  ]
  for (const [name, change] of changes) {
    await t.test(name, async () => {
      const f = fixture()
      f.controls.preview = async () => {
        const review = structuredClone(engineReview())
        change(review)
        return success(review)
      }
      failure(
        await f.invoke('previewInstallation', ['install']),
        'RUNTIME_INSTALL_PREPARATION_INVALID',
      )
      failure(await f.invoke('install', [firstToken]), 'RUNTIME_INVALID_REVIEW')
      assert.deepEqual(
        f.calls.map((call) => call.action),
        ['preview'],
      )
    })
  }
})

test('status retains its existing result domain and default real manager offers no release', async () => {
  const f = fixture()
  assert.deepEqual(value(await f.invoke('getStatus')), ready)
  f.controls.status = async () => {
    throw new Error('Controlled status failure')
  }
  failure(await f.invoke('getStatus'), 'RUNTIME_INTERNAL_ERROR')
  const prefix = '/controlled-unopened-runtime-ipc'
  const roots: RuntimeRoots = {
    appDataDir: prefix,
    cacheDir: `${prefix}/cache`,
    downloadsDir: `${prefix}/cache/downloads`,
    environmentsDir: `${prefix}/runtime/environments`,
    logsDir: `${prefix}/logs`,
    pointerFile: `${prefix}/runtime/active-runtime.json`,
    pythonDir: `${prefix}/runtime/python`,
    runtimeDir: `${prefix}/runtime`,
    uvCacheDir: `${prefix}/cache/uv`,
    workerLogsDir: `${prefix}/logs/worker`,
  }
  // No roots are created or inspected: the actual missing-backend gate must precede all I/O.
  const real = fixture(new RuntimeManager(roots, { arch: 'x64', platform: 'linux' }))
  failure(await real.invoke('previewInstallation', ['install']), 'RUNTIME_INSTALL_UNAVAILABLE')
  failure(await real.invoke('previewInstallation', ['repair']), 'RUNTIME_INSTALL_UNAVAILABLE')
  failure(await real.invoke('install'), 'RUNTIME_INSTALL_UNAVAILABLE')
  failure(await real.invoke('repair'), 'RUNTIME_INSTALL_UNAVAILABLE')
})

test('public setup refuses private native and domain diagnostic text on preview and token submission', async () => {
  const f = fixture()
  f.controls.preview = async () => ({
    error: { code: 'ENOENT', message: 'missing /private/example/runtime-transport' },
    ok: false,
  })
  const refused = await f.invoke('previewInstallation', ['install'])
  failure(refused, 'RUNTIME_INSTALL_FAILED')
  assert.equal(JSON.stringify(refused).includes('/private/'), false)
  delete f.controls.preview
  const review = value(
    (await f.invoke('previewInstallation', ['install'])) as ApiResult<RuntimeSetupReview>,
  )
  f.controls.install = async () => ({
    error: { code: 'RUNTIME_TRANSPORT_CHANGED', message: 'changed /private/example/keyring' },
    ok: false,
  })
  const submitted = await f.invoke('install', [review.token])
  failure(submitted, 'RUNTIME_TRANSPORT_CHANGED')
  assert.equal(JSON.stringify(submitted).includes('/private/'), false)
  failure(await f.invoke('install', [review.token]), 'RUNTIME_INVALID_REVIEW')
})

test('subframe cannot spend a valid public token at the mutating core port', async () => {
  const f = fixture()
  const review = value(
    (await f.invoke('previewInstallation', ['install'])) as ApiResult<RuntimeSetupReview>,
  )
  const result = await f.invoke('install', [review.token], { sender: f.caller, senderFrame: {} })
  assert.equal(f.calls.filter((call) => call.action === 'install').length, 0)
  failure(result, 'IPC_INVALID_CALLER')
  value(await f.invoke('install', [review.token]))
})

test('one accepted public token cannot reach the mutating core port a second time', async () => {
  const f = fixture()
  const review = value(
    (await f.invoke('previewInstallation', ['install'])) as ApiResult<RuntimeSetupReview>,
  )
  value(await f.invoke('install', [review.token]))
  const replay = await f.invoke('install', [review.token])
  assert.equal(f.calls.filter((call) => call.action === 'install').length, 1)
  failure(replay, 'RUNTIME_INVALID_REVIEW')
})
