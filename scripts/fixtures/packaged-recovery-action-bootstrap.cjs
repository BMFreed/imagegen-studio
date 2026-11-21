/** Qualification-only native picker and IPC observation wrapper. Production bundle is unchanged. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const Database = require('better-sqlite3')

const root = process.env.IGS_RECOVERY_QUALIFICATION_ROOT
const expected = path.join(
  os.homedir(),
  '.codex/artifacts/imagegen-studio/runs/packaged-recovery-action',
)
assert.ok(root && fs.realpathSync(root) === root)
assert.equal(path.dirname(path.dirname(root)), expected)
assert.equal(path.basename(root), 'payloads')
assert.equal(process.env.APPIMAGELAUNCHER_DISABLE, '1')
const version = app.getVersion()
assert.ok(['0.1.0', '0.2.0', '0.3.0'].includes(version))
const installNext = process.env.IGS_RECOVERY_QUALIFICATION_INSTALL_NEXT === '1'
const installedMode = process.env.IGS_RECOVERY_QUALIFICATION_INSTALLED_RUNTIME
assert.ok(installedMode === undefined || installedMode === '1')
const group = () => fs.readFileSync('/proc/self/cgroup', 'utf8').trim().slice(3)

function readPrivateRecord(file) {
  assert.equal(fs.realpathSync(file), file)
  const info = fs.lstatSync(file)
  assert.ok(info.isFile() && info.uid === process.geteuid() && info.nlink === 1)
  assert.equal(info.mode & 0o077, 0)
  assert.ok(info.size > 0 && info.size <= 16 * 1024)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function installedAppData() {
  assert.ok(installNext)
  const fixture = readPrivateRecord(path.join(root, 'installed-runtime-fixture.json'))
  const engineRun = path.dirname(fixture.engineReport)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(path.basename(fixture.engineReport), 'installed-engine.json')
  assert.equal(
    path.dirname(engineRun),
    path.join(path.dirname(expected), 'packaged-installed-engine'),
  )
  assert.equal(path.dirname(fixture.run), engineRun)
  assert.equal(fs.realpathSync(fixture.run), fixture.run)
  assert.equal(fs.realpathSync(fixture.appData), fixture.appData)
  assert.match(
    path.relative(path.join(engineRun, 'payloads'), fixture.appData),
    /^native-runtime-offline-[a-zA-Z0-9]+\/data\/imagegen-studio$/,
  )
  assert.match(fixture.runtimeId, /^release-[0-9a-f-]{36}$/)
  const claimed = readPrivateRecord(
    path.join(path.dirname(fixture.appData), '.packaged-upgrade-qualification/owner.json'),
  )
  assert.ok(Number.isSafeInteger(fixture.ownerPid) && fixture.ownerPid > 1)
  assert.deepEqual(claimed, {
    appData: fixture.appData,
    pid: fixture.ownerPid,
    run: fixture.run,
  })
  const proc = `/proc/${fixture.ownerPid}`
  assert.equal(fs.statSync(proc).uid, process.geteuid())
  const ownerStart = fs
    .readFileSync(path.join(proc, 'stat'), 'utf8')
    .split(') ')
    .at(-1)
    .split(' ')[19]
  assert.match(ownerStart, /^[1-9]\d*$/)
  assert.equal(ownerStart, process.env.IGS_RECOVERY_QUALIFICATION_OWNER_START)
  const ownerGroup = fs.readFileSync(path.join(proc, 'cgroup'), 'utf8').trim()
  const inherited = group()
  assert.match(inherited, /^\/[^\n]+\/igs-[\w-]+\.service$/)
  assert.equal(path.posix.normalize(inherited), inherited)
  assert.equal(ownerGroup, `0::${inherited}`)
  const scope = path.join('/sys/fs/cgroup', inherited)
  assert.equal(BigInt(fs.readFileSync(path.join(scope, 'memory.max'), 'utf8')), 4n * 1024n ** 3n)
  assert.equal(fs.readFileSync(path.join(scope, 'memory.swap.max'), 'utf8').trim(), '0')
  return fixture.appData
}

const appData = installedMode ? installedAppData() : path.join(root, 'data/imagegen-studio')
assert.equal(process.env.XDG_DATA_HOME, path.dirname(appData))
app.setPath('userData', path.join(root, 'profile'))
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
app.commandLine.appendSwitch('remote-debugging-port', '0')
app.commandLine.appendSwitch('ozone-platform', 'x11')

const event = (name, details) =>
  fs.appendFileSync(
    path.join(root, 'native-events.ndjson'),
    JSON.stringify({ name, pid: process.pid, version, ...details }) + '\n',
    { mode: 0o600 },
  )
const flag = (name) => path.join(root, name)
const start = fs.readFileSync('/proc/self/stat', 'utf8').split(') ').at(-1).split(' ')[19]
const identity = () => ({ group: group(), pid: process.pid, start })
const nativePicker = dialog.showSaveDialog
let selections = 0
dialog.showSaveDialog = async function (...args) {
  const options = args.at(-1)
  if (options?.title !== 'Save Recovery AppImage') return Reflect.apply(nativePicker, this, args)
  assert.equal(version, '0.1.0')
  selections++
  assert.ok(selections <= 2)
  const filePath = path.join(root, 'Applications/Recovered.AppImage')
  event('selected-recovery', { options, selected: selections === 2, selections })
  return selections === 1 ? { canceled: true, filePath: '' } : { canceled: false, filePath }
}
const nativeHandle = ipcMain.handle
ipcMain.handle = function (channel, listener) {
  if (channel !== 'application-updates:save-recovery') {
    return Reflect.apply(nativeHandle, this, [channel, listener])
  }
  return Reflect.apply(nativeHandle, this, [
    channel,
    async function (...args) {
      const result = await Reflect.apply(listener, this, args)
      event('recovery-response', { result })
      return result
    },
  ])
}
const nativeRelaunch = app.relaunch
let rawHandoff
let databaseCloseCount = 0
app.relaunch = function (...args) {
  const result = Reflect.apply(nativeRelaunch, this, args)
  rawHandoff = result
  event('relaunch', { args, databaseCloseCount, result })
  return result
}
if (installNext && version === '0.2.0') {
  const nativeDatabaseClose = Database.prototype.close
  Database.prototype.close = function (...args) {
    const result = Reflect.apply(nativeDatabaseClose, this, args)
    if (this.name === path.join(appData, 'database/app.sqlite')) {
      assert.equal(this.open, false)
      databaseCloseCount++
    }
    return result
  }
  const nativeMessageBox = dialog.showMessageBoxSync
  dialog.showMessageBoxSync = function (...args) {
    const options = args.at(-1)
    if (options?.message !== 'Close ImageGen Studio?' || options.buttons?.[0] !== 'Save') {
      return Reflect.apply(nativeMessageBox, this, args)
    }
    event('selected-project-save', { options })
    return 0
  }
  let held = false
  let released = false
  app.on('browser-window-created', (_event, window) => {
    window.on('close', (closing) => {
      if (released || rawHandoff !== true) return
      closing.preventDefault()
      if (held) return
      held = true
      assert.equal(databaseCloseCount, 1)
      event('handoff-close-held', identity())
      const deadline = Date.now() + 30_000
      const timer = setInterval(() => {
        const abort = fs.existsSync(flag('abort-install'))
        const permission = fs.existsSync(flag('release-b-close'))
        if (!abort && !permission && Date.now() < deadline) return
        clearInterval(timer)
        if (!abort && permission) {
          assert.deepEqual(JSON.parse(fs.readFileSync(flag('release-b-close'), 'utf8')), identity())
        } else {
          event('handoff-close-qualification-aborted', identity())
        }
        released = true
        window.close()
      }, 25)
    })
  })
}
if (installNext && version === '0.3.0') {
  const nativeWhenReady = app.whenReady
  let gate
  app.whenReady = function (...args) {
    const nativeReady = Reflect.apply(nativeWhenReady, this, args)
    gate ??= nativeReady.then(async (result) => {
      event('successor-ready-held', identity())
      const deadline = Date.now() + 45_000
      while (!fs.existsSync(flag('admit-c-startup'))) {
        if (fs.existsSync(flag('abort-install')) || Date.now() >= deadline) {
          throw new Error('Successor startup qualification admission did not complete.')
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      const observed = identity()
      const directory = `/sys/fs/cgroup${observed.group}`
      const scope = fs.lstatSync(directory, { bigint: true })
      const scopeIdentity = { device: String(scope.dev), inode: String(scope.ino) }
      assert.deepEqual(JSON.parse(fs.readFileSync(flag('admit-c-startup'), 'utf8')), {
        ...observed,
        scopeIdentity,
      })
      assert.ok(
        BigInt(fs.readFileSync(path.join(directory, 'memory.max'), 'utf8')) <= 4n * 1024n ** 3n,
      )
      assert.equal(fs.readFileSync(path.join(directory, 'memory.swap.max'), 'utf8').trim(), '0')
      event('successor-ready-released', { ...observed, scopeIdentity })
      return result
    })
    return gate
  }
}
if (installNext) {
  app.on('quit', (_event, code) => event('app-quit', { code, ...identity() }))
  process.on('exit', (code) => event('process-exit', { code, ...identity() }))
}
event('startup', {
  ...(installedMode ? { appData } : {}),
  appImage: process.env.APPIMAGE,
  start,
  userData: app.getPath('userData'),
})
require('./dist/main/main.cjs')
