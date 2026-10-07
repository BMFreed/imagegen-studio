/**
 * Opt-in, worker-only developer qualification update. Reuses the canonical installed runtime; it is
 * not the release installer/repair mechanism. Run inside an inherited systemd service with
 * MemoryMax<=12G, MemorySwapMax=0 and 0<RuntimeMaxSec<=1800. No models or environment are copied.
 */
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { tsImport } from 'tsx/esm/api'

import { boundQualificationProcess } from './qualification-resource-limits.mjs'

const execute = promisify(execFile)
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactRoot = path.join(os.homedir(), '.codex', 'artifacts', 'imagegen-studio')
const maximumBackupBytes = 32 * 1024 ** 2
const metadataEnvironment = { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', PATH: '/usr/bin:/bin' }
const help = `Usage: node scripts/upgrade-qualification-worker.mjs
  --app-data ABSOLUTE_EXISTING_OWNED_APP_DATA --uv ABSOLUTE_EXECUTABLE
  --report ABSOLUTE_NEW_EXTERNAL_JSON_FILE
Or: --options-file ABSOLUTE_OWNED_JSON_FILE (same three named fields).
Use the options-file form under a waiting launcher to keep runtime paths out of
the supervisor argv inspected by the physical-use guard.

Upgrades only a verified non-editable qualification worker0.12 to repository worker0.14.
Requires canonical agent-owned artifact paths, the original provision manifest, identical
pyproject/uv.lock and installed dependencies, no live runtime users, and finite inherited
systemd RAM/swap/deadline limits. Backs up only worker source, dist-info and its launcher.
Publishes a new provision-compatible report and qualification-runtime.json after actual
worker startup and physical exit. Failed updates restore bytes and prove old-worker startup;
unconfirmed exit retains the rollback payload and upgrade lock for manual recovery.
Developer qualification tooling only; does not change release Install/Repair or model files.
`

export function argumentsFor(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--help' && argv.length === 1) return null
    const key = argument.slice(2)
    if (!argument.startsWith('--') || !['app-data', 'uv', 'report'].includes(key) || options[key]) {
      throw new Error(`Unknown or repeated argument: ${argument}`)
    }
    const value = argv[++index]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`)
    options[key] = value
  }
  for (const key of ['app-data', 'uv', 'report']) {
    if (!options[key]) throw new Error(`Required argument: --${key}`)
    if (!path.isAbsolute(options[key]) || path.normalize(options[key]) !== options[key]) {
      throw new Error(`--${key} must be an absolute normalized path.`)
    }
  }
  return options
}

export async function readUpgradeOptionsFile(target, root = artifactRoot) {
  if (!path.isAbsolute(target) || path.normalize(target) !== target || !within(root, target)) {
    throw new Error(
      'Upgrade options file must be an absolute normalized path inside the owned artifact root.',
    )
  }
  await regularFile(target, 4096)
  const values = JSON.parse(await fs.readFile(target, 'utf8'))
  if (
    !values ||
    typeof values !== 'object' ||
    Array.isArray(values) ||
    Object.values(values).some((value) => typeof value !== 'string')
  ) {
    throw new Error('Upgrade options file must contain only string-valued named arguments.')
  }
  return argumentsFor(Object.entries(values).flatMap(([key, value]) => [`--${key}`, value]))
}

function within(root, target) {
  const relative = path.relative(root, target)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

async function canonicalDirectory(target) {
  const entry = await fs.lstat(target)
  if (!entry.isDirectory() || entry.isSymbolicLink() || (await fs.realpath(target)) !== target) {
    throw new Error(`Expected a canonical directory: ${target}`)
  }
}

async function regularFile(target, maximumBytes = Infinity) {
  const entry = await fs.lstat(target)
  if (
    !entry.isFile() ||
    entry.isSymbolicLink() ||
    (await fs.realpath(target)) !== target ||
    entry.size > maximumBytes
  ) {
    throw new Error(`Expected a bounded canonical regular file: ${target}`)
  }
  return entry
}

async function absent(target) {
  try {
    await fs.lstat(target)
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  throw new Error(`Refusing existing path: ${target}`)
}

async function sha256(target) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(target)) hash.update(bytes)
  return hash.digest('hex')
}

export async function treeManifest(root, { bytecode = false, modes = false, python = false } = {}) {
  const files = {}
  await canonicalDirectory(root)
  async function visit(directory) {
    for (const name of (await fs.readdir(directory)).sort()) {
      if (!bytecode && (name === '__pycache__' || name.endsWith('.pyc'))) continue
      const target = path.join(directory, name)
      const relative = path.relative(root, target).split(path.sep).join('/')
      const entry = await fs.lstat(target)
      if (entry.isSymbolicLink()) {
        const link = await fs.readlink(target)
        if (!python || path.isAbsolute(link) || !within(root, await fs.realpath(target))) {
          throw new Error(`Unsafe payload symlink: ${target}`)
        }
        files[relative] = { symlink: link }
      } else if (entry.isDirectory()) {
        await visit(target)
      } else if (entry.isFile()) {
        files[relative] = { bytes: entry.size, sha256: await sha256(target) }
        if (modes) files[relative].mode = entry.mode & 0o777
      } else {
        throw new Error(`Unsafe payload entry: ${target}`)
      }
    }
  }
  await visit(root)
  return files
}

function equal(actual, expected, description) {
  try {
    assert.deepEqual(actual, expected)
  } catch {
    throw new Error(`${description} does not match its verified manifest.`)
  }
}

export function systemdDeadlineSeconds(value) {
  const match = /^(\d+(?:\.\d+)?)(us|ms|s|min|h|d)?$/.exec(value.trim())
  if (!match) throw new Error('Qualification requires a finite inherited systemd deadline.')
  const seconds =
    Number(match[1]) *
    { us: 0.000001, ms: 0.001, s: 1, min: 60, h: 3600, d: 86400 }[match[2] ?? 's']
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 1800) {
    throw new Error('Qualification requires 0 < inherited RuntimeMaxSec <= 1800.')
  }
  return seconds
}

export async function assertUpgradeBounds({
  read = fs.readFile,
  exec = execute,
  pid = process.pid,
} = {}) {
  const group = (await read(`/proc/${pid}/cgroup`, 'utf8'))
    .trim()
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  if (!group || !path.isAbsolute(group) || path.normalize(group) !== group || group === '/') {
    throw new Error('Qualification requires a canonical inherited cgroup v2.')
  }
  const memoryMax = (await read(`/sys/fs/cgroup${group}/memory.max`, 'utf8')).trim()
  const swapMax = (await read(`/sys/fs/cgroup${group}/memory.swap.max`, 'utf8')).trim()
  if (!/^\d+$/.test(memoryMax) || BigInt(memoryMax) > BigInt(12 * 1024 ** 3) || swapMax !== '0') {
    throw new Error('Qualification requires inherited MemoryMax<=12G and MemorySwapMax=0.')
  }
  const unit = path.basename(group)
  if (!/\.(service|scope)$/.test(unit))
    throw new Error('Qualification requires an inherited systemd unit.')
  const shown = await exec(
    'systemctl',
    ['--user', 'show', unit, '--property=ControlGroup', '--property=RuntimeMaxUSec'],
    { timeout: 10_000, maxBuffer: 32 * 1024 },
  )
  const properties = Object.fromEntries(
    shown.stdout
      .trim()
      .split('\n')
      .map((line) => {
        const split = line.indexOf('=')
        return [line.slice(0, split), line.slice(split + 1)]
      }),
  )
  if (properties.ControlGroup !== group)
    throw new Error('Inherited systemd ControlGroup does not match the actual process.')
  return {
    group,
    unit,
    memoryMax,
    swapMax,
    runtimeMaxSeconds: systemdDeadlineSeconds(properties.RuntimeMaxUSec ?? ''),
  }
}

/** Refuses existing users; never signals processes belonging to another run. */
export async function assertRuntimeIdle(
  appData,
  ownedPython,
  { entries = fs.readdir, read = fs.readFile, link = fs.readlink, stat = fs.stat } = {},
) {
  const active = []
  const protectedDesktopServices = new Set([
    '/usr/lib/systemd/systemd',
    '(sd-pam)',
    '/usr/bin/ssh-agent',
    '/usr/bin/kwin_wayland',
    '/usr/lib/x86_64-linux-gnu/libexec/polkit-kde-authentication-agent-1',
    '/usr/lib/x86_64-linux-gnu/libexec/org_kde_powerdevil',
  ])
  for (const name of await entries('/proc')) {
    if (!/^\d+$/.test(name) || Number(name) === process.pid) continue
    try {
      if ((await stat(`/proc/${name}`)).uid !== process.getuid()) continue
      const command = (await read(`/proc/${name}/cmdline`, 'utf8')).split('\0')
      const usesAppData = (value) =>
        value === appData ||
        value.includes(`${appData}${path.sep}`) ||
        value.endsWith(`=${appData}`)
      if (command.some(usesAppData)) {
        active.push(Number(name))
        continue
      }
      let executable, cwd, environment
      try {
        executable = await link(`/proc/${name}/exe`)
        cwd = await link(`/proc/${name}/cwd`)
        environment = (await read(`/proc/${name}/environ`, 'utf8')).split('\0')
      } catch (error) {
        // KDE's non-dumpable OS services have readable argv but protected proc links.
        // Only these unrelated service identities are exempt; an unknown process,
        // an owned executable or any declared app-data consumer remains a refusal.
        if (error.code === 'EACCES' && protectedDesktopServices.has(command[0])) continue
        throw error
      }
      if (
        within(ownedPython, executable) ||
        cwd === appData ||
        within(appData, cwd) ||
        environment.some(usesAppData)
      ) {
        active.push(Number(name))
      }
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
    }
  }
  if (active.length)
    throw new Error(
      `Qualification runtime is still physically in use by PIDs: ${active.join(', ')}.`,
    )
  return { checkedAt: new Date().toISOString(), noLiveRuntimeUsers: true }
}

const inspectionSource = `import hashlib, importlib.metadata, json, pathlib, platform, sys
d = importlib.metadata.distribution('imagegen-worker')
root = pathlib.Path(d.locate_file('imagegen_worker')).resolve()
dist = pathlib.Path(d._path).resolve()
direct = json.loads(d.read_text('direct_url.json') or '{}')
records = [str(p) for p in d.files or []]
print(json.dumps({'pythonVersion': platform.python_version(), 'prefix': sys.prefix,
 'basePrefix': sys.base_prefix, 'workerRoot': str(root), 'distInfoRoot': str(dist),
 'editable': direct.get('dir_info', {}).get('editable', False), 'recordPaths': records,
 'packages': {v.metadata['Name']: v.version for v in importlib.metadata.distributions()},
 'workerFiles': {str(p.relative_to(root)): {'bytes': p.stat().st_size,
 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(root.rglob('*'))
 if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc'}}))`

async function inspect(context) {
  return JSON.parse(
    (
      await execute(context.pythonExecutable, ['-I', '-c', inspectionSource], {
        cwd: context.runtimeDir,
        env: context.environment,
        timeout: 30_000,
        maxBuffer: 4 * 1024 ** 2,
      })
    ).stdout,
  )
}

async function runCommand(executable, argv, cwd, env, logPath, signal) {
  if (signal.aborted) throw new Error('Worker upgrade interrupted before command startup.')
  const log = createWriteStream(logPath, { flags: 'a', mode: 0o600 })
  const child = spawn(executable, argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(log, { end: false })
  child.stderr.pipe(log, { end: false })
  let killTimer
  const abort = () => {
    child.kill('SIGTERM')
    killTimer = setTimeout(() => child.kill('SIGKILL'), 5_000)
  }
  const deadline = setTimeout(abort, 120_000)
  signal.addEventListener('abort', abort, { once: true })
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, exitSignal) => {
        if (code === 0 && !signal.aborted) resolve()
        else
          reject(
            new Error(
              `Worker upgrade command failed (${code ?? exitSignal}): ${path.basename(executable)}; see ${logPath}`,
            ),
          )
      })
      log.once('error', (error) => {
        abort()
        child.once('close', () => reject(error))
      })
    })
  } finally {
    signal.removeEventListener('abort', abort)
    clearTimeout(deadline)
    clearTimeout(killTimer)
    await new Promise((resolve) => log.end(resolve))
  }
}

async function qualify(context) {
  const module = await tsImport('../src/main/projects/generation-worker-client.ts', import.meta.url)
  let worker
  try {
    worker = await module.GenerationWorkerClient.start(
      {
        pythonExecutable: context.pythonExecutable,
        runtimeRoot: context.runtimeDir,
        scratchBasePath: context.downloadsDir,
      },
      { environment: context.environment, startupTimeoutMs: 120_000, shutdownWaitMs: 5_000 },
    )
    const ready = structuredClone(worker.ready)
    const limits = await boundQualificationProcess(process.pid)
    const inherited = await assertUpgradeBounds()
    if (limits.groups.some(({ group }) => group !== inherited.group)) {
      throw new Error('Qualification worker escaped its inherited finite systemd deadline.')
    }
    await worker.close()
    worker = undefined
    const idle = await assertRuntimeIdle(context.appData, context.ownedPython)
    return { ready, confirmedWorkerExit: true, limits, idle }
  } catch (error) {
    let closed = false
    try {
      if (worker) {
        await worker.close()
        closed = true
      } else closed = await module.GenerationWorkerClient.retryUnconfirmedStartExit()
      if (closed) await assertRuntimeIdle(context.appData, context.ownedPython)
    } catch {
      closed = false
    }
    error.confirmedWorkerExit = closed
    throw error
  }
}

function validateInstallation(installed, context) {
  if (
    installed.pythonVersion !== '3.12.13' ||
    installed.prefix !== context.environmentRoot ||
    installed.basePrefix !== context.ownedPython ||
    installed.editable !== false ||
    installed.workerRoot !==
      path.join(context.environmentRoot, 'lib', 'python3.12', 'site-packages', 'imagegen_worker') ||
    path.dirname(installed.distInfoRoot ?? '') !== path.dirname(installed.workerRoot) ||
    !/^imagegen_worker-[\w.]+\.dist-info$/.test(path.basename(installed.distInfoRoot ?? ''))
  ) {
    throw new Error('Expected the provisioned non-editable app-owned CPython worker installation.')
  }
  if (!Array.isArray(installed.recordPaths) || installed.recordPaths.length === 0)
    throw new Error('Installed worker has no wheel RECORD.')
  const sitePackages = path.dirname(installed.workerRoot)
  for (const relative of installed.recordPaths) {
    if (typeof relative !== 'string' || path.isAbsolute(relative))
      throw new Error('Unsafe worker wheel RECORD path.')
    const target = path.resolve(sitePackages, relative)
    if (!(
      within(installed.workerRoot, target) ||
      within(installed.distInfoRoot, target) ||
      target === path.join(context.environmentRoot, 'bin', 'imagegen-worker')
    )) {
      throw new Error(`Worker wheel RECORD escapes its bounded package payload: ${relative}`)
    }
  }
}

async function atomicWrite(target, bytes, { create = false, mode = 0o600 } = {}) {
  const temporary = path.join(path.dirname(target), `.worker-upgrade-${randomUUID()}.tmp`)
  const file = await fs.open(temporary, 'wx', mode)
  try {
    await file.writeFile(bytes)
    await file.sync()
  } finally {
    await file.close()
  }
  try {
    if (create) await fs.link(temporary, target)
    else await fs.rename(temporary, target)
  } finally {
    await fs.rm(temporary, { force: true })
  }
  const directory = await fs.open(path.dirname(target), 'r')
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
}

async function saveBackup(context, backup) {
  const source = context.installed.workerRoot
  const distInfo = context.installed.distInfoRoot
  const launcher = path.join(context.environmentRoot, 'bin', 'imagegen-worker')
  const sourceFiles = await treeManifest(source, { bytecode: true, modes: true })
  const distributionFiles = await treeManifest(distInfo, { bytecode: true, modes: true })
  const launcherStat = await regularFile(launcher, maximumBackupBytes)
  const launcherFile = {
    bytes: launcherStat.size,
    sha256: await sha256(launcher),
    mode: launcherStat.mode & 0o777,
  }
  const bytes = [
    ...Object.values(sourceFiles),
    ...Object.values(distributionFiles),
    launcherFile,
  ].reduce((sum, item) => sum + item.bytes, 0)
  if (!Number.isSafeInteger(bytes) || bytes > maximumBackupBytes)
    throw new Error('Worker rollback payload exceeds its 32 MiB bound.')
  await fs.cp(source, path.join(backup, 'worker'), {
    recursive: true,
    preserveTimestamps: true,
    errorOnExist: true,
    force: false,
  })
  await fs.cp(distInfo, path.join(backup, 'dist-info'), {
    recursive: true,
    preserveTimestamps: true,
    errorOnExist: true,
    force: false,
  })
  await fs.copyFile(launcher, path.join(backup, 'launcher'), fs.constants.COPYFILE_EXCL)
  await fs.chmod(path.join(backup, 'launcher'), launcherFile.mode)
  equal(
    await treeManifest(path.join(backup, 'worker'), { bytecode: true, modes: true }),
    sourceFiles,
    'Worker rollback snapshot',
  )
  equal(
    await treeManifest(path.join(backup, 'dist-info'), { bytecode: true, modes: true }),
    distributionFiles,
    'Distribution rollback snapshot',
  )
  equal(
    await sha256(path.join(backup, 'launcher')),
    launcherFile.sha256,
    'Launcher rollback snapshot',
  )
  await fs.writeFile(path.join(backup, 'qualification-runtime.json'), context.metadataBytes, {
    flag: 'wx',
    mode: 0o600,
  })
  await fs.writeFile(path.join(backup, 'current-runtime.json'), context.pointerBytes, {
    flag: 'wx',
    mode: 0o600,
  })
  const manifest = {
    sourceFiles,
    distributionFiles,
    launcherFile,
    bytes,
    source,
    distInfo,
    launcher,
  }
  await atomicWrite(path.join(backup, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    create: true,
  })
  return manifest
}

async function restoreBackup(context, backup, manifest) {
  // Validate every deletion target and the rollback copy before touching installed bytes.
  equal(
    await treeManifest(path.join(backup, 'worker'), { bytecode: true, modes: true }),
    manifest.sourceFiles,
    'Retained worker rollback snapshot',
  )
  equal(
    await treeManifest(path.join(backup, 'dist-info'), { bytecode: true, modes: true }),
    manifest.distributionFiles,
    'Retained distribution rollback snapshot',
  )
  equal(
    await sha256(path.join(backup, 'launcher')),
    manifest.launcherFile.sha256,
    'Retained launcher rollback snapshot',
  )
  for (const target of [manifest.source, manifest.distInfo]) {
    try {
      await treeManifest(target, { bytecode: true })
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await fs.rm(target, { recursive: true, force: true })
  }
  try {
    await regularFile(manifest.launcher)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await fs.rm(manifest.launcher, { force: true })
  await fs.cp(path.join(backup, 'worker'), manifest.source, {
    recursive: true,
    preserveTimestamps: true,
    force: false,
    errorOnExist: true,
  })
  await fs.cp(path.join(backup, 'dist-info'), manifest.distInfo, {
    recursive: true,
    preserveTimestamps: true,
    force: false,
    errorOnExist: true,
  })
  await fs.copyFile(path.join(backup, 'launcher'), manifest.launcher, fs.constants.COPYFILE_EXCL)
  await fs.chmod(manifest.launcher, manifest.launcherFile.mode)
  equal(
    await treeManifest(manifest.source, { bytecode: true, modes: true }),
    manifest.sourceFiles,
    'Restored worker bytes/modes',
  )
  equal(
    await treeManifest(manifest.distInfo, { bytecode: true, modes: true }),
    manifest.distributionFiles,
    'Restored distribution bytes/modes',
  )
  equal(await sha256(manifest.launcher), manifest.launcherFile.sha256, 'Restored launcher bytes')
  await atomicWrite(context.metadataPath, context.metadataBytes, { mode: context.metadataMode })
  // The active pointer is deliberately never updated. A concurrent replacement is a refusal.
  equal(
    await fs.readFile(context.pointerPath),
    context.pointerBytes,
    'Unchanged active runtime pointer',
  )
  return {
    byteExactPackageAndDistribution: true,
    metadataRestored: true,
    launcherRestored: true,
    bytes: manifest.bytes,
  }
}

/** Dependency transports are explicit test seams; CLI always uses real uv/Python/worker/cgroups. */
export async function upgradeQualificationWorker(options, dependencies = {}) {
  const deps = {
    artifactRoot,
    repository,
    inspect,
    runCommand,
    qualify,
    assertIdle: assertRuntimeIdle,
    assertBounds: assertUpgradeBounds,
    ...dependencies,
  }
  if (process.platform !== 'linux' || process.arch !== 'x64')
    throw new Error('Worker qualification upgrade supports Linux x64 only.')
  const appData = options['app-data']
  await canonicalDirectory(deps.artifactRoot)
  if (
    !within(deps.artifactRoot, appData) ||
    !within(deps.artifactRoot, options.report) ||
    within(appData, options.report)
  ) {
    throw new Error(
      'Upgrade requires app data and an external new report inside the owned artifact root.',
    )
  }
  await canonicalDirectory(appData)
  await canonicalDirectory(path.dirname(options.report))
  await absent(options.report)
  await regularFile(options.uv)
  const metadataPath = path.join(appData, 'qualification-runtime.json')
  const metadataEntry = await regularFile(metadataPath, 16 * 1024)
  const metadataBytes = await fs.readFile(metadataPath)
  const metadata = JSON.parse(metadataBytes)
  if (
    metadata.status !== 'passed' ||
    metadata.appData !== appData ||
    metadata.confirmedWorkerExit !== true ||
    !/^[a-z0-9][\w.-]{0,127}$/i.test(metadata.runtimeId ?? '')
  ) {
    throw new Error('Existing app data is not a passed owned qualification runtime.')
  }
  if (
    !within(deps.artifactRoot, metadata.report) ||
    within(appData, metadata.report) ||
    metadata.report === options.report
  )
    throw new Error('Historical qualification report must be separate and owned.')
  await regularFile(metadata.report, 16 * 1024 ** 2)
  const previousBytes = await fs.readFile(metadata.report)
  const previous = JSON.parse(previousBytes)
  if (
    previous.status !== 'activated-qualified' ||
    previous.appData !== appData ||
    previous.runtimeId !== metadata.runtimeId ||
    previous.confirmedWorkerExit !== true ||
    previous.ready?.workerVersion !== '0.12.0'
  ) {
    throw new Error('Expected the historical successful worker0.12 provision report.')
  }
  const runtimeDir = path.join(appData, 'runtime')
  const environmentRoot = path.join(runtimeDir, 'environments', metadata.runtimeId)
  const ownedPython = path.join(runtimeDir, 'python', `${metadata.runtimeId}-cpython-3.12.13`)
  const pythonExecutable = path.join(environmentRoot, 'bin', 'python')
  const pointerPath = path.join(runtimeDir, 'current-runtime.json')
  const downloadsDir = path.join(appData, 'cache', 'runtime-downloads')
  const config = path.join(environmentRoot, 'resources', 'sdxl-config')
  for (const directory of [
    runtimeDir,
    environmentRoot,
    ownedPython,
    downloadsDir,
    config,
    path.join(appData, 'logs'),
    path.dirname(pythonExecutable),
  ])
    await canonicalDirectory(directory)
  if (
    !within(ownedPython, await fs.realpath(pythonExecutable)) ||
    metadata.pythonExecutable !== pythonExecutable ||
    previous.pythonExecutable !== pythonExecutable
  )
    throw new Error('Qualification Python must stay in its original app-owned location.')
  await regularFile(pointerPath, 16 * 1024)
  const pointerBytes = await fs.readFile(pointerPath)
  equal(
    JSON.parse(pointerBytes),
    { schemaVersion: 1, runtimeId: metadata.runtimeId, pythonExecutable },
    'Active runtime pointer',
  )
  await absent(path.join(environmentRoot, '.qualification-incomplete'))
  const lockPath = path.join(runtimeDir, '.qualification-worker-upgrade.lock')
  const project = path.join(deps.repository, 'worker-python')
  const context = {
    appData,
    runtimeDir,
    environmentRoot,
    ownedPython,
    pythonExecutable,
    pointerPath,
    pointerBytes,
    metadataPath,
    metadataBytes,
    metadataMode: metadataEntry.mode & 0o777,
    downloadsDir,
    environment: {
      ...metadataEnvironment,
      HF_DATASETS_OFFLINE: '1',
      HF_HOME: path.join(appData, 'cache'),
      HF_HUB_OFFLINE: '1',
      IGS_SDXL_CONFIG_DIR: config,
      TRANSFORMERS_OFFLINE: '1',
    },
  }
  const report = {
    boundary:
      'Worker-only developer qualification upgrade in the existing canonical app-owned runtime. No release Install/Repair, relocation, model copying or trained inference qualification.',
    startedAt: new Date().toISOString(),
    status: 'preparing',
    activateRequested: true,
    appData,
    runtimeId: metadata.runtimeId,
    pythonExecutable,
    previousReport: metadata.report,
    previousReportSha256: createHash('sha256').update(previousBytes).digest('hex'),
    inputs: {},
  }
  let workspace,
    backup,
    backupManifest,
    changed = false,
    locked = false,
    retain = false
  const controller = new AbortController()
  const interrupt = () => controller.abort()
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  try {
    report.inheritedBounds = await deps.assertBounds()
    report.initialIdle = await deps.assertIdle(appData, ownedPython)
    equal(
      await sha256(path.join(project, 'pyproject.toml')),
      previous.inputs?.worker?.pyprojectSha256,
      'Dependency declarations',
    )
    equal(
      await sha256(path.join(project, 'uv.lock')),
      previous.inputs?.worker?.lockSha256,
      'Dependency lock',
    )
    equal(await sha256(options.uv), previous.inputs?.uv?.sha256, 'Pinned uv executable')
    equal(
      await treeManifest(ownedPython, { python: true }),
      previous.inputs?.python?.files,
      'App-owned CPython',
    )
    equal(await treeManifest(config), previous.inputs?.config?.files, 'Pinned offline config')
    context.installed = await deps.inspect(context)
    validateInstallation(context.installed, context)
    equal(
      context.installed.packages,
      previous.installed?.packages,
      'Original installed dependencies',
    )
    equal(
      await treeManifest(context.installed.workerRoot),
      previous.installed?.workerFiles,
      'Original installed worker payload',
    )
    equal(
      context.installed.workerFiles,
      previous.installed?.workerFiles,
      'Original installed worker inspection',
    )
    report.inputs = {
      ...previous.inputs,
      worker: {
        files: await treeManifest(path.join(project, 'src')),
        pyprojectSha256: previous.inputs.worker.pyprojectSha256,
        lockSha256: previous.inputs.worker.lockSha256,
      },
      uv: { ...previous.inputs.uv, executable: options.uv },
    }
    const versionFile = path.join(project, 'src', 'imagegen_worker', 'inference.py')
    if (!/^INFERENCE_WORKER_VERSION = "0\.14\.0"$/m.test(await fs.readFile(versionFile, 'utf8')))
      throw new Error('Repository source is not worker0.14.')
    await atomicWrite(
      lockPath,
      `${JSON.stringify({ pid: process.pid, appData, report: options.report, startedAt: report.startedAt })}\n`,
      { create: true },
    )
    locked = true
    workspace = await fs.mkdtemp(path.join(downloadsDir, 'worker-upgrade-'))
    backup = path.join(workspace, 'rollback')
    await fs.mkdir(backup, { mode: 0o700 })
    backupManifest = await saveBackup(context, backup)
    report.rollbackBackup = {
      path: backup,
      bytes: backupManifest.bytes,
      manifestSha256: await sha256(path.join(backup, 'manifest.json')),
    }
    await fs.cp(path.join(project, 'src'), path.join(workspace, 'src'), {
      recursive: true,
      force: false,
      errorOnExist: true,
    })
    for (const name of ['pyproject.toml', 'uv.lock'])
      await fs.copyFile(
        path.join(project, name),
        path.join(workspace, name),
        fs.constants.COPYFILE_EXCL,
      )
    equal(
      await treeManifest(path.join(workspace, 'src')),
      report.inputs.worker.files,
      'Captured repository worker source',
    )
    equal(
      await sha256(path.join(workspace, 'pyproject.toml')),
      report.inputs.worker.pyprojectSha256,
      'Captured dependency declarations',
    )
    equal(
      await sha256(path.join(workspace, 'uv.lock')),
      report.inputs.worker.lockSha256,
      'Captured dependency lock',
    )
    const commandEnv = {
      ...metadataEnvironment,
      UV_CACHE_DIR: path.join(workspace, 'uv-cache'),
      UV_PYTHON_DOWNLOADS: 'never',
      UV_NO_CONFIG: '1',
    }
    const wheelDirectory = path.join(workspace, 'wheels')
    await fs.mkdir(wheelDirectory, { mode: 0o700 })
    report.logPath = path.join(appData, 'logs', `qualification-worker-upgrade-${randomUUID()}.log`)
    await fs.writeFile(report.logPath, '', { flag: 'wx', mode: 0o600 })
    const commands = [
      [
        'build',
        '--wheel',
        '--no-config',
        '--no-python-downloads',
        '--python',
        pythonExecutable,
        '--out-dir',
        wheelDirectory,
        workspace,
      ],
    ]
    report.commands = commands
    await deps.runCommand(
      options.uv,
      commands[0],
      workspace,
      commandEnv,
      report.logPath,
      controller.signal,
    )
    const entries = await fs.readdir(wheelDirectory)
    // uv creates .gitignore beside build artifacts; it is metadata, not a wheel.
    if (entries.includes('.gitignore'))
      await regularFile(path.join(wheelDirectory, '.gitignore'), 1024)
    const wheels = entries.filter((name) => name !== '.gitignore')
    if (wheels.length !== 1 || !/^imagegen_worker-[\w.]+-py3-none-any\.whl$/.test(wheels[0]))
      throw new Error('Expected exactly one non-editable worker wheel.')
    const wheel = path.join(wheelDirectory, wheels[0])
    await regularFile(wheel, maximumBackupBytes)
    report.wheel = {
      name: wheels[0],
      bytes: (await fs.stat(wheel)).size,
      sha256: await sha256(wheel),
    }
    equal(
      await treeManifest(path.join(workspace, 'src')),
      report.inputs.worker.files,
      'Worker source after wheel build',
    )
    await deps.assertBounds()
    await deps.assertIdle(appData, ownedPython)
    equal(await fs.readFile(metadataPath), metadataBytes, 'Qualification metadata before install')
    equal(await fs.readFile(pointerPath), pointerBytes, 'Active pointer before install')
    equal(
      await treeManifest(context.installed.workerRoot, { bytecode: true, modes: true }),
      backupManifest.sourceFiles,
      'Worker payload before install',
    )
    equal(
      await treeManifest(context.installed.distInfoRoot, { bytecode: true, modes: true }),
      backupManifest.distributionFiles,
      'Worker distribution before install',
    )
    commands.push([
      'pip',
      'install',
      '--no-deps',
      '--reinstall',
      '--no-config',
      '--no-python-downloads',
      '--link-mode',
      'copy',
      '--python',
      pythonExecutable,
      wheel,
    ])
    report.status = 'installing'
    changed = true
    await deps.runCommand(
      options.uv,
      commands[1],
      workspace,
      commandEnv,
      report.logPath,
      controller.signal,
    )
    report.installed = await deps.inspect(context)
    validateInstallation(report.installed, context)
    equal(
      report.installed.packages,
      previous.installed.packages,
      'Installed dependency versions after worker-only upgrade',
    )
    equal(
      await treeManifest(report.installed.workerRoot),
      await treeManifest(path.join(workspace, 'src', 'imagegen_worker')),
      'Installed non-editable wheel payload',
    )
    equal(
      report.installed.workerFiles,
      await treeManifest(report.installed.workerRoot),
      'Installed worker inspection',
    )
    if (report.installed.distInfoRoot !== context.installed.distInfoRoot)
      throw new Error('Worker upgrade changed the distribution location.')
    report.installed.distributionFiles = await treeManifest(report.installed.distInfoRoot)
    report.status = 'qualifying'
    if (controller.signal.aborted)
      throw new Error('Worker upgrade interrupted before qualification.')
    const qualified = await deps.qualify(context)
    report.ready = qualified.ready
    report.confirmedWorkerExit = qualified.confirmedWorkerExit
    report.workerExit = qualified
    if (!qualified.confirmedWorkerExit)
      throw Object.assign(new Error('Installed worker physical exit is unconfirmed.'), {
        confirmedWorkerExit: false,
      })
    const capabilities = await tsImport(
      '../src/shared/projects/inference-worker-capabilities.ts',
      import.meta.url,
    )
    if (
      !qualified.confirmedWorkerExit ||
      report.ready.workerVersion !== '0.14.0' ||
      !capabilities.isQualifiedInferenceWorkerReady(report.ready) ||
      !capabilities.supportsInferenceEuler(report.ready) ||
      !capabilities.supportsInferenceIllustriousNoiseProfile(report.ready) ||
      !previous.ready.capabilities.every((capability) =>
        report.ready.capabilities.includes(capability),
      )
    ) {
      throw new Error(
        'Installed worker0.14 must retain prior capabilities and qualify Euler/noise profile after physical exit.',
      )
    }
    await deps.assertIdle(appData, ownedPython)
    equal(
      await treeManifest(report.installed.workerRoot),
      report.installed.workerFiles,
      'Qualified immutable installed worker payload',
    )
    equal(
      await treeManifest(report.installed.distInfoRoot),
      report.installed.distributionFiles,
      'Qualified immutable worker distribution',
    )
    equal(await fs.readFile(metadata.report), previousBytes, 'Historical provision report')
    equal(
      await fs.readFile(metadataPath),
      metadataBytes,
      'Qualification metadata before publication',
    )
    equal(await fs.readFile(pointerPath), pointerBytes, 'Active pointer before publication')
    if (controller.signal.aborted) throw new Error('Worker upgrade interrupted before publication.')
    report.status = 'activated-qualified'
    report.finishedAt = new Date().toISOString()
    const upgradedMetadata = {
      ...metadata,
      report: options.report,
      workerVersion: report.ready.workerVersion,
      previousReport: metadata.report,
      confirmedWorkerExit: true,
    }
    await atomicWrite(options.report, `${JSON.stringify(report, null, 2)}\n`, { create: true })
    await atomicWrite(metadataPath, `${JSON.stringify(upgradedMetadata)}\n`, {
      mode: context.metadataMode,
    })
    report.published = true
    return report
  } catch (error) {
    report.status = 'failed'
    report.error = error.message
    report.confirmedWorkerExit = error.confirmedWorkerExit !== false
    if (changed && backupManifest) {
      try {
        if (!report.confirmedWorkerExit)
          throw new Error('Worker physical exit is unconfirmed; rollback mutation is blocked.')
        await deps.assertIdle(appData, ownedPython)
        report.rollback = await restoreBackup(context, backup, backupManifest)
        const restored = await deps.inspect(context)
        validateInstallation(restored, context)
        equal(restored.packages, previous.installed.packages, 'Restored dependencies')
        equal(restored.workerFiles, previous.installed.workerFiles, 'Restored original worker')
        const restoredReady = await deps.qualify(context)
        if (!restoredReady.confirmedWorkerExit)
          throw Object.assign(new Error('Restored worker did not confirm physical exit.'), {
            confirmedWorkerExit: false,
          })
        equal(restoredReady.ready, previous.ready, 'Independent restored worker startup')
        report.rollback.startup = restoredReady
        // Startup may regenerate Python caches. The immutable post-startup fence covers source
        // bytes/modes; restoreBackup has already checked the complete original cache payload.
        const originalSourceFiles = Object.fromEntries(
          Object.entries(backupManifest.sourceFiles).filter(([relative]) =>
            relative.split('/').every((name) => name !== '__pycache__' && !name.endsWith('.pyc')),
          ),
        )
        equal(
          await treeManifest(context.installed.workerRoot, { modes: true }),
          originalSourceFiles,
          'Original worker bytes/modes after restored startup',
        )
        equal(
          await treeManifest(context.installed.distInfoRoot, { bytecode: true, modes: true }),
          backupManifest.distributionFiles,
          'Original distribution after restored startup',
        )
        const launcher = path.join(context.environmentRoot, 'bin', 'imagegen-worker')
        const launcherEntry = await regularFile(launcher, maximumBackupBytes)
        equal(
          await sha256(launcher),
          backupManifest.launcherFile.sha256,
          'Original launcher bytes after restored startup',
        )
        equal(
          launcherEntry.mode & 0o777,
          backupManifest.launcherFile.mode,
          'Original launcher mode after restored startup',
        )
        await regularFile(pointerPath, 16 * 1024)
        equal(
          await fs.readFile(pointerPath),
          context.pointerBytes,
          'Unchanged active runtime pointer after restored startup',
        )
        equal(
          await fs.readFile(metadataPath),
          metadataBytes,
          'Byte-exact restored qualification metadata',
        )
        equal(
          await fs.readFile(metadata.report),
          previousBytes,
          'Unchanged historical provision report',
        )
        report.rollback.proven = true
      } catch (rollbackError) {
        report.rollbackError = rollbackError.message
        report.confirmedWorkerExit =
          rollbackError.confirmedWorkerExit !== false && report.confirmedWorkerExit
        retain = true
      }
    }
    if (workspace && !retain) {
      try {
        await deps.assertIdle(appData, ownedPython)
      } catch (idleError) {
        report.cleanupError = idleError.message
        retain = true
      }
    }
    report.finishedAt = new Date().toISOString()
    report.cleanup = retain
      ? 'Retained rollback payload and upgrade lock until physical exit and restoration are proven.'
      : 'Removed only this upgrade build/cache/rollback workspace after verified idle/restoration.'
    try {
      await atomicWrite(options.report, `${JSON.stringify(report, null, 2)}\n`, { create: true })
    } catch (writeError) {
      // Publication can succeed before metadata rename fails. Replace only this run's exact report.
      if (writeError.code === 'EEXIST') {
        const own = JSON.parse(await fs.readFile(options.report, 'utf8'))
        if (
          own.startedAt === report.startedAt &&
          own.previousReportSha256 === report.previousReportSha256
        ) {
          await atomicWrite(options.report, `${JSON.stringify(report, null, 2)}\n`)
        } else throw writeError
      } else throw writeError
    }
    error.report = report
    throw error
  } finally {
    if (!retain) {
      if (workspace) await fs.rm(workspace, { recursive: true, force: true })
      if (locked) await fs.unlink(lockPath)
    }
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', interrupt)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const argv = process.argv.slice(2)
    const options =
      argv[0] === '--options-file' && argv.length === 2
        ? await readUpgradeOptionsFile(argv[1])
        : argumentsFor(argv)
    if (!options) process.stdout.write(help)
    else {
      const report = await upgradeQualificationWorker(options)
      process.stdout.write(
        `${JSON.stringify({ status: report.status, workerVersion: report.ready.workerVersion, appData: report.appData, report: options.report, confirmedWorkerExit: report.confirmedWorkerExit })}\n`,
      )
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
