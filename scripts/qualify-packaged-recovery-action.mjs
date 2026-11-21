/** Exercise the actual packaged Updates recovery action and subsequent update review. */
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { constants, createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

import { chromium, expect } from '@playwright/test'

import { verifyApplicationReleaseAuthority } from '../src/main/application-updates/application-release.ts'
import { acquireApplicationUpdateAdmission } from '../src/main/application-updates/application-update-admission.ts'
import {
  captureApplicationUpdateCurrentSource,
  stageVerifiedApplicationArtifact,
} from '../src/main/application-updates/application-update-staging.ts'
import { readIgsPackage } from '../src/main/projects/igs-package.ts'
import { assertPrivateWayland, driveKdeSaveChooser } from './fixtures/packaged-kde-chooser.mjs'
import {
  boundQualificationProcess,
  confirmQualificationProcessExit,
} from './qualification-resource-limits.mjs'

const repo = path.dirname(import.meta.dirname)
const [run, ...rest] = process.argv.slice(2)
assert.ok(
  run &&
    (rest.length === 0 ||
      (rest.length === 1 &&
        ['--install-next', '--kde-install-next', '--kde-save', '--kde-save-default'].includes(
          rest[0],
        ))),
)
const kdeInstallNext = rest[0] === '--kde-install-next'
const installNext = rest[0] === '--install-next' || kdeInstallNext
const kdeSaveDefault = rest[0] === '--kde-save-default' || kdeInstallNext
const kdeSave = rest[0] === '--kde-save' || kdeSaveDefault
const outputRoot = path.join(
  kdeSave ? os.userInfo().homedir : os.homedir(),
  '.codex/artifacts/imagegen-studio/runs/packaged-recovery-action',
)
assert.equal(await fs.realpath(run), run)
assert.equal(path.dirname(run), outputRoot)
assert.equal((await fs.lstat(run)).uid, process.geteuid())
const readJson = async (file) => JSON.parse(await fs.readFile(path.join(run, file), 'utf8'))
assert.equal((await readJson('artifact-lifecycle.json')).state, 'running')
const manifest = await readJson('package-manifest.json')
const root = path.join(run, 'payloads')
assert.equal(await fs.realpath(root), root)
assert.equal(manifest.kdeSave === true, kdeSave)
assert.equal(manifest.kdeInstallNext === true, kdeInstallNext)
if (kdeSave) {
  await assertPrivateWayland()
  process.env.IMAGEGEN_LINUX_PACKAGE_ARTIFACTS = run
}
const execute = (command, args, options) =>
  promisify(execFile)(
    command,
    args.map((arg) => (['MemoryMax=10G', 'MemoryMax=12G'].includes(arg) ? 'MemoryMax=4G' : arg)),
    kdeSave
      ? {
          ...options,
          env: {
            ...process.env,
            XDG_RUNTIME_DIR: process.env.IMAGEGEN_CHOOSER_SYSTEMD_RUNTIME_DIR,
          },
        }
      : options,
  )
const releaseVersions =
  kdeSave && !kdeInstallNext ? ['0.1.0', '0.2.0'] : ['0.1.0', '0.2.0', '0.3.0']
assert.deepEqual(Object.keys(manifest.releases).sort(), releaseVersions)
const releases = releaseVersions.map((version) => {
  const release = manifest.releases[version]
  assert.equal(path.dirname(release.filename), path.join(root, 'build', version))
  assert.equal(
    verifyApplicationReleaseAuthority(release.authority, manifest.trust).version,
    version,
  )
  return release
})
const [a, b, c] = releases
assert.ok(
  Number.isInteger(manifest.feedPort) && manifest.feedPort > 1024 && manifest.feedPort <= 65535,
)

const hash = async (file, algorithm = 'sha256') => {
  const digest = createHash(algorithm)
  for await (const chunk of createReadStream(file)) digest.update(chunk)
  return digest.digest(algorithm === 'sha512' ? 'base64' : 'hex')
}
async function fileWitness(filename) {
  const inspect = async () => {
    assert.equal(await fs.realpath(filename), filename)
    const info = await fs.lstat(filename, { bigint: true })
    assert.ok(info.isFile() && info.uid === BigInt(process.geteuid()) && info.nlink === 1n)
    return {
      dev: String(info.dev),
      ino: String(info.ino),
      mode: Number(info.mode & 0o7777n),
      ctime: String(info.ctimeNs),
      mtime: String(info.mtimeNs),
      sizeBytes: Number(info.size),
    }
  }
  const before = await inspect()
  const sha256 = await hash(filename)
  assert.deepEqual(await inspect(), before)
  return { ...before, sha256 }
}

async function readOwnedRecord(filename, maximumBytes = 16 * 1024) {
  const info = await fs.lstat(filename)
  assert.ok(info.isFile() && info.uid === process.geteuid() && info.nlink === 1)
  assert.equal(info.mode & 0o077, 0)
  assert.ok(info.size > 0 && info.size <= maximumBytes, filename)
  assert.equal(await fs.realpath(filename), filename)
  return JSON.parse(await fs.readFile(filename, 'utf8'))
}

async function readScopeIdentity(group) {
  const scope = path.join('/sys/fs/cgroup', group)
  const entry = await fs.lstat(scope, { bigint: true })
  assert.ok(entry.isDirectory() && !entry.isSymbolicLink())
  return { device: String(entry.dev), inode: String(entry.ino) }
}

async function readInstalledRuntime() {
  const filename = path.join(root, 'installed-runtime-fixture.json')
  try {
    await fs.lstat(filename)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  assert.ok(installNext)
  const fixture = await readOwnedRecord(filename)
  const engineRun = path.dirname(fixture.engineReport)
  assert.deepEqual(Object.keys(fixture).sort(), [
    'appData',
    'baselineProject',
    'engineReport',
    'ownerPid',
    'run',
    'runtimeId',
    'schemaVersion',
    ...(Object.hasOwn(fixture, 'trained') ? ['trained'] : []),
  ])
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(path.basename(fixture.engineReport), 'installed-engine.json')
  assert.equal(
    path.dirname(engineRun),
    path.join(path.dirname(outputRoot), 'packaged-installed-engine'),
  )
  assert.equal(path.dirname(fixture.run), engineRun)
  assert.equal(await fs.realpath(fixture.run), fixture.run)
  assert.equal(await fs.realpath(fixture.appData), fixture.appData)
  assert.match(
    path.relative(path.join(engineRun, 'payloads'), fixture.appData),
    /^native-runtime-offline-[a-zA-Z0-9]+\/data\/imagegen-studio$/,
  )
  assert.match(fixture.runtimeId, /^release-[0-9a-f-]{36}$/)
  const engine = await readOwnedRecord(fixture.engineReport, 8 * 1024 ** 2)
  assert.equal(engine.outcome, 'PASS')
  assert.equal(engine.qualification, 'actual-signed-full-engine-install-native-qualification')
  assert.equal(engine.roots.appDataDir, fixture.appData)
  assert.equal(engine.activatedPointer.runtimeId, fixture.runtimeId)
  let trained
  if (fixture.trained !== undefined) {
    const modelFixture = fixture.trained
    assert.deepEqual(Object.keys(modelFixture).sort(), [
      'appData',
      'family',
      'files',
      'model',
      'profile',
      'runtimeId',
      'schemaVersion',
    ])
    assert.equal(modelFixture.schemaVersion, 1)
    assert.equal(modelFixture.profile, 'noobai-eps')
    assert.equal(modelFixture.family, 'illustrious')
    assert.equal(modelFixture.appData, fixture.appData)
    assert.equal(modelFixture.runtimeId, fixture.runtimeId)
    const python = engine.activatedPointer.pythonExecutable
    assert.equal(
      python,
      path.join(fixture.appData, 'runtime/environments', fixture.runtimeId, 'bin/python'),
    )
    const pythonPath = await fs.realpath(python)
    assert.ok(pythonPath.startsWith(path.join(fixture.appData, 'runtime') + path.sep))
    trained = {
      fixture: modelFixture,
      databasePath: path.join(fixture.appData, 'database/app.sqlite'),
      python,
      pythonPath,
    }
  }
  assert.equal(fixture.ownerPid, process.ppid)
  const claim = await readOwnedRecord(
    path.join(path.dirname(fixture.appData), '.packaged-upgrade-qualification/owner.json'),
  )
  assert.deepEqual(claim, { appData: fixture.appData, pid: fixture.ownerPid, run: fixture.run })
  const owner = await proc(fixture.ownerPid)
  const self = await proc(process.pid)
  assert.match(self.group, /^\/[^\n]+\/igs-[\w-]+\.service$/)
  assert.equal(path.posix.normalize(self.group), self.group)
  assert.equal(owner.group, self.group)
  const scope = path.join('/sys/fs/cgroup', self.group)
  const memoryLimit = (trained ? 12n : 4n) * 1024n ** 3n
  assert.equal(BigInt(await fs.readFile(path.join(scope, 'memory.max'), 'utf8')), memoryLimit)
  assert.equal((await fs.readFile(path.join(scope, 'memory.swap.max'), 'utf8')).trim(), '0')
  const x11Pid = Number(process.env.IMAGEGEN_CHOOSER_X11_PID)
  assert.ok(Number.isSafeInteger(x11Pid) && x11Pid > 1)
  assert.match(process.env.DISPLAY, /^:\d+$/)
  assert.equal(process.env.WAYLAND_DISPLAY, undefined)
  assert.equal(process.env.XDG_SESSION_TYPE, 'x11')
  assert.equal((await proc(x11Pid)).group, self.group)
  assert.equal(path.basename(await fs.readlink(`/proc/${x11Pid}/exe`)), 'Xvfb')
  const xauthority = process.env.XAUTHORITY
  assert.ok(xauthority && (await fs.realpath(xauthority)) === xauthority)
  const authorization = await fs.lstat(xauthority)
  assert.ok(
    authorization.isFile() &&
      authorization.uid === process.geteuid() &&
      (authorization.mode & 0o077) === 0,
  )

  const baseline = fixture.baselineProject
  assert.equal(
    baseline.path,
    path.join(engineRun, 'historical-upgrade-r2/native/after-first-close.igs'),
  )
  const baselineWitness = await fileWitness(baseline.path)
  assert.equal(baselineWitness.sizeBytes, baseline.sizeBytes)
  assert.equal(baselineWitness.sha256, baseline.sha256)
  return {
    ...fixture,
    trained,
    owner,
    scopeIdentity: await readScopeIdentity(self.group),
    baselineWitness,
  }
}

const installedRuntime = await readInstalledRuntime()
assert.ok(!kdeSave || !installedRuntime)
const kdeUpdateScope = kdeInstallNext ? (await proc(process.pid)).group : null
const trained = installedRuntime?.trained
const signedTrained = trained
  ? await import('./fixtures/packaged-signed-trained-generation.mjs')
  : null
const installedMemoryLimit = (trained ? 12n : 4n) * 1024n ** 3n

async function assertInheritedScope(observed) {
  assert.equal(observed.group, installedRuntime.owner.group)
  assert.deepEqual(await readScopeIdentity(observed.group), installedRuntime.scopeIdentity)
  assert.deepEqual(await proc(installedRuntime.owner.pid), installedRuntime.owner)
}

const packaged = []
for (const release of releases) {
  const observation = await fileWitness(release.filename)
  assert.equal(observation.sizeBytes, release.sizeBytes)
  assert.equal(observation.sha256, release.sha256)
  assert.equal(await hash(release.filename, 'sha512'), release.sha512)
  assert.equal(observation.mode, 0o755)
  packaged.push(observation)
}
for (const [file, expected] of Object.entries(manifest.dist)) {
  assert.ok(file.startsWith('dist/') && path.normalize(file) === file)
  assert.equal(await hash(path.join(repo, file)), expected)
}
assert.equal(
  await hash(path.join(repo, 'scripts/fixtures/packaged-recovery-action-bootstrap.cjs')),
  manifest.bootstrapSha256,
)

const applicationDir = path.join(root, 'Applications')
const profile = path.join(root, 'profile')
const cwd = path.join(root, 'cwd')
const data = installedRuntime ? path.dirname(installedRuntime.appData) : path.join(root, 'data')
const workspace = path.join(data, 'imagegen-studio/workspaces/Uncategorized')
const original = path.join(applicationDir, 'Original.AppImage')
const newPath = path.join(
  applicationDir,
  kdeSaveDefault ? 'ImageGen-Studio-0.2.0-Recovery.appimage' : 'Recovered.AppImage',
)
const events = async () =>
  (
    await fs.readFile(path.join(root, 'native-events.ndjson'), 'utf8').catch((error) => {
      if (error.code !== 'ENOENT') throw error
      return ''
    })
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse)
for (const folder of [
  applicationDir,
  profile,
  cwd,
  ...(installedRuntime ? [] : [data]),
  path.join(root, 'config'),
  path.join(root, 'cache'),
]) {
  await fs.mkdir(folder, { mode: 0o700 })
}
if (kdeSaveDefault) {
  assert.match(applicationDir, /^\/[a-zA-Z0-9_/.-]+$/)
  await fs.writeFile(
    path.join(root, 'config/user-dirs.dirs'),
    `XDG_DOWNLOAD_DIR="${applicationDir}"\n`,
    { flag: 'wx', mode: 0o600 },
  )
}

async function inspectInstalledProject(filename) {
  const { manifest, project } = await readIgsPackage(filename)
  assert.deepEqual(manifest.preview, {
    rect: { height: 32, width: 48, x: 0, y: 0 },
    status: 'rendered',
  })
  assert.equal(project.layers.length, 1)
  const [layer] = project.layers
  assert.equal(layer.kind, 'raster')
  assert.equal(layer.asset.width, 48)
  assert.equal(layer.asset.height, 32)
  const rasterAndPreview = manifest.members.filter(({ path: member }) => member !== 'project.json')
  assert.equal(rasterAndPreview.length, 4)
  return { project, preview: manifest.preview, rasterAndPreview }
}

let installedProject
if (installedRuntime) {
  await fs.mkdir(path.dirname(workspace), { mode: 0o700 })
  await fs.mkdir(workspace, { mode: 0o700 })
  assert.equal(await fs.realpath(workspace), workspace)
  const filename = path.join(workspace, 'Installed runtime signed update.igs')
  const source = installedRuntime.baselineProject.path
  const baseline = await inspectInstalledProject(source)
  await fs.copyFile(source, filename, constants.COPYFILE_EXCL)
  assert.equal(await hash(filename), installedRuntime.baselineWitness.sha256)
  installedProject = { filename, baseline }
}

// Seed the retained publication through real staging. This tiny source is only
// inspected by staging and never executed. The actual old executable is A.
const predecessor = Buffer.alloc(4096, 0x37)
predecessor.fill(0, 0, 64)
predecessor.set([0x7f, 69, 76, 70, 2, 1, 1, 0, 65, 73, 2])
predecessor.writeUInt16LE(3, 16)
predecessor.writeUInt16LE(62, 18)
predecessor.writeUInt32LE(1, 20)
predecessor.writeUInt16LE(64, 52)
await fs.writeFile(original, predecessor, { flag: 'wx', mode: 0o755 })
const handle = await fs.open(original, 'r')
let retainedDirectory
try {
  const capture = captureApplicationUpdateCurrentSource({
    archiveFd: handle.fd,
    archivePath: original,
    currentAppImage: original,
    executableFd: handle.fd,
    executablePath: original,
  })
  try {
    const currentSource = await capture.complete()
    const admission = acquireApplicationUpdateAdmission(original)
    try {
      const staged = await stageVerifiedApplicationArtifact({
        artifact: {
          authority: a.authority,
          manifest: verifyApplicationReleaseAuthority(a.authority, manifest.trust),
          path: a.filename,
          verifyCompleteSnapshot: async () =>
            assert.deepEqual(await fileWitness(a.filename), packaged[0]),
        },
        currentAppImage: original,
        currentSource,
      })
      const transaction = await staged.prepareBackup()
      const activated = await transaction.activate(() => admission.assertHeld())
      retainedDirectory = activated.stagingDirectory
      assert.deepEqual(await fs.readFile(activated.backupPath), predecessor)
    } finally {
      admission.release()
    }
  } finally {
    capture.dispose()
  }
} finally {
  await handle.close()
}
async function retainedState() {
  const members = await fs.readdir(retainedDirectory)
  assert.deepEqual(members.sort(), [
    'journal.json',
    'previous.AppImage',
    'release-envelope.json',
    'release-notes.json',
  ])
  const files = {}
  for (const name of members) files[name] = await fileWitness(path.join(retainedDirectory, name))
  return {
    ...files,
    image: await fileWitness(original),
    lock: await fileWitness(retainedDirectory + '.lock'),
  }
}
const retained = await retainedState()

const requests = []
const sockets = new Set()
let offered = null
const server = http.createServer((request, response) => {
  const route = new URL(request.url, 'http://127.0.0.1').pathname
  const record = { method: request.method, range: request.headers.range ?? null, route }
  requests.push(record)
  if (!offered || request.method !== 'GET') {
    record.status = 503
    response.writeHead(503).end()
    return
  }
  if (route === '/latest-linux.yml') {
    const body = Buffer.from(offered.metadata)
    record.status = 200
    response
      .writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': body.length,
        'Content-Type': 'text/yaml',
      })
      .end(body)
    return
  }
  if (route !== '/' + path.basename(offered.filename)) {
    record.status = 404
    response.writeHead(404).end()
    return
  }
  const body = offered
  const match = record.range?.match(/^bytes=(\d+)-(\d*)$/)
  const start = match ? Number(match[1]) : 0
  const end = match?.[2] ? Number(match[2]) : body.sizeBytes - 1
  if ((record.range && !match) || start < 0 || start > end || end >= body.sizeBytes) {
    record.status = 416
    response.writeHead(416).end()
    return
  }
  record.status = match ? 206 : 200
  response.writeHead(record.status, {
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    'Content-Type': 'application/octet-stream',
    ...(match ? { 'Content-Range': `bytes ${start}-${end}/${body.sizeBytes}` } : {}),
  })
  void pipeline(createReadStream(body.filename, { start, end }), response).catch((error) =>
    response.destroy(error),
  )
})
server.on('connection', (socket) => {
  sockets.add(socket)
  socket.once('close', () => sockets.delete(socket))
})
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(manifest.feedPort, '127.0.0.1', resolve)
})
const env = {
  ...process.env,
  APPIMAGE_EXTRACT_AND_RUN: '1',
  APPIMAGELAUNCHER_DISABLE: '1',
  ELECTRON_OZONE_PLATFORM_HINT: kdeSave ? 'wayland' : 'x11',
  IGS_RECOVERY_QUALIFICATION_KDE_SAVE: kdeSave ? '1' : '0',
  IGS_RECOVERY_QUALIFICATION_ROOT: root,
  IGS_RECOVERY_QUALIFICATION_INSTALL_NEXT: installNext ? '1' : '0',
  XDG_CACHE_HOME: path.join(root, 'cache'),
  XDG_CONFIG_HOME: path.join(root, 'config'),
  XDG_DATA_HOME: data,
  XDG_SESSION_TYPE: kdeSave ? 'wayland' : 'x11',
}
for (const key of [
  'APPDIR',
  'APPIMAGE',
  'APPIMAGE_EXIT_AFTER_INSTALL',
  'APPIMAGE_SILENT_INSTALL',
  'ELECTRON_NO_ASAR',
  'ELECTRON_RUN_AS_NODE',
  'IMAGEGEN_DEV_SERVER_URL',
  'IMAGEGEN_TEST_IMAGE_WORKER',
  'IGS_RECOVERY_QUALIFICATION_INSTALLED_RUNTIME',
  'IGS_RECOVERY_QUALIFICATION_OWNER_START',
  'NODE_OPTIONS',
  'NO_CLEANUP',
])
  delete env[key]
if (!kdeSave) delete env.WAYLAND_DISPLAY
if (installedRuntime) {
  env.IGS_RECOVERY_QUALIFICATION_INSTALLED_RUNTIME = '1'
  env.IGS_RECOVERY_QUALIFICATION_OWNER_START = installedRuntime.owner.start
}

async function bounded(promise, limit, message) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), limit)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

const lifetimes = []
const portFile = path.join(profile, 'DevToolsActivePort')
const removePortFile = async () =>
  await fs.unlink(portFile).catch((error) => {
    if (error.code !== 'ENOENT') throw error
  })

async function until(probe, description, timeout = 45_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await probe()
    if (value) return value
    await delay(100)
  }
  throw new Error(description)
}
async function nativeEvent(name, version, timeout) {
  return await until(
    async () => {
      const matched = (await events()).filter(
        (item) => item.name === name && item.version === version,
      )
      assert.ok(matched.length <= 1, 'Unexpected duplicate native lifecycle event.')
      return matched[0]
    },
    `Missing native ${name} event for ${version}.`,
    timeout,
  )
}
async function proc(pid) {
  const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8')
  const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  const group = (await fs.readFile(`/proc/${pid}/cgroup`, 'utf8')).trim().slice(3)
  return { group, pid, start }
}
async function ownKdeScope(pid, start) {
  const scopeName = `app-imagegen\\x2dstudio-${pid}.scope`
  return await until(
    async () => {
      const observed = await proc(pid)
      assert.equal(observed.start, start)
      return path.basename(observed.group) === scopeName ? observed : null
    },
    'Packaged Main did not enter its owned KDE scope.',
    30_000,
  )
}
async function bindNative(state, refreshMainDeathProof = false) {
  const surviveMainDeath =
    installNext && !kdeInstallNext && !installedRuntime && state.version === '0.2.0'
  if (trained) await assertInheritedScope(await proc(state.pid))
  const check = await boundQualificationProcess(state.pid, {
    deadlineSeconds: 360,
    execute,
    refreshMainDeathProof,
    surviveMainDeath,
  })
  assert.deepEqual(check.nativeIdentity, { pid: state.pid, start: state.start })
  if (installedRuntime) {
    await assertInheritedScope(await proc(state.pid))
    assert.ok(check.groups.every(({ group }) => group === installedRuntime.owner.group))
  }
  if (kdeInstallNext) {
    assert.ok(
      check.groups.every(
        ({ group, memoryMax, swapMax }) =>
          group === kdeUpdateScope && BigInt(memoryMax) <= 4n * 1024n ** 3n && swapMax === '0',
      ),
    )
  }
  state.checks.push(check)
  return check
}
function recordAggregate(state) {
  const groups = Object.fromEntries(
    state.checks.flatMap((check) => check.groups.map((entry) => [entry.group, entry])),
  )
  const aggregate = Object.values(groups).reduce((sum, entry) => sum + BigInt(entry.memoryMax), 0n)
  assert.ok(aggregate <= (installedRuntime ? installedMemoryLimit : 8n * 1024n ** 3n))
  assert.ok(Object.values(groups).every((entry) => entry.swapMax === '0'))
  state.aggregateMemoryLimit = aggregate.toString()
}
async function bindTrainedWorker(state) {
  const check = await bindNative(state)
  recordAggregate(state)
  return check
}

async function readTrainedMemory(state) {
  const observed = await proc(state.pid)
  await assertInheritedScope(observed)
  const scope = path.join('/sys/fs/cgroup', observed.group)
  const files = ['memory.max', 'memory.swap.max', 'memory.peak', 'memory.events', 'memory.stat']
  const contents = await Promise.all(
    files.map((name) => fs.readFile(path.join(scope, name), 'utf8')),
  )
  const memory = Object.fromEntries(files.map((name, index) => [name, contents[index].trim()]))
  assert.equal(BigInt(memory['memory.max']), installedMemoryLimit)
  assert.equal(memory['memory.swap.max'], '0')
  assert.match(memory['memory.events'], /^oom 0$/m)
  assert.match(memory['memory.events'], /^oom_kill 0$/m)
  return memory
}
async function successorEndpoint(state) {
  const identity = await proc(state.pid)
  assert.equal(identity.start, state.start)
  const fdDirectory = `/proc/${identity.pid}/fd`
  const socketInodes = new Set(
    await Promise.all(
      (await fs.readdir(fdDirectory)).map(async (fd) => {
        const target = await fs.readlink(path.join(fdDirectory, fd)).catch((error) => {
          if (error.code !== 'ENOENT') throw error
          return ''
        })
        return /^socket:\[(\d+)\]$/.exec(target)?.[1]
      }),
    ),
  )
  const listeners = await fs.readFile(`/proc/${identity.pid}/net/tcp`, 'utf8')
  for (const row of listeners.trimEnd().split('\n').slice(1)) {
    const [, address, , status, , , , , , inode] = row.trim().split(/\s+/)
    if (status !== '0A' || !address.startsWith('0100007F:') || !socketInodes.has(inode)) continue
    const port = Number.parseInt(address.split(':')[1], 16)
    const base = `127.0.0.1:${port}`
    try {
      const response = await fetch(`http://${base}/json/version`, {
        redirect: 'error',
        signal: AbortSignal.timeout(1_000),
      })
      if (!response.ok) continue
      const { webSocketDebuggerUrl } = await response.json()
      if (
        typeof webSocketDebuggerUrl === 'string' &&
        webSocketDebuggerUrl.startsWith(`ws://${base}/devtools/browser/`) &&
        /^\/devtools\/browser\/[0-9a-f-]+$/.test(new URL(webSocketDebuggerUrl).pathname)
      ) {
        assert.equal((await proc(state.pid)).start, state.start)
        return webSocketDebuggerUrl
      }
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error
      // Chromium may not yet accept requests on the listening socket.
    }
  }
  return null
}
async function ownedEndpoint(state) {
  const endpoint = await until(async () => {
    if (state.spawnError || state.closed) {
      throw new Error(`AppImage ${state.version} exited before CDP readiness.`, {
        cause: state.spawnError,
      })
    }
    try {
      const [port, route] = (await fs.readFile(portFile, 'utf8')).trim().split('\n')
      if (
        /^\d+$/.test(port) &&
        Number(port) > 0 &&
        /^\/devtools\/browser\/[0-9a-f-]+$/.test(route)
      ) {
        return `ws://127.0.0.1:${port}${route}`
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    // A real relaunch can detach stderr. Resolve C's own listening socket
    // and confirm its Browser PID again at the CDP handshake.
    if (!state.child) return await successorEndpoint(state)
    // Chromium sometimes logs the endpoint without creating a port file.
    const log = await fs.open(state.stderrPath, 'r')
    try {
      const stat = await log.stat()
      const offset = Math.max(0, stat.size - 128 * 1024)
      if (offset >= stat.size) return null
      const bytes = Buffer.alloc(stat.size - offset)
      const { bytesRead } = await log.read(bytes, 0, bytes.length, offset)
      const matches = [
        ...bytes
          .subarray(0, bytesRead)
          .toString()
          .matchAll(
            /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[0-9a-f-]+)/g,
          ),
      ]
      return matches.at(-1)?.[1]
    } finally {
      await log.close()
    }
  }, 'Packaged Chromium must expose its owned loopback CDP endpoint.')
  return endpoint
}
async function observeRenderer(state) {
  state.browser = await chromium.connectOverCDP(await ownedEndpoint(state), { timeout: 10_000 })
  const cdp = await state.browser.newBrowserCDPSession()
  try {
    const info = await cdp.send('SystemInfo.getProcessInfo')
    const mains = info.processInfo.filter((entry) => entry.type === 'browser')
    assert.equal(mains.length, 1)
    assert.equal(mains[0].id, state.pid)
  } finally {
    await cdp.detach()
  }
  await bindNative(state)
  if (state.child && state.child.pid !== state.pid) {
    state.checks.push(
      await boundQualificationProcess(state.child.pid, { deadlineSeconds: 360, execute }),
    )
  }
  recordAggregate(state)
  state.page = await until(
    () =>
      state.browser
        .contexts()
        .flatMap((context) => context.pages())
        .find(
          (page) =>
            page.url().startsWith('file:') && page.url().endsWith('/dist/renderer/index.html'),
        ),
    'The actual packaged renderer must load.',
    20_000,
  )
  assert.equal(
    await hash(
      path.join(path.dirname(await fs.realpath(`/proc/${state.pid}/exe`)), 'resources/app.asar'),
    ),
    manifest.releases[state.version].embedded.asarSha256,
  )
  await expect(state.page.getByRole('region', { name: 'Home', exact: true })).toBeVisible()
  return state
}
async function observeStartup(state) {
  const startup = await nativeEvent('startup', state.version)
  assert.equal(startup.appImage, state.filename)
  assert.equal(startup.userData, profile)
  if (state.pid !== undefined) assert.equal(startup.pid, state.pid)
  state.pid = startup.pid
  state.start = startup.start
  if (kdeSave) state.mainPid = startup.pid
  assert.equal((await proc(state.pid)).start, state.start)
  if (installedRuntime) {
    assert.equal(startup.appData, installedRuntime.appData)
    await assertInheritedScope(await proc(state.pid))
  } else if (kdeInstallNext) {
    assert.equal((await proc(state.pid)).group, kdeUpdateScope)
  } else if (installNext && state.version === '0.2.0') {
    await ownKdeScope(state.pid, state.start)
  }
}
async function launch(filename, version) {
  await removePortFile()
  const stderrPath = path.join(run, `native-${version}.stderr`)
  const state = {
    checks: [],
    filename,
    stderrPath,
    version,
    ...(kdeSave ? { name: version === '0.1.0' ? 'recovery-original' : 'recovery-saved' } : {}),
  }
  lifetimes.push(state)
  const stdout = await fs.open(path.join(run, `native-${version}.stdout`), 'wx', 0o600)
  const stderr = await fs.open(stderrPath, 'wx', 0o600)
  try {
    state.child = spawn(filename, [], { cwd, env, stdio: ['ignore', stdout.fd, stderr.fd] })
    state.exit = once(state.child, 'close')
    // Capture failure in the bounded poll below rather than as an unhandled rejection.
    void state.exit.then(
      (closed) => {
        state.closed = closed
      },
      (error) => {
        state.spawnError = error
      },
    )
  } finally {
    await stdout.close()
    await stderr.close()
  }
  await observeStartup(state)
  return await observeRenderer(state)
}

async function confirmNormalMainExit(state) {
  if (state.mainExited) return
  if (state.exit) {
    assert.deepEqual(
      await bounded(state.exit, 20_000, `AppImage ${state.version} did not close normally.`),
      [0, null],
    )
  }
  if (!state.exit || installNext || kdeSave) {
    const quit = await nativeEvent('app-quit', state.version, 20_000)
    const exit = await nativeEvent('process-exit', state.version, 20_000)
    for (const event of [quit, exit]) {
      assert.equal(event.code, 0)
      assert.equal(event.pid, state.pid)
      assert.equal(event.start, state.start)
    }
    state.normalCode = exit.code
  }
  await until(
    async () => {
      try {
        return (await proc(state.pid)).start !== state.start
      } catch (error) {
        if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
        return true
      }
    },
    `Native Main ${state.version} did not physically exit.`,
    10_000,
  )
  state.mainExited = true
}
async function confirmNormalExit(state) {
  await confirmNormalMainExit(state)
  state.scopeExit = await confirmQualificationProcessExit(state.checks, { execute })
  assert.equal(state.scopeExit.confirmed, true)
  await state.browser?.close()
}
async function closeNormally(state) {
  if (!state.closed && state.page && !state.page.isClosed()) {
    try {
      await state.page.evaluate(() => window.close())
    } catch (error) {
      if (!state.page.isClosed() && !/Target.*closed|context was destroyed/i.test(error.message))
        throw error
    }
  }
  await confirmNormalExit(state)
}

const title = installedProject?.baseline.project.title ?? 'Fresh path recovery qualification'
const projectTab = (page) => page.getByRole('tab', { name: title, exact: true })
async function call(page, area, method, ...args) {
  const response = await page.evaluate(
    async ({ area, method, args }) => await globalThis.api[area][method](...args),
    { area, args, method },
  )
  assert.equal(response.ok, true, JSON.stringify(response))
  return response.value
}
async function readInstalledReady(page) {
  const status = await call(page, 'runtime', 'getStatus')
  assert.equal(status.kind, 'ready')
  assert.equal(status.profile, 'linux-nvidia')
  assert.equal(status.runtimeId, installedRuntime.runtimeId)
  assert.equal(status.outpaintInfill, 'ready')
  return status
}

async function retainInstalledPreview(name, current, before, prompt) {
  const after = await inspectInstalledProject(current)
  const document = before.project
  assert.notEqual(after.project.documentRevision, document.documentRevision)
  assert.deepEqual(after.project, {
    ...document,
    documentRevision: after.project.documentRevision,
    generationDraft: {
      ...document.generationDraft,
      positivePrompt: { ...document.generationDraft.positivePrompt, text: prompt },
    },
  })
  assert.deepEqual(after.rasterAndPreview, before.rasterAndPreview)
  const destination = path.join(run, name)
  const witness = await fileWitness(current)
  await fs.copyFile(current, destination, constants.COPYFILE_EXCL)
  assert.equal(await hash(destination), witness.sha256)
  assert.deepEqual(await fileWitness(current), witness)
  return { ...after, witness, destination }
}

async function retainClosedDatabase(name) {
  const source = path.join(data, 'imagegen-studio/database/app.sqlite')
  for (const suffix of ['-wal', '-shm']) {
    await assert.rejects(fs.lstat(source + suffix), { code: 'ENOENT' })
  }
  const witness = await fileWitness(source)
  const destination = path.join(run, name)
  await fs.copyFile(source, destination, constants.COPYFILE_EXCL)
  assert.equal(await hash(destination), witness.sha256)
  assert.deepEqual(await fileWitness(source), witness)
  return { source, destination, witness }
}

async function editPositivePrompt(page, projectId, text) {
  const positive = page.getByRole('textbox', { name: 'Positive prompt', exact: true })
  await positive.fill(text)
  await positive.blur()
  await expect
    .poll(async () => {
      const { tab } = await call(page, 'projects', 'open', projectId)
      return tab.dirty && tab.generationDraft.positivePrompt.text === text
    })
    .toBe(true)
}
async function openUpdates(page) {
  await page.getByRole('button', { name: 'Help menu', exact: true }).click()
  await page.getByText('Check for Updates…', { exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Application Updates', exact: true })
  await expect(modal.getByText('Update available', { exact: true })).toBeVisible()
  await modal.getByRole('button', { name: 'Download', exact: true }).click()
  return modal
}
const writeFlag = async (name, value) =>
  await fs.writeFile(path.join(root, name), JSON.stringify(value) + '\n', {
    flag: 'wx',
    mode: 0o600,
  })
const stageFor = (filename) =>
  path.join(
    path.dirname(filename),
    `.igs-app-update-${createHash('sha256').update(path.basename(filename)).digest('hex').slice(0, 16)}`,
  )
async function installFromRecoveredPath(recovered, modal, project, trainedBefore) {
  const prior = await proc(recovered.pid)
  assert.equal(prior.start, recovered.start)
  await removePortFile()
  const requestCount = requests.length
  offered = null
  await modal.getByRole('button', { name: 'Install and restart', exact: true }).click()
  const handoff = await nativeEvent('relaunch', '0.2.0', 90_000)
  assert.equal(handoff.pid, recovered.pid)
  assert.equal(handoff.result, true)
  assert.equal(handoff.databaseCloseCount, 1)
  assert.deepEqual(handoff.args, [{ args: ['--appimage-extract-and-run'], execPath: newPath }])
  const saveChoice = await nativeEvent('selected-project-save', '0.2.0')
  assert.equal(saveChoice.pid, recovered.pid)
  assert.deepEqual(saveChoice.options.buttons, ['Save', 'Discard Changes', 'Cancel'])
  assert.match(saveChoice.options.detail, /1 Project has unsaved changes\./)

  const held = await nativeEvent('handoff-close-held', '0.2.0')
  assert.equal(held.group, prior.group)
  assert.equal(held.pid, prior.pid)
  assert.equal(held.start, prior.start)
  const refreshed = await bindNative(recovered, !installedRuntime && !kdeInstallNext)
  const heldScope = refreshed.groups.find((entry) => entry.group === prior.group)
  assert.ok(heldScope)
  const scopeIdentityBefore = await readScopeIdentity(prior.group)
  if (installedRuntime) {
    await assertInheritedScope(prior)
    assert.equal(heldScope.ownedScope, false)
    assert.deepEqual(scopeIdentityBefore, installedRuntime.scopeIdentity)
  } else if (kdeInstallNext) {
    assert.equal(prior.group, kdeUpdateScope)
    assert.equal(heldScope.ownedScope, false)
  } else {
    assert.ok(heldScope.ownedScope && heldScope.scopeProof)
    assert.deepEqual(scopeIdentityBefore, heldScope.scopeProof.scopeIdentity)
  }
  const helpers = []
  const members = (await fs.readFile(`/sys/fs/cgroup${prior.group}/cgroup.procs`, 'utf8'))
    .trim()
    .split('\n')
    .map(Number)
  for (const pid of members) {
    assert.ok(Number.isSafeInteger(pid) && pid > 1)
    try {
      const observed = await proc(pid)
      if (observed.group !== prior.group) continue
      const args = (await fs.readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0')
      if (args.includes('--type=relauncher') && (await proc(pid)).start === observed.start) {
        helpers.push(observed)
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  // The original relaunch's return, the successor identity and signed image
  // are mandatory. A transient helper's argv may already have disappeared.
  recordAggregate(recovered)
  await writeFlag('release-b-close', prior)

  const heldC = await nativeEvent('successor-ready-held', '0.3.0', 60_000)
  assert.notEqual(heldC.pid, recovered.pid)
  const successor = {
    checks: [],
    filename: newPath,
    pid: heldC.pid,
    start: heldC.start,
    version: '0.3.0',
  }
  lifetimes.push(successor)
  const startup = await nativeEvent('startup', successor.version)
  assert.equal(startup.pid, heldC.pid)
  assert.equal(startup.start, heldC.start)
  assert.equal(startup.appImage, newPath)
  assert.equal(startup.userData, profile)
  if (installedRuntime) {
    assert.equal(startup.appData, installedRuntime.appData)
    await assertInheritedScope(heldC)
  }
  const successorOwnScope = `app-imagegen\\x2dstudio-${successor.pid}.scope`
  const scopeAllowed = (group) =>
    group === prior.group ||
    (!installedRuntime && !kdeInstallNext && path.basename(group) === successorOwnScope)
  assert.ok(scopeAllowed(heldC.group))
  // Chromium may promote an AppImage started manually but leave an actual
  // relaunch in the parent's already capped scope. Let either settle while
  // the native whenReady promise still holds the production continuation.
  const settlementDeadline = Date.now() + 5_000
  const successorIdentity = await until(
    async () => {
      const observed = await proc(successor.pid)
      assert.equal(observed.start, successor.start)
      assert.ok(scopeAllowed(observed.group))
      if (
        !installedRuntime &&
        !kdeInstallNext &&
        observed.group === prior.group &&
        Date.now() < settlementDeadline
      )
        return null
      return observed
    },
    'Successor did not settle in an owned or inherited qualification scope.',
    10_000,
  )
  await confirmNormalMainExit(recovered)
  const admitted = await bindNative(successor)
  const admittedGroup = admitted.groups.find((entry) => entry.group === successorIdentity.group)
  assert.ok(admittedGroup)
  assert.ok(BigInt(admittedGroup.memoryMax) <= installedMemoryLimit)
  assert.equal(admittedGroup.swapMax, '0')
  const scopeIdentity = await readScopeIdentity(successorIdentity.group)
  if (successorIdentity.group === prior.group) assert.deepEqual(scopeIdentity, scopeIdentityBefore)
  else assert.ok(admittedGroup.ownedScope)
  const beforeDatabase = trainedBefore
    ? await retainClosedDatabase('trained-after-b-close.sqlite')
    : kdeInstallNext
      ? await retainClosedDatabase('recovered-closed.sqlite')
      : null
  await writeFlag('admit-c-startup', { ...successorIdentity, scopeIdentity })
  const released = await nativeEvent('successor-ready-released', successor.version)
  assert.deepEqual(released.scopeIdentity, scopeIdentity)
  await observeRenderer(successor)
  assert.ok(scopeAllowed((await proc(successor.pid)).group))
  assert.equal(requests.length, requestCount)
  const state = await call(successor.page, 'applicationUpdates', 'getRecoveryStatus')
  assert.deepEqual(state, { status: 'required', target: 'verified', runtime: 'unverified' })
  assert.equal(
    (await call(successor.page, 'applicationUpdates', 'getStatus')).currentVersion,
    '0.3.0',
  )

  const changed = await fileWitness(newPath)
  assert.equal(changed.sha256, c.sha256)
  assert.equal(changed.sizeBytes, c.sizeBytes)
  assert.equal(changed.mode, 0o755)
  const stage = stageFor(newPath)
  assert.deepEqual((await fs.readdir(stage)).sort(), [
    'journal.json',
    'previous.AppImage',
    'release-envelope.json',
    'release-notes.json',
  ])
  const backup = await fileWitness(path.join(stage, 'previous.AppImage'))
  assert.equal(backup.sha256, b.sha256)
  assert.equal(backup.mode, 0o600)
  assert.notEqual(backup.ino, changed.ino)
  assert.equal(
    (await readJson(path.relative(run, path.join(stage, 'journal.json')))).state,
    'relaunching',
  )
  assert.equal(
    await fs.readFile(path.join(stage, 'release-envelope.json'), 'utf8'),
    c.authority.envelope,
  )
  assert.equal(
    await fs.readFile(path.join(stage, 'release-notes.json'), 'utf8'),
    c.authority.releaseNotesJson,
  )

  const savedSha = await hash(project.filename)
  assert.notEqual(savedSha, project.before)
  if (kdeInstallNext) {
    const originalPackage = await readIgsPackage(path.join(run, 'original-closed.igs'))
    const updatedPackage = await readIgsPackage(project.filename)
    const previousProject = originalPackage.project
    assert.notEqual(updatedPackage.project.documentRevision, previousProject.documentRevision)
    assert.deepEqual(updatedPackage.project, {
      ...previousProject,
      documentRevision: updatedPackage.project.documentRevision,
      generationDraft: {
        ...previousProject.generationDraft,
        positivePrompt: { ...previousProject.generationDraft.positivePrompt, text: project.prompt },
      },
    })
    const attachments = ({ manifest }) =>
      manifest.members.filter(({ path }) => path !== 'project.json')
    assert.deepEqual(attachments(updatedPackage), attachments(originalPackage))
    const snapshot = path.join(run, 'recovered-closed.igs')
    await fs.copyFile(project.filename, snapshot, constants.COPYFILE_EXCL)
    assert.equal(await hash(snapshot), savedSha)
  }
  const list = await call(successor.page, 'projects', 'list')
  assert.deepEqual(
    list.map(({ id }) => id).sort(),
    [project.id, ...(trainedBefore ? [trainedBefore.requested.project.id] : [])].sort(),
  )
  await successor.page.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  await expect(projectTab(successor.page)).toBeVisible()
  const opened = await call(successor.page, 'projects', 'open', project.id)
  assert.equal(opened.tab.dirty, false)
  assert.equal(opened.tab.generationDraft.positivePrompt.text, project.prompt)
  await successor.page.screenshot({ path: path.join(run, 'successor-reopened-project.png') })
  let cpuSave
  if (installedRuntime) {
    const status = await readInstalledReady(successor.page)
    const fromB = await retainInstalledPreview(
      'installed-after-b-close.igs',
      project.filename,
      installedProject.baseline,
      project.prompt,
    )
    assert.equal(opened.tab.documentRevision, fromB.project.documentRevision)
    const successorPrompt = 'Owned draft saved in C with the retained installed runtime'
    await editPositivePrompt(successor.page, project.id, successorPrompt)
    await successor.page.getByRole('button', { name: 'Save Project', exact: true }).click()
    await expect
      .poll(async () => (await call(successor.page, 'projects', 'open', project.id)).tab.dirty)
      .toBe(false)
    const fromC = await retainInstalledPreview(
      'installed-after-c-save.igs',
      project.filename,
      fromB,
      successorPrompt,
    )
    cpuSave = { successorRuntimeStatus: status, fromB, fromC }
  }
  let trainedEvidence
  if (trainedBefore) {
    const after = await signedTrained.runSignedTrainedAfter({
      state: successor,
      trained,
      root: run,
      before: trainedBefore,
      bindWorker: bindTrainedWorker,
      otherProjectTitle: title,
    })
    trainedEvidence = {
      before: trainedBefore,
      beforeDatabase,
      after,
      memoryAfter: await readTrainedMemory(successor),
    }
  }
  await closeNormally(successor)
  await confirmNormalExit(recovered)
  assert.equal(await hash(project.filename), cpuSave?.fromC.witness.sha256 ?? savedSha)
  let kdeProof
  if (kdeInstallNext) {
    const afterDatabase = await retainClosedDatabase('successor-closed.sqlite')
    const snapshot = path.join(run, 'successor-closed.igs')
    await fs.copyFile(project.filename, snapshot, constants.COPYFILE_EXCL)
    assert.equal(await hash(snapshot), savedSha)
    kdeProof = { beforeDatabase, afterDatabase }
  }
  return {
    backup,
    current: changed,
    handoff,
    observedHelpers: helpers,
    projectSha: savedSha,
    stage,
    startup: state,
    startupScope: { ...successorIdentity, scopeIdentity },
    ...(cpuSave ? { cpuSave } : {}),
    ...(trainedEvidence ? { signedTrained: trainedEvidence } : {}),
    ...(kdeProof ? { kdeProof } : {}),
  }
}
const report = {
  installNext,
  outcome: 'FAIL',
  retainedBefore: retained,
  requests,
  ...(kdeSave ? { kdeSave: { portal: [], useDefaultName: kdeSaveDefault } } : {}),
  ...(installedRuntime ? { installedRuntime } : {}),
}
try {
  const old = await launch(original, '0.1.0')
  const first = old.page
  assert.equal(requests.length, 0)
  const recovery = await call(first, 'applicationUpdates', 'getRecoveryStatus')
  assert.equal(recovery.status, 'required')
  assert.notEqual(retained.image.ino, packaged[0].ino)
  assert.equal(retained.image.sha256, a.sha256)
  const home = first.getByRole('region', { name: 'Home', exact: true })
  if (installedProject) {
    await home.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  } else {
    await home
      .getByRole('complementary', { name: 'Workspace navigation', exact: true })
      .getByRole('button', { name: 'New Project', exact: true })
      .click()
    const creation = first.getByRole('dialog', { name: 'New Project', exact: true })
    await creation.locator('input[aria-label="Project name"]').fill(title)
    await creation.getByRole('button', { name: 'Create Project', exact: true }).click()
  }
  await expect(projectTab(first)).toBeVisible()
  const summaries = await call(first, 'projects', 'list')
  assert.equal(summaries.length, 1)
  assert.equal(summaries[0].title, title)
  const projectId = summaries[0].id
  const packages = (await fs.readdir(workspace)).filter((name) => name.endsWith('.igs'))
  assert.equal(packages.length, 1)
  const project = path.join(workspace, packages[0])
  const projectSha = await hash(project)
  if (installedProject) {
    assert.equal(project, installedProject.filename)
    assert.equal(projectSha, installedRuntime.baselineWitness.sha256)
    assert.equal(summaries[0].previewStatus, 'rendered')
    assert.equal((await call(first, 'projects', 'open', projectId)).tab.dirty, false)
  }
  offered = b
  const updates = await openUpdates(first)
  const save = updates.getByRole('button', { name: 'Save recovery AppImage', exact: true })
  await expect(save).toBeEnabled({ timeout: 120_000 })
  const downloadedB = await call(first, 'applicationUpdates', 'getStatus')
  assert.equal(downloadedB.availableVersion, '0.2.0')
  assert.equal(downloadedB.verification, 'signed-release')
  const chooseRecovery = async (destination) => {
    if (!kdeSave) {
      await save.click()
      return
    }
    const choice = await driveKdeSaveChooser({
      state: old,
      destination,
      trigger: save,
      windowTitle: 'Save Recovery AppImage',
      acceptDefault: kdeSaveDefault && destination !== null,
      onPresented: async () => {
        await assert.rejects(fs.lstat(newPath), { code: 'ENOENT' })
      },
    })
    report.kdeSave.portal.push(choice)
  }
  await chooseRecovery(null)
  await expect
    .poll(async () => (await events()).filter((event) => event.name === 'recovery-response').length)
    .toBe(1)
  await expect(save).toBeEnabled()
  await fs.lstat(newPath).then(
    () => assert.fail('Cancel published an AppImage.'),
    (error) => assert.equal(error.code, 'ENOENT'),
  )
  if (kdeSave) assert.deepEqual(await retainedState(), retained)
  await chooseRecovery(newPath)
  if (kdeSaveDefault) {
    await expect
      .poll(
        async () => (await events()).filter((event) => event.name === 'recovery-response').length,
      )
      .toBe(2)
    const responses = (await events())
      .filter((event) => event.name === 'recovery-response')
      .map(({ result }) => result)
    report.kdeSave.defaultSelectionResult = responses[1]
    assert.deepEqual(responses[1], { ok: true, value: { status: 'saved' } })
  }
  await expect(updates.getByText('Recovery AppImage saved', { exact: true })).toBeVisible({
    timeout: 30_000,
  })
  const materialized = await fileWitness(newPath)
  assert.equal(materialized.mode, 0o755)
  assert.equal(materialized.sha256, b.sha256)
  assert.notEqual(materialized.ino, packaged[1].ino)
  assert.equal(materialized.sizeBytes, b.sizeBytes)
  assert.deepEqual(
    (await events())
      .filter((event) => event.name === 'recovery-response')
      .map((event) => event.result),
    [
      { ok: true, value: { status: 'canceled' } },
      { ok: true, value: { status: 'saved' } },
    ],
  )
  assert.equal((await events()).filter((event) => event.name === 'relaunch').length, 0)
  const retainedAfter = await retainedState()
  assert.deepEqual(retainedAfter, retained)
  if (kdeSave) report.kdeSave.retainedAfterSave = retainedAfter
  await first.screenshot({ path: path.join(run, 'save-recovery-success.png') })
  await updates.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(projectTab(first)).toBeVisible()
  assert.equal(await hash(project), projectSha)
  await closeNormally(old)
  if (kdeSave) {
    report.kdeSave.afterOriginal = await retainClosedDatabase('original-closed.sqlite')
    const snapshot = path.join(run, 'original-closed.igs')
    await fs.copyFile(project, snapshot, constants.COPYFILE_EXCL)
    assert.equal(await hash(snapshot), projectSha)
  }

  const requestCount = requests.length
  offered = null
  const recovered = await launch(newPath, '0.2.0')
  const second = recovered.page
  assert.equal(requests.length, requestCount)
  assert.deepEqual(await call(second, 'applicationUpdates', 'getRecoveryStatus'), {
    status: 'clear',
  })
  const reopened = await call(second, 'projects', 'list')
  assert.equal(reopened.length, 1)
  assert.equal(reopened[0].id, projectId)
  await second.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  await expect(projectTab(second)).toBeVisible()
  assert.equal((await call(second, 'projects', 'open', projectId)).tab.dirty, false)
  const recoveredRuntime = installedRuntime ? await readInstalledReady(second) : undefined
  let downloadedC
  let installed
  if (kdeSave) {
    assert.deepEqual(await fileWitness(newPath), materialized)
    assert.equal(await hash(project), projectSha)
    await second.screenshot({ path: path.join(run, 'reopened-recovery-project.png') })
  }
  if (kdeSave && !installNext) {
    await closeNormally(recovered)
    assert.deepEqual(await fileWitness(newPath), materialized)
    assert.equal(await hash(project), projectSha)
    report.kdeSave.afterRecovered = await retainClosedDatabase('recovered-closed.sqlite')
    const snapshot = path.join(run, 'recovered-closed.igs')
    await fs.copyFile(project, snapshot, constants.COPYFILE_EXCL)
    assert.equal(await hash(snapshot), projectSha)
  } else {
    const prompt = 'Owned draft saved during the B to C application close'
    let trainedBefore
    if (trained) {
      trainedBefore = await signedTrained.runSignedTrainedBefore({
        state: recovered,
        trained,
        root: run,
        bindWorker: bindTrainedWorker,
      })
      trainedBefore.memoryAfter = await readTrainedMemory(recovered)
      await expect(
        projectTab(second).getByRole('button', { name: `Close ${title}`, exact: true }),
      ).toBeEnabled({ timeout: 60_000 })
      await projectTab(second).click()
    }
    if (installNext) await editPositivePrompt(second, projectId, prompt)
    offered = c
    const next = await openUpdates(second)
    const review = next.getByRole('button', { name: 'Review installation', exact: true })
    await expect(review).toBeEnabled({ timeout: 120_000 })
    downloadedC = await call(second, 'applicationUpdates', 'getStatus')
    assert.equal(downloadedC.availableVersion, '0.3.0')
    assert.equal(downloadedC.verification, 'signed-release')
    await review.click()
    await expect(
      next.getByRole('button', { name: 'Install and restart', exact: true }),
    ).toBeEnabled({
      timeout: trained ? 90_000 : 5_000,
    })
    await second.screenshot({ path: path.join(run, 'next-signed-release-review.png') })
    if (installNext) {
      installed = await installFromRecoveredPath(
        recovered,
        next,
        { before: projectSha, filename: project, id: projectId, prompt },
        trainedBefore,
      )
      assert.notEqual(installed.current.ino, materialized.ino)
      assert.deepEqual(await fileWitness(newPath), installed.current)
    } else {
      await next.getByRole('button', { name: 'Install later', exact: true }).click()
      await expect(projectTab(second)).toBeVisible()
      await closeNormally(recovered)
      assert.deepEqual(await fileWitness(newPath), materialized)
      assert.equal(await hash(project), projectSha)
    }
  }

  assert.deepEqual(await retainedState(), retained)
  if (kdeSave) {
    report.kdeSave.retainedAfterReopen = await retainedState()
    assert.deepEqual(report.kdeSave.retainedAfterReopen, retained)
  }
  assert.equal(
    (await events()).filter((event) => event.name === 'relaunch').length,
    installNext ? 1 : 0,
  )
  for (let index = 0; index < packaged.length; index++) {
    assert.deepEqual(await fileWitness(releases[index].filename), packaged[index])
  }
  for (const release of releases.slice(1)) {
    assert.ok(
      requests.some(
        (entry) => entry.route === '/' + path.basename(release.filename) && entry.status === 200,
      ),
    )
  }
  let database
  if (installedRuntime) {
    assert.deepEqual(
      await fileWitness(installedRuntime.baselineProject.path),
      installedRuntime.baselineWitness,
    )
    database = await retainClosedDatabase('installed-after-c-close.sqlite')
    await assertInheritedScope(await proc(process.pid))
  }
  Object.assign(report, {
    downloadedB,
    downloadedC,
    installed,
    materialized,
    outcome: 'PASS',
    projectId,
    projectSha,
    recovery,
    ...(installedRuntime ? { installedRuntimeEvidence: { recoveredRuntime, database } } : {}),
  })
} catch (error) {
  report.error = error.stack
  if (installNext) await writeFlag('abort-install', { failed: true })
  throw error
} finally {
  for (const socket of sockets) socket.destroy()
  await new Promise((resolve) => server.close(resolve))
  for (const state of lifetimes) {
    if (state.scopeExit?.confirmed) continue
    try {
      await closeNormally(state)
    } catch (error) {
      state.closeFailure = error.message
      // Escalation and artifact disposal require an independent owned-scope audit.
      // The wrapper deadline and installed owned-scope timer remain armed.
    }
  }
  report.lifetimes = lifetimes.map(
    ({
      aggregateMemoryLimit,
      checks,
      closeFailure,
      filename,
      normalCode,
      pid,
      scopeExit,
      version,
    }) => ({
      aggregateMemoryLimit,
      checks,
      closeFailure,
      filename,
      normalCode,
      pid,
      scopeExit,
      version,
    }),
  )
  await fs.writeFile(path.join(run, 'native-report.json'), JSON.stringify(report, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  })
}
