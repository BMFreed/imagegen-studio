/** NONSHIPPING observers/timing only. Require exact production Main once; no parser/API substitutes. */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const rawFs = require('original-fs')
const path = require('node:path')
const os = require('node:os')
const childProcess = require('node:child_process')
const Database = require('better-sqlite3')
const { app, BrowserWindow, dialog, ipcMain } = require('electron')

const root = process.env.IGS_STATE_UPGRADE_ROOT
const phase = process.env.IGS_STATE_UPGRADE_PHASE
assert.ok(root && path.isAbsolute(root) && rawFs.realpathSync(root) === root)
const qualificationBase = path.join(
  os.homedir(),
  '.codex/artifacts/imagegen-studio/runs/application-state-upgrade',
)
assert.ok(root.startsWith(qualificationBase + path.sep) && root.endsWith('/payloads/subject'))
assert.ok(['first', 'second'].includes(phase))
assert.equal(process.env.APPIMAGELAUNCHER_DISABLE, '1')
assert.equal(process.env.NO_CLEANUP, undefined)
const plan = JSON.parse(rawFs.readFileSync(path.join(root, 'native-plan.json'), 'utf8'))
const databasePath = path.join(root, 'data/imagegen-studio/database/app.sqlite')
const ownProcess = processIdentity(process.pid)
const group = () => fs.readFileSync('/proc/self/cgroup', 'utf8').trim().slice(3)
const emit = (name, detail = {}) =>
  fs.appendFileSync(
    path.join(root, 'native-events.ndjson'),
    JSON.stringify({
      time: new Date().toISOString(),
      phase,
      pid: process.pid,
      ownProcess,
      name,
      ...detail,
    }) + '\n',
    { mode: 0o600 },
  )
const receipt = (name, detail) =>
  fs.writeFileSync(
    path.join(root, `${phase}-${name}.json`),
    JSON.stringify(detail, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  )
const exists = (name) => fs.existsSync(path.join(root, name))
const observe = (port, callback) => {
  try {
    callback()
  } catch {
    try {
      emit('qualification-observer-error', { port })
    } catch {}
  }
}
function processIdentity(pid) {
  try {
    const text = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    const values = text.slice(text.lastIndexOf(')') + 2).split(' ')
    return { pid, startTicks: values[19], state: values[0] }
  } catch (error) {
    if (['ENOENT', 'ESRCH'].includes(error.code)) return null
    throw error
  }
}
function budget() {
  const current = group(),
    directory = `/sys/fs/cgroup${current}`
  const read = (name) => fs.readFileSync(path.join(directory, name), 'utf8').trim()
  const identity = fs.lstatSync(directory, { bigint: true })
  return {
    group: current,
    scopeIdentity: { device: String(identity.dev), inode: String(identity.ino) },
    memoryMax: read('memory.max'),
    swapMax: read('memory.swap.max'),
    memoryCurrent: read('memory.current'),
    memoryPeak: read('memory.peak'),
  }
}
function runtimeProof() {
  const appDir = process.env.APPDIR
  assert.ok(
    appDir && rawFs.realpathSync(appDir) === appDir && path.dirname(appDir) === process.env.TMPDIR,
  )
  assert.match(path.basename(appDir), /^appimage_extracted_[a-zA-Z0-9]+$/)
  const actualExecutable = rawFs.realpathSync(process.execPath)
  assert.ok(actualExecutable.startsWith(appDir + path.sep))
  const noNewPrivs = Number(
    fs.readFileSync('/proc/self/status', 'utf8').match(/^NoNewPrivs:\s+([01])$/m)?.[1],
  )
  assert.ok(noNewPrivs === 0 || noNewPrivs === 1)
  return { runtimeKind: 'extract-and-run', appDir, actualExecutable, noNewPrivs }
}
app.setPath('userData', path.join(root, `chrome-profile-${phase}`))
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
app.commandLine.appendSwitch('remote-debugging-port', '0')
app.commandLine.appendSwitch('ozone-platform', 'x11')
app.disableHardwareAcceleration()
emit('production-main-enter', {
  version: app.getVersion(),
  appImage: process.env.APPIMAGE,
  group: group(),
  runtimeProof: runtimeProof(),
})
receipt('pre-main-budget', { ...budget(), metadataOnly: true, promotionOverheadQualified: false })

let databaseClosed = false,
  databaseCloseCount = 0
const originalDatabaseClose = Database.prototype.close
Database.prototype.close = function (...args) {
  const selected = this.name === databasePath
  const value = Reflect.apply(originalDatabaseClose, this, args)
  if (selected) {
    databaseClosed = true
    databaseCloseCount++
    observe('database-close', () =>
      emit('database-close-returned', { originalCalls: 1, databaseCloseCount, open: this.open }),
    )
  }
  return value
}

// Original transport observers only. Each selected child's data event is forwarded once before
// recording it. The real parser's private error is source-inferred; no Error/Promise hooks exist.
const originalSpawn = childProcess.spawn
childProcess.spawn = function (...args) {
  const child = Reflect.apply(originalSpawn, this, args)
  if (args[0] !== plan.runtime.pythonExecutable) return child
  observe('worker-spawn', () =>
    emit('worker-spawn', {
      childPid: child.pid,
      childIdentity: processIdentity(child.pid),
      executable: args[0],
      argv: args[1],
      originalCalls: 1,
    }),
  )
  let forwarding = false,
    pending = Buffer.alloc(0)
  const originalKill = child.kill
  child.kill = function (...killArgs) {
    const value = Reflect.apply(originalKill, child, killArgs)
    observe('worker-kill', () =>
      emit('worker-client-kill', {
        childPid: child.pid,
        signal: killArgs[0] ?? 'SIGTERM',
        duringOriginalStdoutDispatch: forwarding,
        originalCalls: 1,
        returned: value,
      }),
    )
    return value
  }
  const originalEmit = child.stdout.emit
  child.stdout.emit = function (name, ...values) {
    if (name !== 'data') return Reflect.apply(originalEmit, this, [name, ...values])
    forwarding = true
    let value
    try {
      value = Reflect.apply(originalEmit, this, [name, ...values])
    } finally {
      forwarding = false
    }
    observe('worker-stdout', () => {
      const chunk = Buffer.from(values[0])
      pending = Buffer.concat([pending, chunk])
      assert.ok(pending.length <= 64 * 1024)
      while (pending.includes(10)) {
        const at = pending.indexOf(10),
          bytes = pending.subarray(0, at)
        pending = pending.subarray(at + 1)
        emit('worker-stdout-forwarded', {
          childPid: child.pid,
          originalCalls: 1,
          originalListenersInvoked: this.listenerCount('data'),
          line: bytes.toString('utf8'),
          ready: JSON.parse(bytes.toString('utf8')),
        })
      }
    })
    return value
  }
  child.once('close', (code, signal) =>
    observe('worker-close', () =>
      emit('worker-close', { childPid: child.pid, code, signal, physicalExitObserved: true }),
    ),
  )
  return child
}

const selectedChannels = new Set([
  'runtime:get-status',
  'projects:list',
  'projects:open',
  'projects:save',
])
const originalHandle = ipcMain.handle
ipcMain.handle = function (channel, listener) {
  if (!selectedChannels.has(channel))
    return Reflect.apply(originalHandle, this, [channel, listener])
  return Reflect.apply(originalHandle, this, [
    channel,
    async function (...args) {
      observe('ipc-enter', () =>
        emit('original-ipc-enter', {
          channel,
          argumentCount: args.length - 1,
          currentMainFrame: args[0]?.senderFrame === args[0]?.sender?.mainFrame,
        }),
      )
      const result = await Reflect.apply(listener, this, args)
      observe('ipc-return', () =>
        emit('original-ipc-return', {
          channel,
          originalCalls: 1,
          ok: result?.ok === true,
          runtimeStatus:
            channel === 'runtime:get-status' && result?.ok === true ? result.value : null,
          error: result?.ok === false ? result.error : null,
          committed:
            channel === 'projects:save' && result?.ok === true
              ? result.value?.committed === true
              : null,
        }),
      )
      return result
    },
  ])
}
const originalLock = app.requestSingleInstanceLock
app.requestSingleInstanceLock = function (...args) {
  const value = Reflect.apply(originalLock, this, args)
  observe('single-instance', () =>
    emit('single-instance-lock', { originalCalls: 1, value, userData: app.getPath('userData') }),
  )
  return value
}
const originalDialog = dialog.showMessageBoxSync
dialog.showMessageBoxSync = function (...args) {
  const options = args.at(-1)
  if (options?.message !== 'Close ImageGen Studio?' || !Array.isArray(options.buttons))
    return Reflect.apply(originalDialog, this, args)
  const choice = options.buttons.includes('Save')
    ? options.buttons.indexOf(exists('native-abort.flag') ? 'Discard Changes' : 'Save')
    : 0
  assert.ok(choice >= 0 && choice < options.buttons.length)
  observe('close-dialog', () =>
    emit('controlled-close-decision', { choice, options, decisionPort: true, originalCalls: 0 }),
  )
  return choice
}
dialog.showErrorBox = function (title, content) {
  observe('error-box', () => emit('native-error-box', { title, content, presentationPort: true }))
}

let watchdog, abortTimer
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', () =>
    observe('renderer-ready', () => {
      receipt('ready', {
        pid: process.pid,
        ownProcess,
        phase,
        version: app.getVersion(),
        group: group(),
        budget: budget(),
        appImage: process.env.APPIMAGE,
        userData: app.getPath('userData'),
        runtimeProof: runtimeProof(),
        productionMain: 'dist/main/main.cjs',
        beforeExplicitDriverAction: true,
      })
    }),
  )
})
app.on('quit', (_event, code) =>
  observe('quit', () => emit('app-quit', { code, databaseClosed, databaseCloseCount })),
)
process.on('exit', (code) => {
  clearTimeout(watchdog)
  clearInterval(abortTimer)
  observe('exit', () => emit('process-exit', { code, databaseClosed, databaseCloseCount }))
})
process.on('uncaughtExceptionMonitor', (error) =>
  observe('uncaught', () =>
    emit('uncaught-exception-monitor', { message: String(error.stack ?? error) }),
  ),
)

// Pinned Electron44.4.5 native-ready/KDE promotion bridge, adapted from the already qualified
// startup-authority/recovery-status harness. Early Main capture is metadata-only; all migration
// and complete hashing starts only after exact promoted PID/start/cgroup admission.
const originalWhenReady = app.whenReady
let calls = 0,
  gate
app.whenReady = function (...args) {
  const invocation = ++calls,
    nativeReady = Reflect.apply(originalWhenReady, this, args)
  gate ??= nativeReady.then(async (value) => {
    receipt('startup-held', {
      pid: process.pid,
      ownProcess,
      phase,
      invocation,
      originalCalls: 1,
      productionContinuationHeld: true,
      nativeReadyResolved: true,
      budget: budget(),
      runtimeProof: runtimeProof(),
    })
    const until = Date.now() + 30_000,
      filename = `${phase}-admit.flag`
    while (!exists(filename)) {
      if (exists('native-abort.flag') || Date.now() >= until)
        throw new Error('Qualification startup admission failed.')
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    const admission = JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8')),
      current = budget()
    assert.equal(admission.pid, process.pid)
    assert.equal(admission.start, ownProcess.startTicks)
    assert.equal(current.group, admission.group)
    assert.deepEqual(current.scopeIdentity, admission.scopeIdentity)
    assert.equal(
      path.basename(current.group),
      `app-imagegen${String.fromCharCode(92)}x2dstudio-${process.pid}.scope`,
    )
    assert.ok(/^\d+$/.test(current.memoryMax) && BigInt(current.memoryMax) <= 1024n ** 3n)
    assert.equal(current.swapMax, '0')
    receipt('startup-released', {
      pid: process.pid,
      ownProcess,
      originalCalls: 1,
      productionContinuationResumed: true,
      budget: current,
    })
    return value
  })
  return gate
}
watchdog = setTimeout(() => {
  observe('deadline', () => emit('bootstrap-watchdog'))
  fs.writeFileSync(
    path.join(root, 'native-abort.flag'),
    'Qualification deadline; own ordinary close only.\n',
    { mode: 0o600 },
  )
}, 500_000)
abortTimer = setInterval(() => {
  if (!exists('native-abort.flag')) return
  const windows = BrowserWindow.getAllWindows()
  if (!windows.length) app.quit()
  for (const window of windows) if (!window.isDestroyed()) window.close()
}, 100)

const archivePath = app.getAppPath()
assert.equal(archivePath, path.join(process.resourcesPath, 'app.asar'))
const Archive = process._linkedBinding('electron_common_asar').Archive
const nativeArchive = new Archive(archivePath)
const borrowedArchiveFd = nativeArchive.getFdAndValidateIntegrityLater()
assert.ok(Number.isSafeInteger(borrowedArchiveFd) && borrowedArchiveFd >= 0)
const physical = (value) => ({
  dev: String(value.dev),
  ino: String(value.ino),
  sizeBytes: Number(value.size),
  mode: String(value.mode),
})
receipt('archive-before-main', {
  pid: process.pid,
  ownProcess,
  borrowedArchiveFd,
  metadata: physical(rawFs.fstatSync(borrowedArchiveFd, { bigint: true })),
  noBorrowedFdRead: true,
})
require('./dist/main/main.cjs')
emit('production-main-required', { originalCalls: 1 })
process.on('exit', () =>
  observe('archive-disposer', () => {
    // Keep the native Archive owner alive while borrowing its descriptor; never close it here.
    assert.equal(typeof nativeArchive.getFdAndValidateIntegrityLater, 'function')
    emit('borrowed-archive-after-main-disposer', {
      borrowedArchiveFd,
      metadata: physical(rawFs.fstatSync(borrowedArchiveFd, { bigint: true })),
      noBorrowedFdRead: true,
    })
  }),
)
