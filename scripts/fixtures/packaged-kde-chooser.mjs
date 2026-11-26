/** Drive one real FileChooser request in the private KDE Wayland session. */
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { lstat, readFile, readdir, readlink, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { expect } from '@playwright/test'

const execute = promisify(execFile)
const frontName = 'org.freedesktop.portal.Desktop'
const backendName = 'org.freedesktop.impl.portal.desktop.kde'
const desktopPath = '/org/freedesktop/portal/desktop'
const requestRoot = `${desktopPath}/request/`
const projectFilter = /^\s*string "\*\.(?:igs|\[iI\]\[gG\]\[sS\])"$/m
const directoryOption = /string "directory"\s*\n\s*variant\s+boolean true\s*$/m
const directoryTitles = new Set(['Add Workspace', 'Locate Workspace Folder'])
const pngFilter = /^\s*string "\*\.(?:png|\[pP\]\[nN\]\[gG\])"$/m
const appImageFilter =
  /^\s*string "\*\.(?:[aA][pP][pP][iI][mM][aA][gG][eE]|\[aA\]\[pP\]\[pP\]\[iI\]\[mM\]\[aA\]\[gG\]\[eE\])"$/m
const saveNames = new Map([
  ['Export As', 'canvas.png'],
  ['Export Generation BBox', 'generation-bbox.png'],
])
const processes = {
  bus: '/usr/bin/dbus-daemon',
  compositor: '/usr/bin/kwin_wayland',
  front: '/usr/libexec/xdg-desktop-portal',
  backend: '/usr/lib/x86_64-linux-gnu/libexec/xdg-desktop-portal-kde',
}
const helper = fileURLToPath(new URL('./packaged-kde-chooser-atspi.py', import.meta.url))

async function output(command, args) {
  const { stdout } = await execute(command, args, { timeout: 4000 })
  return stdout.trim()
}

export async function sessionMethod(destination, objectPath, method, ...args) {
  return await output('/usr/bin/gdbus', [
    'call',
    '--address',
    process.env.DBUS_SESSION_BUS_ADDRESS,
    '--dest',
    destination,
    '--object-path',
    objectPath,
    '--method',
    method,
    ...args,
  ])
}

export async function connectionPid(name) {
  const result = await sessionMethod(
    'org.freedesktop.DBus',
    '/org/freedesktop/DBus',
    'org.freedesktop.DBus.GetConnectionUnixProcessID',
    name,
  )
  const pid = /^\(uint32 ([1-9][0-9]*),\)$/.exec(result)?.[1]
  assert.ok(pid, 'The private bus must resolve a live connection PID.')
  return Number(pid)
}

async function assertOwnedProcess(pid, executable, envKeys) {
  assert.ok(Number.isSafeInteger(pid) && pid > 1)
  const proc = `/proc/${pid}`
  assert.equal((await lstat(proc)).uid, process.getuid())
  if (executable) assert.equal(await realpath(`${proc}/exe`), executable)
  const env = (await readFile(`${proc}/environ`, 'utf8')).split('\0')
  for (const key of envKeys) {
    assert.ok(env.includes(`${key}=${process.env[key]}`), `PID ${pid} must use private ${key}.`)
  }
  assert.ok(!env.some((entry) => entry.startsWith('DISPLAY=')))
  assert.ok(!env.some((entry) => entry.startsWith('WAYLAND_SOCKET=')))
}

async function socketInodes(pid) {
  const dir = `/proc/${pid}/fd`
  const inodes = new Set()
  for (const fd of await readdir(dir)) {
    try {
      const inode = /^socket:\[([0-9]+)\]$/.exec(await readlink(`${dir}/${fd}`))?.[1]
      if (inode) inodes.add(inode)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return inodes
}

export async function assertPrivateWayland() {
  const {
    DISPLAY,
    WAYLAND_SOCKET,
    WAYLAND_DISPLAY: display,
    XDG_RUNTIME_DIR: runtime,
    DBUS_SESSION_BUS_ADDRESS: session,
    AT_SPI_BUS_ADDRESS: accessibility,
    XDG_CURRENT_DESKTOP: desktop,
    XDG_SESSION_TYPE: sessionType,
    IMAGEGEN_CHOOSER_KWIN_PID: kwin,
    IMAGEGEN_CHOOSER_SYSTEMD_RUNTIME_DIR: hostRuntime,
  } = process.env
  assert.equal(DISPLAY, undefined)
  assert.equal(WAYLAND_SOCKET, undefined)
  assert.equal(desktop, 'KDE')
  assert.equal(sessionType, 'wayland')
  assert.match(display ?? '', /^[A-Za-z0-9][A-Za-z0-9._-]+$/)
  assert.match(kwin ?? '', /^[1-9][0-9]+$/)
  assert.match(session ?? '', /^unix:(?:path|abstract)=[^;]+$/)
  assert.match(accessibility ?? '', /^unix:(?:path|abstract)=[^;]+$/)
  assert.notEqual(accessibility, session)
  assert.ok(path.isAbsolute(runtime) && path.resolve(runtime) === runtime)
  assert.match(runtime, /^\/[^\s]+$/)
  assert.notEqual(runtime, hostRuntime)
  assert.notEqual(runtime, `/run/user/${process.getuid()}`)
  assert.equal(await realpath(runtime), runtime)
  const runtimeStat = await lstat(runtime)
  assert.ok(runtimeStat.isDirectory() && runtimeStat.uid === process.getuid())
  assert.equal(runtimeStat.mode & 0o777, 0o700)
  const socket = path.join(runtime, display)
  assert.equal(await realpath(socket), socket)
  const entry = await lstat(socket)
  assert.ok(entry.isSocket() && entry.uid === process.getuid())

  const compositorPid = Number(kwin)
  await assertOwnedProcess(compositorPid, processes.compositor, [
    'DBUS_SESSION_BUS_ADDRESS',
    'XDG_RUNTIME_DIR',
  ])
  const args = (await readFile(`/proc/${kwin}/cmdline`, 'utf8')).split('\0')
  assert.ok(args.includes('--virtual') && !args.includes('--xwayland'))
  assert.ok(args.includes('--socket'))
  assert.equal(args[args.indexOf('--socket') + 1], display)
  const inodes = await socketInodes(compositorPid)
  const sockets = (await readFile(`/proc/${kwin}/net/unix`, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
  const listeners = sockets.filter((fields) => fields[3] === '00010000' && fields[7] === socket)
  assert.equal(listeners.length, 1, 'Exactly one listener must own the private Wayland socket.')
  assert.ok(inodes.has(listeners[0][6]))

  const busPid = await connectionPid('org.freedesktop.DBus')
  await assertOwnedProcess(busPid, processes.bus, ['XDG_RUNTIME_DIR'])
  for (const pid of [busPid, compositorPid]) {
    assert.equal(
      await readFile(`/proc/${pid}/cgroup`, 'utf8'),
      await readFile('/proc/self/cgroup', 'utf8'),
      'Use the bus and KWin from the enclosing owned test scope.',
    )
  }
  const address = await sessionMethod('org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Bus.GetAddress')
  assert.equal(address, `('${accessibility}',)`)
  return { socket, compositorPid, busPid }
}

export async function assertWaylandPeer(pid, session) {
  // The packaged launcher can normalize client environment variables.
  // The established socket pair is the connection authority.
  await assertOwnedProcess(pid, null, [])
  const [client, compositor, peers] = await Promise.all([
    socketInodes(pid),
    socketInodes(session.compositorPid),
    output('/usr/bin/ss', ['--unix', '--all', '--numeric', '--no-header']),
  ])
  assert.ok(
    peers.split('\n').some((line) => {
      const [, state, , , address, serverInode, , clientInode] = line.trim().split(/\s+/)
      return (
        state === 'ESTAB' &&
        address === session.socket &&
        compositor.has(serverInode) &&
        client.has(clientInode)
      )
    }),
    `PID ${pid} must have a live connection to its private Wayland compositor.`,
  )
}

function startMonitor(method) {
  const address = process.env.DBUS_SESSION_BUS_ADDRESS
  const rules = [
    `type='method_call',path='${desktopPath}',interface='org.freedesktop.portal.FileChooser',member='${method}'`,
    `type='method_call',path='${desktopPath}',interface='org.freedesktop.impl.portal.FileChooser',member='${method}'`,
    "type='signal',interface='org.freedesktop.portal.Request',member='Response'",
  ]
  const child = spawn('/usr/bin/dbus-monitor', ['--address', address, ...rules], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let failure
  const closed = new Promise((resolve) => child.once('close', resolve))
  child.once('error', (error) => {
    failure = error
  })
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    stdout += chunk
    if (stdout.length > 128 * 1024) {
      failure = new Error('Private FileChooser monitor exceeded its output bound.')
      child.kill()
    }
  })
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-8192)
  })
  return {
    trace: () => stdout,
    read() {
      if (failure) throw failure
      assert.equal(child.exitCode, null, stderr)
      assert.equal(child.signalCode, null, stderr)
      return stdout
    },
    async close() {
      child.kill()
      await closed
    },
  }
}

function monitorMessages(monitor) {
  const paragraphs = monitor.read().split(/(?=^(?:method call|signal) time=)/m)
  return paragraphs.filter(Boolean).map((message) => {
    const header = message.split('\n', 1)[0]
    const fields =
      /sender=([^ ]+) -> destination=([^ ]+) .* path=([^;]+); interface=([^;]+); member=(\S+)/.exec(
        header,
      )
    assert.ok(fields, header)
    const [, sender, destination, objectPath, iface, member] = fields
    const strings = [...message.matchAll(/^ {3}string "([^"]*)"$/gm)].map((match) => match[1])
    return { sender, destination, objectPath, iface, member, strings, body: message }
  })
}

function readStringOption(body, key) {
  const pattern = new RegExp(`string "${key}"\\s*\\n\\s*variant\\s+string "([^"]*)"`)
  return pattern.exec(body)?.[1]
}

async function observeRequest(
  monitor,
  state,
  windowTitle,
  kdePid,
  { method, filter, suggestedName, defaultDirectory },
) {
  let calls
  await expect
    .poll(() => {
      calls = monitorMessages(monitor).filter(({ member }) => member === method)
      return (
        calls.some(({ strings }) => strings.length === 2) &&
        calls.some(({ strings, body }) => strings.length === 3 && filter.test(body))
      )
    })
    .toBe(true)
  assert.equal(calls.length, 2)
  const front = calls.find(({ iface }) => iface === 'org.freedesktop.portal.FileChooser')
  const backend = calls.find(({ iface }) => iface === 'org.freedesktop.impl.portal.FileChooser')
  assert.ok(front && backend)
  const [parent, title] = front.strings
  assert.equal(title, windowTitle)
  // Some Electron versions omit the export handle even with Ozone/Wayland. The
  // compositor connection and unique D-Bus sender independently prove ownership.
  assert.match(parent, /^(?:wayland:[^\s]+)?$/)
  assert.deepEqual(backend.strings.slice(1), [parent, title])
  assert.equal(await connectionPid(front.sender), state.mainPid)
  const frontPid = await connectionPid(frontName)
  assert.equal(await connectionPid(front.destination), frontPid)
  assert.equal(await connectionPid(backend.sender), frontPid)
  assert.equal(await connectionPid(backend.destination), kdePid)
  await assertOwnedProcess(frontPid, processes.front, [
    'WAYLAND_DISPLAY',
    'DBUS_SESSION_BUS_ADDRESS',
    'XDG_RUNTIME_DIR',
  ])
  assert.match(front.body, filter)
  assert.match(backend.body, filter)
  const token = readStringOption(front.body, 'handle_token')
  assert.match(token ?? '', /^[A-Za-z0-9_]+$/)
  const senderKey = front.sender.slice(1).replaceAll('.', '_')
  assert.match(senderKey, /^\d+_\d+$/)
  const requestPath = `${requestRoot}${senderKey}/${token}`
  assert.ok(backend.body.includes(`object path "${requestPath}"`))
  const request = { parent, requestPath, frontSender: front.sender, frontPid }
  if (method === 'SaveFile') {
    const recovery = windowTitle === 'Save Recovery AppImage'
    for (const { body } of [front, backend]) {
      assert.match(body, recovery ? /^\s*string "AppImage"$/m : /^\s*string "PNG image"$/m)
      assert.equal(readStringOption(body, 'current_name'), suggestedName)
      if (defaultDirectory) {
        assert.ok(
          body.includes(`array of bytes "${defaultDirectory}" + \\0`),
          'The native recovery suggestion must point to the owned destination directory.',
        )
      }
    }
    const frontAcceptLabel = readStringOption(front.body, 'accept_label')
    assert.ok(
      frontAcceptLabel === undefined || frontAcceptLabel === (recovery ? 'Save' : 'Export PNG'),
    )
    assert.equal(readStringOption(backend.body, 'accept_label'), frontAcceptLabel)
    return { ...request, acceptLabel: frontAcceptLabel ?? 'Save' }
  }
  if (directoryTitles.has(windowTitle)) {
    const acceptLabel = readStringOption(front.body, 'accept_label')
    assert.equal(readStringOption(backend.body, 'accept_label'), acceptLabel)
    return { ...request, acceptLabel }
  }
  return request
}

async function observeResponse(monitor, request, selectedPath) {
  let matches
  await expect
    .poll(() => {
      matches = monitorMessages(monitor).filter(
        ({ objectPath, member, body }) =>
          objectPath === request.requestPath &&
          member === 'Response' &&
          /^ {3}uint32 [0-9]+$/m.test(body) &&
          (!selectedPath || /string "uris"\s*\n\s*variant\s+array \[[^\]]*\]/.test(body)),
      )
      return matches.length
    })
    .toBe(1)
  const [response] = matches
  assert.equal(response.iface, 'org.freedesktop.portal.Request')
  assert.equal(response.destination, request.frontSender)
  assert.equal(await connectionPid(response.sender), request.frontPid)
  const code = Number(/^ {3}uint32 ([0-9]+)$/m.exec(response.body)?.[1])
  assert.equal(code, selectedPath ? 0 : 1)
  const uriList = /string "uris"\s*\n\s*variant\s+array \[([^\]]*)\]/.exec(response.body)?.[1]
  const uris = uriList ? [...uriList.matchAll(/string "(file:\/\/[^"]+)"/g)] : []
  if (selectedPath) {
    assert.equal(uris.length, 1)
    assert.equal(fileURLToPath(uris[0][1]), selectedPath)
  } else {
    assert.deepEqual(uris, [])
  }
  return code
}

export async function driveKdeChooser({ state, source, windowTitle, trigger }) {
  assert.ok(windowTitle === 'Import Project' || windowTitle === 'Locate Project')
  if (source) {
    assert.equal(await realpath(source), source)
    assert.ok((await lstat(source)).isFile())
  }
  return await drive({
    state,
    selectedPath: source,
    windowTitle,
    trigger,
    method: 'OpenFile',
    filter: projectFilter,
  })
}

export async function driveKdeDirectoryChooser({ state, source, windowTitle, trigger, activate }) {
  assert.ok(directoryTitles.has(windowTitle), 'Use a qualified workspace folder dialog.')
  if (source !== undefined && source !== null) {
    const root = process.env.IMAGEGEN_LINUX_PACKAGE_ARTIFACTS
    assert.ok(root && path.isAbsolute(root))
    assert.equal(await realpath(root), root)
    const relative = path.relative(root, source)
    assert.ok(
      path.isAbsolute(source) &&
        path.resolve(source) === source &&
        relative &&
        relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative),
      'The selected directory must be a canonical descendant of the owned run.',
    )
    assert.equal(await realpath(source), source)
    const entry = await lstat(source)
    assert.ok(entry.isDirectory() && entry.uid === process.getuid())
  }
  return await drive({
    state,
    selectedPath: source,
    windowTitle,
    trigger,
    activate,
    method: 'OpenFile',
    filter: directoryOption,
  })
}

export async function driveKdeSaveChooser({
  state,
  destination,
  windowTitle,
  trigger,
  onPresented,
  acceptDefault,
  confirmExistingPng,
  version,
}) {
  const recovery = windowTitle === 'Save Recovery AppImage'
  assert.ok(version === undefined || (recovery && ['0.2.0', '0.4.0'].includes(version)))
  const suggestedName = recovery
    ? `ImageGen-Studio-${version ?? '0.2.0'}-Recovery.AppImage`
    : saveNames.get(windowTitle)
  assert.ok(suggestedName, 'Use a qualified export or recovery dialog.')
  if (acceptDefault) {
    assert.ok(recovery && destination)
    assert.equal(path.basename(destination), suggestedName.replace(/\.AppImage$/, '.appimage'))
  }
  if (confirmExistingPng) {
    assert.equal(process.env.IMAGEGEN_LINUX_PACKAGE_PROJECT_EXPORT, '1')
    assert.ok(
      !acceptDefault && destination && windowTitle === 'Export As' && state.name === 'first',
    )
    assert.equal(
      destination,
      path.join(process.env.IMAGEGEN_LINUX_PACKAGE_ARTIFACTS, 'exports/primary generation box.png'),
    )
  }
  if (destination !== undefined && destination !== null) {
    const root = process.env.IMAGEGEN_LINUX_PACKAGE_ARTIFACTS
    assert.equal(await realpath(root), root)
    assert.ok(path.isAbsolute(destination) && path.resolve(destination) === destination)
    assert.equal(
      path.extname(destination),
      acceptDefault ? '.appimage' : recovery ? '.AppImage' : '.png',
    )
    const parent = path.dirname(destination)
    const relative = path.relative(root, parent)
    assert.ok(!path.isAbsolute(relative) && !relative.startsWith('..'))
    assert.equal(await realpath(parent), parent)
    const directory = await lstat(parent)
    assert.ok(directory.isDirectory() && directory.uid === process.getuid())
    if (confirmExistingPng) {
      const file = await lstat(destination)
      assert.ok(file.isFile() && file.uid === process.getuid() && file.nlink === 1)
      assert.equal(await realpath(destination), destination)
    } else {
      await assert.rejects(lstat(destination), { code: 'ENOENT' })
    }
  }
  return await drive({
    state,
    selectedPath: destination,
    windowTitle,
    trigger,
    method: 'SaveFile',
    filter: recovery ? appImageFilter : pngFilter,
    suggestedName,
    onPresented,
    acceptDefault,
    confirmExistingPng,
    recoveryVersion: version,
  })
}

async function drive({
  state,
  selectedPath,
  windowTitle,
  trigger,
  activate = () => trigger.click(),
  method,
  filter,
  suggestedName,
  onPresented,
  acceptDefault,
  confirmExistingPng,
  recoveryVersion,
}) {
  const session = await assertPrivateWayland()
  await assertWaylandPeer(state.mainPid, session)
  state.kdeChooserAttempts = (state.kdeChooserAttempts ?? 0) + 1
  assert.match(state.name, /^[a-z-]+$/)
  const trace = `${state.name}.chooser-${state.kdeChooserAttempts}.dbus.log`
  const monitor = startMonitor(method)
  try {
    await expect.poll(() => monitor.read()).toContain('member=NameAcquired')
    await activate()
    let kdePid
    await expect
      .poll(async () => {
        try {
          kdePid = await connectionPid(backendName)
          return true
        } catch (error) {
          if (!error.stderr?.includes('Could not get PID')) throw error
          return false
        }
      })
      .toBe(true)
    await assertOwnedProcess(kdePid, processes.backend, [
      'WAYLAND_DISPLAY',
      'DBUS_SESSION_BUS_ADDRESS',
      'XDG_RUNTIME_DIR',
      'AT_SPI_BUS_ADDRESS',
    ])
    const request = await observeRequest(monitor, state, windowTitle, kdePid, {
      method,
      filter,
      suggestedName,
      defaultDirectory: acceptDefault ? path.dirname(selectedPath) : undefined,
    })
    await expect
      .poll(async () => {
        try {
          await assertWaylandPeer(kdePid, session)
          return true
        } catch (error) {
          if (error.code !== 'ERR_ASSERTION' || !error.message.includes('live connection')) {
            throw error
          }
          return false
        }
      })
      .toBe(true)
    const actOnDialog = async (filename) => {
      const { stdout } = await execute(
        '/usr/bin/python3',
        [
          helper,
          '--pid',
          String(kdePid),
          '--title',
          windowTitle,
          ...(request.acceptLabel ? ['--accept-label', request.acceptLabel] : []),
          ...(filename ? ['--select', filename] : []),
          ...(acceptDefault && filename ? ['--accept-default'] : []),
          ...(confirmExistingPng ? ['--owned-existing-png'] : []),
          ...(recoveryVersion ? ['--recovery-version', recoveryVersion] : []),
        ],
        { timeout: 15000 },
      )
      return JSON.parse(stdout)
    }
    let accessibility
    try {
      await onPresented?.()
      accessibility = await actOnDialog(selectedPath)
    } catch (error) {
      if (method !== 'SaveFile' && !directoryTitles.has(windowTitle)) throw error
      // Dismiss the verified native dialog before the caller tries normal close.
      try {
        await actOnDialog(null)
        await observeResponse(monitor, request, null)
      } catch (cancelError) {
        throw new AggregateError(
          [error, cancelError],
          `${method} observation and chooser cleanup failed.`,
        )
      }
      throw error
    }
    assert.deepEqual(accessibility, {
      pid: kdePid,
      title: windowTitle,
      action: selectedPath ? 'select' : 'dismiss',
      selectedPath: selectedPath ?? null,
      closed: true,
      ...(acceptDefault ? { acceptedDefaultName: path.basename(selectedPath) } : {}),
      ...(confirmExistingPng
        ? {
            overwriteConfirmation: {
              pid: kdePid,
              title: 'Overwrite File?',
              message: `The file "${path.basename(selectedPath)}" already exists. Do you wish to overwrite it?`,
              action: 'Overwrite',
              closed: true,
            },
          }
        : {}),
    })
    const responseCode = await observeResponse(monitor, request, selectedPath)
    return {
      lifetime: state.name,
      windowTitle,
      pid: kdePid,
      compositorPid: session.compositorPid,
      mainPid: state.mainPid,
      backend: backendName,
      parent: request.parent || null,
      requestPath: request.requestPath,
      trace,
      responseCode,
      action: selectedPath ? 'select' : 'dismiss',
      selectedPath: selectedPath ?? null,
      accessibility,
      ...(directoryTitles.has(windowTitle) && { method, directory: true }),
      ...(suggestedName && { method, suggestedName, acceptLabel: request.acceptLabel }),
    }
  } finally {
    await monitor.close()
    await writeFile(
      path.join(process.env.IMAGEGEN_LINUX_PACKAGE_ARTIFACTS, trace),
      monitor.trace(),
      {
        flag: 'wx',
        mode: 0o600,
      },
    )
  }
}
