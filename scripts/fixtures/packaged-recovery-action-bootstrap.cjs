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
assert.equal(process.env.XDG_DATA_HOME, path.join(root, 'data'))
assert.equal(process.env.APPIMAGELAUNCHER_DISABLE, '1')
const version = app.getVersion()
assert.ok(['0.1.0', '0.2.0', '0.3.0'].includes(version))
const installNext = process.env.IGS_RECOVERY_QUALIFICATION_INSTALL_NEXT === '1'
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
const group = () => fs.readFileSync('/proc/self/cgroup', 'utf8').trim().slice(3)
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
    if (this.name === path.join(root, 'data/imagegen-studio/database/app.sqlite')) {
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
event('startup', { appImage: process.env.APPIMAGE, start, userData: app.getPath('userData') })
require('./dist/main/main.cjs')
