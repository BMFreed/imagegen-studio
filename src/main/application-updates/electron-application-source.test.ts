/**
 * Controlled native Archive/kernel-executable ports with real owned files/descriptors. This does
 * not qualify Electron's real native cache, loaded V8 memory, a package or startup health.
 */
import assert from 'node:assert/strict'
import {
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  captureElectronApplicationUpdateCurrentSource,
  type ElectronApplicationSourceInput,
  type ElectronApplicationSourceNativePort,
} from './electron-application-source.js'

const supportedHost = process.platform === 'linux' && process.arch === 'x64'
function image(fill: number): Buffer {
  const bytes = Buffer.alloc(4096, fill)
  bytes.set([0x7f, 69, 76, 70, 2, 1, 1, 0, 65, 73, 2])
  bytes.writeUInt16LE(2, 16)
  bytes.writeUInt16LE(62, 18)
  bytes.writeUInt32LE(1, 20)
  bytes.writeUInt16LE(64, 52)
  return bytes
}

function fixture(t: { after: (cleanup: () => void) => void }) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-native-source-'))
  const resourcesPath = path.join(root, 'resources')
  mkdirSync(resourcesPath, { mode: 0o700 })
  const executablePath = path.join(root, 'imagegen-studio')
  const currentAppImage = path.join(root, 'Current.AppImage')
  const appPath = path.join(resourcesPath, 'app.asar')
  writeFileSync(executablePath, image(3), { mode: 0o755 })
  writeFileSync(currentAppImage, image(5), { mode: 0o755 })
  writeFileSync(appPath, Buffer.from('Controlled retained archive source.'), { mode: 0o600 })
  const archiveFd = openSync(appPath, constants.O_RDONLY)
  const executableFds: number[] = []
  const disposals: (() => void)[] = []
  t.after(() => {
    for (const dispose of disposals) {
      dispose()
    }
    closeSync(archiveFd)
    rmSync(root, { force: true, recursive: true })
  })
  const calls: { argument: string; kind: string; receiver?: unknown }[] = []
  class Archive {
    constructor(archivePath: string) {
      calls.push({ argument: archivePath, kind: 'Archive' })
    }
    getFdAndValidateIntegrityLater() {
      calls.push({ argument: String(archiveFd), kind: 'getFd', receiver: this })
      return archiveFd
    }
  }
  const port: ElectronApplicationSourceNativePort = {
    executablePath,
    linkedBinding(name) {
      calls.push({ argument: name, kind: 'binding' })
      return { Archive }
    },
    openExecutable() {
      const fd = openSync(executablePath, constants.O_RDONLY)
      executableFds.push(fd)
      return fd
    },
  }
  const input: ElectronApplicationSourceInput = {
    appPath,
    arch: 'x64',
    currentAppImage,
    electronVersion: '44.4.5',
    moduleDir: path.join(appPath, 'dist/main'),
    moduleFilename: path.join(appPath, 'dist/main/main.cjs'),
    packaged: true,
    platform: 'linux',
    resourcesPath,
  }
  const retain = <T extends { dispose: () => void } | null>(capture: T): T => {
    if (capture) {
      disposals.push(() => capture.dispose())
    }
    return capture
  }
  return { appPath, archiveFd, calls, currentAppImage, executableFds, input, port, retain, root }
}

test(
  'exact loader key captures retained ports; completed capability owns no native Archive descriptor',
  { skip: !supportedHost },
  async (t) => {
    const f = fixture(t)
    const originalArchive = fstatSync(f.archiveFd, { bigint: true })
    const capture = f.retain(captureElectronApplicationUpdateCurrentSource(f.input, f.port))
    assert.ok(capture)
    assert.deepEqual(
      f.calls.map(({ argument, kind }) => ({ argument, kind })),
      [
        { argument: 'electron_common_asar', kind: 'binding' },
        { argument: f.appPath, kind: 'Archive' },
        { argument: String(f.archiveFd), kind: 'getFd' },
      ],
    )
    assert.equal(Object.getPrototypeOf(f.calls[2].receiver).constructor.name, 'Archive')
    assert.equal(f.executableFds.length, 1)
    assert.equal(fstatSync(f.executableFds[0]).isFile(), true)
    const first = capture.complete()
    assert.equal(capture.complete(), first)
    const source = await first
    assert.equal(Object.isFrozen(source), true)
    assert.equal(source.currentAppImage, f.currentAppImage)
    source.assertCurrentSnapshot()
    await source.verifyCompleteSnapshot()
    assert.equal(fstatSync(f.executableFds[0]).isFile(), true)
    source.dispose()
    capture.dispose()
    assert.throws(() => fstatSync(f.executableFds[0]), { code: 'EBADF' })
    assert.equal(fstatSync(f.archiveFd, { bigint: true }).ino, originalArchive.ino)
    await assert.rejects(capture.complete())
  },
)

test('unsupported builds and nonexact loader keys refuse before native binding or executable open', (t) => {
  const f = fixture(t)
  const invalid: Partial<ElectronApplicationSourceInput>[] = [
    { packaged: false },
    { electronVersion: '44.4.6' },
    { platform: 'win32' },
    { arch: 'arm64' },
    { currentAppImage: null },
    { currentAppImage: '/owned/../Current.AppImage' },
    { appPath: path.join(f.input.resourcesPath, 'other.asar') },
    { moduleDir: path.join(f.input.appPath, 'dist/other') },
    { moduleFilename: path.join(f.input.moduleDir, 'other.cjs') },
    { resourcesPath: path.join(f.root, 'other-resources') },
  ]
  for (const change of invalid) {
    assert.equal(
      captureElectronApplicationUpdateCurrentSource({ ...f.input, ...change }, f.port),
      null,
    )
  }
  assert.deepEqual(f.calls, [])
  assert.deepEqual(f.executableFds, [])
})

test(
  'native binding failures and invalid Archive ports are unavailable without fresh-path fallback',
  { skip: !supportedHost },
  (t) => {
    const f = fixture(t)
    const bindings = [
      undefined,
      {},
      {
        Archive: class {
          constructor() {
            throw new Error('/private/native details')
          }
        },
      },
      { Archive: class {} },
      ...[-1, Number.NaN, 0.5, 0x80_00_00_00, '7', null].map((fd) => ({
        Archive: class {
          getFdAndValidateIntegrityLater() {
            return fd
          }
        },
      })),
    ]
    for (const binding of bindings) {
      assert.equal(
        captureElectronApplicationUpdateCurrentSource(f.input, {
          ...f.port,
          linkedBinding: () => binding,
        }),
        null,
      )
    }
    assert.equal(
      captureElectronApplicationUpdateCurrentSource(f.input, {
        ...f.port,
        linkedBinding: () => {
          throw new Error('/private/native details')
        },
      }),
      null,
    )
    assert.deepEqual(f.executableFds, [])
    assert.equal(fstatSync(f.archiveFd).isFile(), true)
  },
)

test(
  'kernel-executable identity mismatch closes only its newly opened descriptor',
  { skip: !supportedHost },
  (t) => {
    const f = fixture(t)
    const otherExecutable = path.join(f.root, 'other-executable')
    writeFileSync(otherExecutable, image(3), { mode: 0o755 })
    let ownedFd = -1
    const capture = captureElectronApplicationUpdateCurrentSource(f.input, {
      ...f.port,
      openExecutable: () => (ownedFd = openSync(otherExecutable, constants.O_RDONLY)),
    })
    assert.equal(capture, null)
    assert.throws(() => fstatSync(ownedFd), { code: 'EBADF' })
    assert.equal(fstatSync(f.archiveFd).isFile(), true)
  },
)

test(
  'native cached Archive remains distinct from a replaced visible ASAR instead of opening the new path',
  { skip: !supportedHost },
  (t) => {
    const f = fixture(t)
    const retained = path.join(f.root, 'retained-archive')
    renameSync(f.appPath, retained)
    writeFileSync(f.appPath, Buffer.from('Controlled retained archive source.'), { mode: 0o600 })
    const capture = f.retain(captureElectronApplicationUpdateCurrentSource(f.input, f.port))
    assert.equal(capture, null)
    assert.equal(f.executableFds.length, 1)
    assert.throws(() => fstatSync(f.executableFds[0]), { code: 'EBADF' })
    assert.equal(fstatSync(f.archiveFd).isFile(), true)
    assert.equal(f.calls.filter((call) => call.kind === 'Archive').length, 1)
  },
)

test(
  'completion rejects source drift and releases adapter ownership while retaining native Archive FD',
  { skip: !supportedHost },
  async (t) => {
    const f = fixture(t)
    const capture = f.retain(captureElectronApplicationUpdateCurrentSource(f.input, f.port))
    assert.ok(capture)
    writeFileSync(f.currentAppImage, image(9))
    await assert.rejects(capture.complete())
    assert.throws(() => fstatSync(f.executableFds[0]), { code: 'EBADF' })
    assert.equal(fstatSync(f.archiveFd).isFile(), true)
  },
)

test(
  'disposing metadata-only capture closes owned descriptors without completing or closing native Archive',
  { skip: !supportedHost },
  async (t) => {
    const f = fixture(t)
    const capture = f.retain(captureElectronApplicationUpdateCurrentSource(f.input, f.port))
    assert.ok(capture)
    capture.dispose()
    capture.dispose()
    assert.throws(() => fstatSync(f.executableFds[0]), { code: 'EBADF' })
    assert.equal(fstatSync(f.archiveFd).isFile(), true)
    await assert.rejects(capture.complete())
  },
)
