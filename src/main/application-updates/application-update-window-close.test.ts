import { ipcChannels } from '../../shared/api.js'
import {
  WINDOW_CLOSE_CANCELED_MESSAGE,
  WindowCloseCanceledError,
} from '../../shared/window-close.js'

/**
 * Runs the actual Main close/callback/IPC-registration source with controlled window, Project and
 * update-service ports plus the real app shutdown barrier and catalog lock. No Electron, filesystem
 * transaction, signature, application startup or Project persistence is qualified.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

import { GenerationAppShutdown } from '../projects/generation-app-shutdown.js'
import { withProjectPathLock } from '../projects/project-path-lock.js'
import { ApplicationUpdateCurrentSourceError } from './application-update-service.js'

const mainSource = readFileSync(path.resolve(import.meta.dirname, '../index.ts'), 'utf8')
const startMarker =
  '      // Closing the native window follows the same Save / Discard / Cancel contract'
const endMarker = '      const invalidateApplicationUpdateDocument = '
const regionStart = mainSource.indexOf(startMarker)
const regionEnd = mainSource.indexOf(endMarker, regionStart)
assert.ok(regionStart >= 0 && regionEnd > regionStart)
assert.equal(mainSource.indexOf(startMarker, regionStart + 1), -1)

function declaration(name: string): string {
  const source = ts.createSourceFile('main.ts', mainSource, ts.ScriptTarget.Latest, true)
  const found: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found.push(node.getText(source))
    } else if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (item) => ts.isIdentifier(item.name) && item.name.text === name,
      )
    ) {
      found.push(node.getText(source))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.equal(found.length, 1, `The test must consume the single actual Main ${name} owner.`)
  return found[0]
}

const consumer = ts.transpileModule(
  `${mainSource.slice(regionStart, regionEnd)}\n${declaration(
    'workspaceCatalogChannels',
  )}\n${declaration('registerProjectHandler')}
globalThis.closeState = () => ({ resolvingClose, appDataSealed, closingAfterResolution, windowCloseEpoch, exitReady });
globalThis.registerControlledProject = registerProjectHandler;
`,
  { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } },
).outputText

type Tab = { dirty: boolean; id: string; title: string }

type Options = {
  choice?: number
  dirty?: boolean
  failFinalize?: boolean
  failInstall?: boolean
  failPreflight?: boolean
  failSave?: boolean
  failSourceSnapshot?: boolean
  flushError?: string | null
  installHeld?: Promise<void>
  preflightHeld?: Promise<void>
}
type CloseState = {
  appDataSealed: boolean
  closingAfterResolution: boolean
  exitReady: boolean
  resolvingClose: boolean
  windowCloseEpoch: number
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function fixture(options: Options = {}) {
  const tabs: Tab[] = options.dirty
    ? [{ dirty: true, id: 'owned-tab', title: 'Owned Project' }]
    : []
  const messages: { args: unknown[]; channel: string }[] = []
  const errors: { message: string; title: string }[] = []
  const events: string[] = []
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>()
  const artifact = Object.freeze({ identity: 'controlled-exact-artifact' })
  let destroyed = false
  let databaseClosed = false
  let prepareCalls = 0
  let installCalls = 0
  let checkCalls = 0
  let downloadCalls = 0
  let reviewCalls = 0
  let closeCalls = 0
  let sourceChecks = 0
  let serviceFacade!: {
    check: () => Promise<unknown>
    download: (version: string) => Promise<unknown>
    getStatus: () => unknown
    reviewInstallation: (version: string) => Promise<unknown>
  }
  let requestInstallation!: (
    version: string,
    isCurrent: () => boolean,
  ) => Promise<{ availableVersion: string; status: string }>
  const ipcMain = Object.assign(new EventEmitter(), {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) =>
      handlers.set(channel, handler),
  })
  const webContents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    send: (channel: string, ...args: unknown[]) => {
      messages.push({ args, channel })
      if (channel === ipcChannels.projects.prepareWindowClose) {
        queueMicrotask(() =>
          ipcMain.emit(
            ipcChannels.projects.windowCloseReady,
            { sender: webContents, senderFrame: webContents.mainFrame },
            args[0],
            options.flushError ?? null,
          ),
        )
      }
    },
  })
  const window = Object.assign(new EventEmitter(), {
    close: () => {
      closeCalls++
      let prevented = false
      window.emit('close', {
        preventDefault: () => {
          prevented = true
        },
      })
      if (!prevented) {
        destroyed = true
        events.push('window-closed')
        window.emit('closed')
      }
    },
    isDestroyed: () => destroyed,
    webContents,
  })
  const appShutdown = new GenerationAppShutdown({
    closeDatabase: async () => {
      databaseClosed = true
      events.push('database-closed')
      if (options.failFinalize) {
        throw new Error('private database disposal detail /owned/database')
      }
    },
    context: {
      shutdown: () => {
        events.push('context-closed')
      },
    },
    coordinator: {
      shutdown: async () => {
        events.push('workers-stopped')
      },
    },
    modelInstalls: {
      shutdown: async () => {
        events.push('models-stopped')
      },
    },
    pendingJobs: {
      cancelPendingForShutdown: async () => {
        events.push('pending-canceled')
      },
    },
  })
  class ControlledUpdateService {
    private readonly assertClosed: () => void
    constructor(...ports: unknown[]) {
      this.assertClosed = ports[4] as () => void
    }
    assertCurrentSourceSnapshot() {
      sourceChecks++
      if (options.failSourceSnapshot) {
        throw new ApplicationUpdateCurrentSourceError()
      }
    }
    check() {
      checkCalls++
      return Promise.resolve({ status: 'controlled-status' })
    }
    download() {
      downloadCalls++
      return Promise.resolve({ status: 'controlled-status' })
    }
    getStatus() {
      return { status: 'controlled-status' }
    }
    async installAfterClose(version: string, expected: unknown) {
      installCalls++
      this.assertClosed()
      assert.equal(databaseClosed, true)
      assert.equal(version, '0.2.0')
      assert.equal(expected, artifact, 'Main must pass the identical preflight capability.')
      events.push('install-entered')
      if (options.installHeld) {
        await options.installHeld
      }
      if (options.failInstall) {
        throw new Error('private update detail /owned/backup')
      }
      events.push('install-settled')
    }
    async prepareInstallation(version: string) {
      prepareCalls++
      assert.equal(version, '0.2.0')
      if (options.preflightHeld) {
        await options.preflightHeld
      }
      if (options.failPreflight) {
        throw new Error('controlled unavailable preflight')
      }
      return artifact
    }
    reviewInstallation() {
      reviewCalls++
      return Promise.resolve({ installationAvailable: true })
    }
  }
  class ControlledProjectServiceError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message)
    }
  }
  const context = {
    acceptanceRecovery: { hasPendingHandoff: () => false },
    app: {
      getVersion: () => '0.1.0',
      isPackaged: true,
      quit: () => {
        events.push('app-quit')
      },
    },
    applicationUpdateAppImage: '/controlled/Current.AppImage',
    applicationUpdateCurrentSource: null,
    ApplicationUpdateService: ControlledUpdateService,
    applicationUpdateStartupInspection: { status: 'none' },
    appShutdown,
    clearTimeout,
    closeState: undefined as unknown as () => CloseState,
    createElectronApplicationRelauncher: () => () => true,
    dialog: {
      showErrorBox: (title: string, message: string) => {
        errors.push({ message, title })
      },
      showMessageBoxSync: () => options.choice ?? 0,
    },
    existsSync: () => true,
    exitReady: false,
    installCoordinator: {
      getCloseImpact: () => ({
        activeJobCount: 0,
        committingJobCount: 0,
        preparingInstallCount: 0,
        storageMutationActive: false,
      }),
    },
    ipcChannels,
    ipcMain,
    path,
    paths: { dataRoot: `/controlled-main-close/${randomUUID()}` },
    process: {
      env: { APPIMAGE: '/controlled/Current.AppImage' },
      platform: 'linux',
      resourcesPath: '/controlled/resources',
      versions: { electron: '44.4.5' },
    },
    projectGenerationClose: {
      close: async (tabId: string) => {
        tabs.splice(
          tabs.findIndex((tab) => tab.id === tabId),
          1,
        )
        events.push('project-closed')
      },
      getCloseImpact: async () => ({
        completedCandidateCount: 0,
        generationStorageUnavailable: false,
        unfinishedJobCount: 0,
      }),
    },
    projectGenerationGate: {
      drain: async () => undefined,
      run: async (_tabId: string, work: () => Promise<unknown>) => await work(),
    },
    projectService: { getOpenTabs: () => tabs.map((tab) => ({ ...tab })) },
    ProjectServiceError: ControlledProjectServiceError,
    randomUUID,
    recoveredGeneration: {
      orchestrator: {
        fenceProjectGeneration: async () => undefined,
        releaseProjectGenerationFence: () => undefined,
      },
      queue: { getAppCloseImpact: async () => ({ unfinishedJobCount: 0 }) },
    },
    registerApplicationUpdateIpc: (
      _registrar: unknown,
      _caller: unknown,
      facade: typeof serviceFacade,
      install: typeof requestInstallation,
    ) => {
      serviceFacade = facade
      requestInstallation = install
      return { dispose: () => undefined, invalidateDocument: () => undefined }
    },
    registerControlledProject: undefined as unknown as (
      channel: string,
      validate: () => boolean,
      work: () => Promise<unknown>,
    ) => void,
    releaseCanceledWindowCloseFences: () => {
      events.push('fences-released')
    },
    saveProjectWithPreview: async (tabId: string) => {
      if (options.failSave) {
        throw new Error('controlled Save failure')
      }
      tabs.find((tab) => tab.id === tabId)!.dirty = false
      events.push('project-saved')
    },
    setTimeout,
    window,
    WINDOW_CLOSE_CANCELED_MESSAGE,
    WindowCloseCanceledError,
    withProjectPathLock,
  }
  runInNewContext(consumer, context, { filename: 'actual-main-close-consumer.js' })
  const until = async (condition: () => boolean) => {
    const deadline = Date.now() + 2000
    while (!condition()) {
      assert.ok(
        Date.now() < deadline,
        'Controlled actual Main close did not reach its observable settlement.',
      )
      await nextTurn()
    }
  }
  return {
    artifact,
    context,
    errors,
    events,
    facade: () => serviceFacade,
    invokeProject: (channel: string) =>
      handlers.get(channel)!({ sender: webContents, senderFrame: webContents.mainFrame }),
    messages,
    options,
    request: (isCurrent = () => true) => requestInstallation('0.2.0', isCurrent),
    stats: () => ({
      checkCalls,
      closeCalls,
      databaseClosed,
      destroyed,
      downloadCalls,
      installCalls,
      prepareCalls,
      reviewCalls,
      sourceChecks,
    }),
    tabs,
    until,
    window,
  }
}

test('actual Main keeps sealed close blocked until exact-artifact handoff settles', async () => {
  const held = deferred()
  const f = fixture({ installHeld: held.promise })
  try {
    const ack = await f.request()
    assert.equal(ack.status, 'close-requested')
    await f.until(() => f.stats().installCalls === 1)
    assert.equal(f.context.closeState().appDataSealed, true)
    assert.equal(f.context.closeState().closingAfterResolution, false)
    f.window.close()
    assert.equal(f.stats().destroyed, false, 'Alt+F4 cannot skip an awaiting handoff.')
    await assert.rejects(f.facade().check())
    await assert.rejects(f.facade().download('0.2.0'))
    await assert.rejects(f.facade().reviewInstallation('0.2.0'))
    assert.equal((f.facade().getStatus() as { status: string }).status, 'controlled-status')
    assert.equal(f.stats().checkCalls + f.stats().downloadCalls + f.stats().reviewCalls, 0)
    f.context.registerControlledProject(
      ipcChannels.projects.open,
      () => true,
      async () => {
        throw new Error('sealed storage must not be reached')
      },
    )
    const denied = (await f.invokeProject(ipcChannels.projects.open)) as { ok: boolean }
    assert.equal(denied.ok, false)
  } finally {
    held.resolve()
  }
  await f.until(() => f.stats().destroyed)
  assert.ok(f.events.indexOf('database-closed') < f.events.indexOf('install-entered'))
  assert.ok(f.events.indexOf('install-settled') < f.events.indexOf('window-closed'))
  assert.equal(
    f.messages.filter((item) => item.channel === ipcChannels.projects.windowCloseReleased).length,
    0,
  )
  assert.equal(f.context.closeState().exitReady, true)
})

test('actual Main checks current sources after final document guards and refuses before native close', async () => {
  const f = fixture({ dirty: true })
  await assert.rejects(
    f.request(() => {
      f.options.failSourceSnapshot = true
      return true
    }),
    ApplicationUpdateCurrentSourceError,
  )
  assert.equal(f.stats().prepareCalls, 1)
  assert.equal(f.stats().sourceChecks, 1)
  assert.equal(f.stats().closeCalls, 0)
  assert.equal(f.stats().installCalls, 0)
  assert.equal(f.stats().databaseClosed, false)
  assert.equal(f.tabs.length, 1)
  assert.equal(f.tabs[0].dirty, true)
  assert.equal(f.messages.length, 0)
  f.options.failSourceSnapshot = false
  f.options.choice = 2
  await f.request()
  await f.until(() => !f.context.closeState().resolvingClose)
  assert.equal(f.stats().sourceChecks, 2, 'A fresh request still uses the Main guard.')
  assert.equal(f.stats().installCalls, 0)
})

for (const lane of ['native-cancel', 'renderer-cancel', 'save-error'] as const) {
  test(`actual Main ${lane} clears Install intent before a later ordinary Close`, async () => {
    const f = fixture({
      choice: lane === 'native-cancel' ? 2 : 0,
      dirty: true,
      failSave: lane === 'save-error',
      flushError: lane === 'renderer-cancel' ? WINDOW_CLOSE_CANCELED_MESSAGE : null,
    })
    await f.request()
    await f.until(() => !f.context.closeState().resolvingClose)
    assert.equal(f.stats().databaseClosed, false)
    assert.equal(f.stats().installCalls, 0)
    assert.equal(f.tabs.length, 1)
    f.options.choice = 1
    f.options.failSave = false
    f.options.flushError = null
    f.window.close()
    await f.until(() => f.stats().destroyed)
    assert.equal(f.stats().installCalls, 0)
  })
}

for (const lane of ['finalize-error', 'install-error'] as const) {
  test(`actual Main ${lane} exits normally without releasing disposed data`, async () => {
    const f = fixture({
      failFinalize: lane === 'finalize-error',
      failInstall: lane === 'install-error',
    })
    await f.request()
    await f.until(() => f.stats().destroyed)
    assert.equal(f.context.closeState().appDataSealed, true)
    assert.equal(f.context.closeState().resolvingClose, true)
    assert.equal(f.context.closeState().exitReady, true)
    assert.equal(f.stats().installCalls, lane === 'install-error' ? 1 : 0)
    assert.equal(f.errors.length, 1)
    assert.equal(
      f.errors[0].title,
      lane === 'install-error'
        ? 'Application update could not be completed'
        : 'Application close failed',
    )
    assert.equal(f.errors[0].message.includes('/owned/'), false)
    assert.equal(
      f.messages.some(
        (item) =>
          item.channel === ipcChannels.projects.tabsChanged ||
          item.channel === ipcChannels.projects.windowCloseReleased,
      ),
      false,
    )
  })
}

test('actual Main refuses unavailable and stale preflight before requesting close', async () => {
  const unavailable = fixture({ failPreflight: true })
  await assert.rejects(unavailable.request())
  assert.equal(unavailable.stats().closeCalls, 0)
  const held = deferred()
  const stale = fixture({ preflightHeld: held.promise })
  let current = true
  const pending = stale.request(() => current)
  current = false
  held.resolve()
  await assert.rejects(pending)
  assert.equal(stale.stats().closeCalls, 0)
  assert.equal(stale.stats().databaseClosed, false)
})

test('an intervening canceled ordinary Close invalidates Install preflight and duplicates refuse', async () => {
  const held = deferred()
  const f = fixture({ choice: 2, dirty: true, preflightHeld: held.promise })
  const pending = f.request()
  await assert.rejects(f.request())
  f.window.close()
  await f.until(() => !f.context.closeState().resolvingClose)
  held.resolve()
  await assert.rejects(pending)
  assert.equal(f.stats().prepareCalls, 1)
  assert.equal(f.stats().closeCalls, 1)
  assert.equal(f.stats().installCalls, 0)
})

test('actual Main drains admitted catalog work, refuses queued/new admission and then snapshots its tab', async () => {
  const held = deferred()
  const f = fixture({ choice: 2 })
  let admitted = false
  let entries = 0
  f.context.registerControlledProject(
    ipcChannels.projects.open,
    () => true,
    async () => {
      entries++
      admitted = true
      await held.promise
      f.tabs.push({ dirty: true, id: 'late-owned-tab', title: 'Admitted Project' })
      return null
    },
  )
  const first = f.invokeProject(ipcChannels.projects.open)
  await f.until(() => admitted)
  const queued = f.invokeProject(ipcChannels.projects.open)
  await f.request()
  assert.equal(f.stats().databaseClosed, false)
  assert.equal(((await f.invokeProject(ipcChannels.projects.open)) as { ok: boolean }).ok, false)
  held.resolve()
  assert.equal(((await first) as { ok: boolean }).ok, true)
  assert.equal(((await queued) as { ok: boolean }).ok, false)
  await f.until(() => !f.context.closeState().resolvingClose)
  assert.equal(entries, 1)
  assert.equal(f.tabs.length, 1)
  assert.equal(
    f.stats().databaseClosed,
    false,
    'The newly attached dirty tab must reach the Cancel guard.',
  )
  assert.equal(f.stats().installCalls, 0)
})
