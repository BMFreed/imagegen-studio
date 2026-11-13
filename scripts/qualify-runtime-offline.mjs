/**
 * Real offline CPU assembly and mandatory Linux/NVIDIA refusal qualification.
 * Run with `pnpm exec tsx`, inside an externally bounded 4 GiB/zero-swap/600 s cgroup.
 * This deliberately incomplete wheelhouse must never activate a runtime pointer.
 * No downloads, model copies, GPU probes, auxiliary installation or payload cleanup.
 */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yauzl from 'yauzl'

import { GenerationWorkerClient } from '../src/main/projects/generation-worker-client.ts'
import { ProjectWorkerClient } from '../src/main/projects/worker-client.ts'
import { createRuntimeRoots, RuntimeManager } from '../src/main/runtime/index.ts'
import {
  assembleOfflineRuntime,
  hasUnconfirmedOfflineRuntimeCommands,
  OFFLINE_RUNTIME_INCOMPLETE_MARKER,
  runOfflineRuntimeCommand,
} from '../src/main/runtime/offline-runtime-assembly.ts'
import {
  RUNTIME_INSTALLATION_CLAIM,
  RUNTIME_INSTALLATION_JOURNAL,
  RUNTIME_INSTALLATION_RECOVERY_CLAIM,
} from '../src/main/runtime/runtime-installation.ts'
import {
  canonicalRuntimeReleaseJson,
  PINNED_RUNTIME_CONFIG_FILES,
  runtimeReleaseRequirements,
  verifyRuntimeRelease,
} from '../src/main/runtime/runtime-release.ts'

const repository = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const artifactRoot = path.join(os.homedir(), '.codex', 'artifacts', 'imagegen-studio')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const normalizedDistribution = (name) => name.toLowerCase().replace(/[-_.]+/g, '-')
const identity = (stat) =>
  [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].join(':')
const within = (root, candidate) => candidate.startsWith(`${root}${path.sep}`)
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  qualification: 'actual-offline-cpu-assembly-inference-refusal',
  outcome: 'running',
  checks: [],
  commands: [],
  cpuClients: [],
  inferenceStarts: [],
  controlledPorts: {
    host: 'Only process.platform=linux/process.arch=x64; ABI/CUDA/driver/GPU are unqualified.',
    auxiliary: 'Explicit no-op; separately managed LaMa is not installed or qualified.',
    releaseTrust: 'Ephemeral in-memory qualification key; not a shipped publisher trust root.',
  },
  negativeScope: [
    'This two-wheel base CPU payload is not a complete Linux/NVIDIA release artifact.',
    'No successful inference, visual, GPU, LaMa, public Setup, release or upgrade qualification.',
    'No previous working pointer exists; rollback success is covered separately by controlled ports.',
    'No model/resource/project data outside this newly owned fixture is inspected or changed.',
    'Payloads are retained for the owning run audit; this harness does not delete them.',
  ],
}
let reportFile
let payloadRoot
let sourceFreeze
let inputsFreeze
let inputArguments
let manager
let deadlineTimer
let prepared
let deadlineExceeded = false
const liveCpuClients = new Set()

function argumentsFrom(argv) {
  const allowed = new Set(['python-root', 'uv', 'config', 'wheels', 'report-file'])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '')
    assert.ok(argv[index]?.startsWith('--') && allowed.has(key), 'Unknown CLI argument')
    assert.ok(argv[index + 1] && !Object.hasOwn(values, key), `Missing/duplicate --${key}`)
    assert.ok(path.isAbsolute(argv[index + 1]), `--${key} must be absolute`)
    assert.equal(path.normalize(argv[index + 1]), argv[index + 1], `Noncanonical --${key}`)
    values[key] = argv[index + 1]
  }
  assert.deepEqual(Object.keys(values).sort(), [...allowed].sort(), 'All five CLI inputs are required')
  return values
}

async function canonicalDirectory(directory) {
  const stat = await fs.lstat(directory)
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), `Expected ordinary directory: ${directory}`)
  assert.equal(await fs.realpath(directory), directory, `Directory has a symlink ancestor: ${directory}`)
  return directory
}

async function absent(name) {
  await assert.rejects(fs.lstat(name), (error) => error.code === 'ENOENT')
}

async function mkdirNew(directory) {
  await fs.mkdir(directory, { mode: 0o700 })
  return canonicalDirectory(directory)
}

async function stableBytes(name) {
  const before = await fs.lstat(name, { bigint: true })
  assert.ok(before.isFile() && !before.isSymbolicLink(), `Expected ordinary file: ${name}`)
  assert.ok(before.size <= 128n * 1024n ** 2n, `Source file exceeds harness bound: ${name}`)
  const file = await fs.open(name, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    assert.equal(identity(await file.stat({ bigint: true })), identity(before))
    const bytes = await file.readFile()
    assert.equal(BigInt(bytes.length), before.size)
    assert.equal(identity(await file.stat({ bigint: true })), identity(before))
    assert.equal(identity(await fs.lstat(name, { bigint: true })), identity(before))
    return { bytes, identity: identity(before), executable: Boolean(before.mode & 0o111n) }
  } finally {
    await file.close()
  }
}

/** No symlink traversal. Only Python's internal relative links may be copied. */
async function inventory(root, allowLinks = false) {
  await canonicalDirectory(root)
  const entries = []
  const omitted = { bytecodeFiles: 0, bytecodeDirectories: 0 }
  const visit = async (relative) => {
    const directory = path.join(root, relative)
    const before = identity(await fs.lstat(directory, { bigint: true }))
    const names = (await fs.readdir(directory)).sort()
    for (const name of names) {
      assert.ok(name !== '.' && name !== '..' && !name.includes('\\'))
      const entryPath = relative ? `${relative}/${name}` : name
      const absolute = path.join(root, entryPath)
      const stat = await fs.lstat(absolute, { bigint: true })
      if (name === '__pycache__' && stat.isDirectory()) {
        omitted.bytecodeDirectories += 1
        continue
      }
      if (name.endsWith('.pyc') && stat.isFile()) {
        omitted.bytecodeFiles += 1
        continue
      }
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        await canonicalDirectory(absolute)
        await visit(entryPath)
      } else if (stat.isSymbolicLink()) {
        assert.ok(allowLinks, `Symlink forbidden: ${absolute}`)
        const target = await fs.readlink(absolute)
        assert.ok(!path.isAbsolute(target) && !target.includes('\\') && !target.includes('\0'))
        assert.ok(within(root, path.resolve(path.dirname(absolute), target)), 'Python link escapes root')
        assert.ok(within(root, await fs.realpath(absolute)), 'Python link resolves outside root')
        assert.equal(identity(await fs.lstat(absolute, { bigint: true })), identity(stat))
        entries.push({ path: entryPath, kind: 'symlink', target, identity: identity(stat) })
      } else {
        assert.ok(stat.isFile(), `Special source entry forbidden: ${absolute}`)
        const file = await stableBytes(absolute)
        entries.push({
          path: entryPath, kind: 'file', sha256: sha256(file.bytes), sizeBytes: file.bytes.length,
          executable: file.executable, identity: file.identity,
        })
      }
      assert.ok(entries.length <= 20_000, 'Harness inventory entry bound exceeded')
    }
    assert.equal(identity(await fs.lstat(directory, { bigint: true })), before, 'Source tree changed')
  }
  await visit('')
  return { entries, omitted }
}

async function copyInventory(sourceRoot, destinationRoot, snapshot, prefix) {
  const descriptors = []
  for (const entry of snapshot.entries) {
    const destination = path.join(destinationRoot, entry.path)
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 })
    if (entry.kind === 'symlink') {
      assert.equal(await fs.readlink(path.join(sourceRoot, entry.path)), entry.target)
      await fs.symlink(entry.target, destination)
      descriptors.push({ path: `${prefix}/${entry.path}`, kind: 'symlink', target: entry.target })
    } else {
      const file = await stableBytes(path.join(sourceRoot, entry.path))
      assert.equal(file.identity, entry.identity)
      assert.equal(sha256(file.bytes), entry.sha256)
      await fs.writeFile(destination, file.bytes, { flag: 'wx', mode: entry.executable ? 0o700 : 0o600 })
      descriptors.push({
        path: `${prefix}/${entry.path}`, kind: 'file', sha256: entry.sha256,
        sizeBytes: entry.sizeBytes, executable: entry.executable,
      })
    }
  }
  return descriptors
}

async function copyFile(source, destination, relative) {
  const file = await stableBytes(source)
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 })
  await fs.writeFile(destination, file.bytes, { flag: 'wx', mode: file.executable ? 0o700 : 0o600 })
  return { path: relative, kind: 'file', sha256: sha256(file.bytes), sizeBytes: file.bytes.length,
    executable: file.executable }
}

async function wheelMetadata(name) {
  const { bytes } = await stableBytes(name)
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(error)
      const metadata = []
      const workerFiles = {}
      let entries = 0
      let totalWorkerBytes = 0
      zip.on('error', reject)
      zip.on('entry', (entry) => {
        if (++entries > 5000 || entry.uncompressedSize > 64 * 1024 ** 2) {
          zip.close()
          reject(new Error('Wheel ZIP exceeds harness bounds'))
          return
        }
        const isMetadata = /^[^/]+\.dist-info\/METADATA$/.test(entry.fileName)
        const workerRelative = entry.fileName.startsWith('imagegen_worker/') && !entry.fileName.endsWith('/')
          ? entry.fileName.slice('imagegen_worker/'.length) : null
        if (!isMetadata && !workerRelative) return zip.readEntry()
        if (entry.fileName.startsWith('/') || entry.fileName.split('/').includes('..')) {
          zip.close(); reject(new Error('Unsafe wheel ZIP path')); return
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError)
          const chunks = []
          let size = 0
          stream.on('error', reject)
          stream.on('data', (chunk) => {
            size += chunk.length
            if (size > (isMetadata ? 256 * 1024 : 16 * 1024 ** 2)) stream.destroy(new Error('Wheel entry exceeds bound'))
            else chunks.push(chunk)
          })
          stream.on('end', () => {
            const entryBytes = Buffer.concat(chunks)
            if (isMetadata) metadata.push(entryBytes.toString('utf8'))
            else {
              totalWorkerBytes += entryBytes.length
              if (totalWorkerBytes > 64 * 1024 ** 2 || Object.hasOwn(workerFiles, workerRelative)) {
                zip.close(); reject(new Error('Worker wheel payload exceeds bound or contains duplicate entry')); return
              }
              workerFiles[workerRelative] = { bytes: entryBytes.length, sha256: sha256(entryBytes) }
            }
            zip.readEntry()
          })
        })
      })
      zip.on('end', () => {
        try {
          assert.equal(metadata.length, 1, 'Wheel requires exactly one METADATA entry')
          const nameField = metadata[0].match(/^Name: ([^\r\n]+)\r?$/m)?.[1]
          const version = metadata[0].match(/^Version: ([^\r\n]+)\r?$/m)?.[1]
          assert.ok(nameField && version)
          resolve({ distribution: normalizedDistribution(nameField), version, entries, workerFiles,
            metadataSha256: sha256(Buffer.from(metadata[0])) })
        } catch (validationError) { reject(validationError) }
      })
      zip.readEntry()
    })
  })
}

async function repositoryHead(directory) {
  let git = path.join(directory, '.git')
  if ((await fs.lstat(git)).isFile()) {
    git = path.resolve(directory, (await fs.readFile(git, 'utf8')).trim().replace(/^gitdir: /, ''))
  }
  const head = (await fs.readFile(path.join(git, 'HEAD'), 'utf8')).trim()
  if (/^[a-f0-9]{40}$/.test(head)) return head
  assert.ok(head.startsWith('ref: refs/'))
  const ref = head.slice(5)
  try { return (await fs.readFile(path.join(git, ref), 'utf8')).trim() } catch (error) {
    if (error.code !== 'ENOENT') throw error
    const packed = await fs.readFile(path.join(git, 'packed-refs'), 'utf8')
    const found = packed.split('\n').find((line) => line.endsWith(` ${ref}`))
    assert.ok(found, `Missing Git ref ${ref}`)
    return found.split(' ')[0]
  }
}

async function freezeOwners() {
  const owners = [
    'scripts/qualify-runtime-offline.mjs', 'package.json', 'worker-python/uv.lock',
    'worker-python/pyproject.toml', 'src/main/runtime/index.ts',
    'src/main/runtime/runtime-release.ts', 'src/main/runtime/offline-runtime-assembly.ts',
    'src/main/runtime/runtime-installation.ts', 'src/main/projects/worker-client.ts',
    'src/main/projects/generation-worker-client.ts', 'src/main/projects/inference-worker-ownership.ts',
    'src/shared/projects/inference-worker-capabilities.ts',
  ]
  const python = await inventory(path.join(repository, 'worker-python/src/imagegen_worker'))
  const files = []
  for (const name of owners) {
    const entry = await stableBytes(path.join(repository, name))
    files.push({ path: name, sha256: sha256(entry.bytes), identity: entry.identity })
  }
  return { head: await repositoryHead(repository), files, python }
}

async function cgroupProof(pid) {
  const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8')
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
  const cgroup = (await fs.readFile(`/proc/${pid}/cgroup`, 'utf8')).trim()
  const group = cgroup.split('\n').find((line) => line.startsWith('0::'))?.slice(3)
  assert.ok(group && group !== '/' && path.isAbsolute(group) && path.normalize(group) === group)
  const root = `/sys/fs/cgroup${group}`
  const memoryMax = (await fs.readFile(path.join(root, 'memory.max'), 'utf8')).trim()
  const swapMax = (await fs.readFile(path.join(root, 'memory.swap.max'), 'utf8')).trim()
  assert.ok(/^\d+$/.test(memoryMax) && BigInt(memoryMax) > 0n && BigInt(memoryMax) <= 4n * 1024n ** 3n,
    'Actual CLI/worker cgroup must already have MemoryMax <=4 GiB')
  assert.equal(swapMax, '0', 'Actual CLI/worker cgroup must already have MemorySwapMax=0')
  return { pid, startTicks: fields[19], processGroup: Number(fields[2]), group, memoryMax, swapMax,
    memoryCurrent: (await fs.readFile(path.join(root, 'memory.current'), 'utf8')).trim(),
    memoryStat: await fs.readFile(path.join(root, 'memory.stat'), 'utf8'),
    memoryEvents: await fs.readFile(path.join(root, 'memory.events'), 'utf8') }
}

async function ownedProcessExited(proof) {
  try {
    const text = await fs.readFile(`/proc/${proof.pid}/stat`, 'utf8')
    const start = text.slice(text.lastIndexOf(')') + 2).split(' ')[19]
    return start !== proof.startTicks
  } catch (error) {
    if (['ENOENT', 'ESRCH'].includes(error.code)) return true
    throw error
  }
}

function value(result) {
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error))
  return result.value
}

async function check(name, operation) {
  const result = { name, startedAt: new Date().toISOString(), outcome: 'running' }
  report.checks.push(result)
  try { result.evidence = await operation(); result.outcome = 'PASS' } catch (error) {
    result.outcome = 'FAIL'; result.error = errorSummary(error); throw error
  } finally { result.finishedAt = new Date().toISOString() }
}

function errorSummary(error) {
  return { name: error?.name, code: error?.code, message: String(error?.message ?? error),
    exitConfirmed: error?.exitConfirmed, recoveryRequired: error?.recoveryRequired,
    stack: error?.stack }
}

async function commandObserver(command) {
  const receipt = { executable: command.executable, args: [...command.args], cwd: command.cwd,
    logPath: command.logPath, startedAt: new Date().toISOString(),
    environment: { ...command.environment },
    executor: 'production runOfflineRuntimeCommand; unchanged command/result',
    physicalExitBoundary: 'Default executor owns detached process group; returns only after child close and group absence.' }
  report.commands.push(receipt)
  try {
    const result = await runOfflineRuntimeCommand(command)
    Object.assign(receipt, { code: result.code, exitConfirmed: result.exitConfirmed,
      stdout: result.stdout, stderr: result.stderr,
      stdoutBytes: Buffer.byteLength(result.stdout), stderrBytes: Buffer.byteLength(result.stderr),
      stdoutSha256: sha256(Buffer.from(result.stdout)), stderrSha256: sha256(Buffer.from(result.stderr)) })
    assert.equal(result.exitConfirmed, true)
    return result
  } catch (error) { receipt.error = errorSummary(error); throw error } finally {
    receipt.finishedAt = new Date().toISOString()
    const log = await stableBytes(command.logPath)
    receipt.log = { sha256: sha256(log.bytes), sizeBytes: log.bytes.length }
  }
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2))
  inputArguments = args
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64')
  await canonicalDirectory(artifactRoot)
  await canonicalDirectory(path.dirname(args['report-file']))
  assert.ok(within(path.join(artifactRoot, 'runs'), args['report-file']), 'Report must be in an owned RUN')
  await absent(args['report-file'])
  reportFile = args['report-file']
  for (const key of ['python-root', 'config', 'wheels']) await canonicalDirectory(args[key])
  assert.equal(await fs.realpath(args.uv), args.uv, 'uv must be a canonical ordinary executable')
  const uvInput = await stableBytes(args.uv)
  assert.ok(uvInput.executable)
  report.processBoundary = await cgroupProof(process.pid)
  report.deadline = { seconds: 600, externalCgroupDeadlineRequired: true,
    noKdeScope: 'CLI only; children inherit this bounded cgroup; CPU child inheritance checked directly.' }
  sourceFreeze = await freezeOwners()
  report.sourceBefore = sourceFreeze
  const invoke = path.resolve(repository, '../sources/InvokeAI')
  const launcher = path.resolve(repository, '../sources/launcher')
  report.sourceBasis = {
    invokeRevision: await repositoryHead(invoke), launcherRevision: await repositoryHead(launcher),
    invokePaths: ['invokeai/app/services/model_install/install_staging_ledger.py',
      'invokeai/app/services/model_install/model_install_default.py'],
    launcherPaths: ['download_uv.ts', 'src/main/install-manager.ts', 'src/main/index.ts'],
    adaptation: 'Existing production release/assembly/transaction/worker owners; no alternative installer or worker.',
  }
  assert.equal(report.sourceBasis.invokeRevision, '4875d96531ca6712b288f6e660fcbb34143408c1')
  assert.equal(report.sourceBasis.launcherRevision, 'c267bdb439519216b277a7a8c6ad408b9d79efce')
  const payloads = path.join(path.dirname(reportFile), 'payloads')
  try { await mkdirNew(payloads) } catch (error) {
    if (error.code !== 'EEXIST') throw error
    await canonicalDirectory(payloads)
  }
  payloadRoot = await fs.mkdtemp(path.join(payloads, 'native-runtime-offline-'))
  report.payloadRoot = payloadRoot
  const releaseDirectory = await mkdirNew(path.join(payloadRoot, 'signed-payload'))
  const roots = await createRuntimeRoots(path.join(payloadRoot, 'app'))
  report.roots = roots
  const sentinels = []
  for (const name of ['models', 'workspaces', 'presets']) {
    const directory = await mkdirNew(path.join(roots.appDataDir, name))
    const filename = path.join(directory, 'qualification-sentinel.txt')
    const bytes = Buffer.from(`${name}:owned-qualification-sentinel:${randomUUID()}\n`)
    await fs.writeFile(filename, bytes, { flag: 'wx', mode: 0o600 })
    sentinels.push({ filename, bytes })
  }
  await absent(roots.pointerFile)
  report.initialPointer = null
  deadlineTimer = setTimeout(() => {
    deadlineExceeded = true
    report.deadline.exceeded = true
    manager?.cancelInstallation().catch((error) => { report.cancelError = errorSummary(error) })
  }, 600_000)
  deadlineTimer.unref()

  let selection
  await check('actual-source-copy-and-real-wheel-metadata', async () => {
    const python = await inventory(args['python-root'], true)
    const config = await inventory(args.config)
    const wheels = await inventory(args.wheels)
    assert.equal(wheels.entries.length, 2, 'Only the supplied worker and Pillow wheels are allowed')
    assert.deepEqual(config.entries.map((entry) => entry.path).sort(), Object.keys(PINNED_RUNTIME_CONFIG_FILES).sort())
    for (const entry of config.entries) assert.equal(entry.sha256, PINNED_RUNTIME_CONFIG_FILES[entry.path])
    inputsFreeze = { python, config, wheels,
      uv: { identity: uvInput.identity, sha256: sha256(uvInput.bytes) } }
    report.inputsBefore = inputsFreeze
    const files = await copyInventory(args['python-root'], path.join(releaseDirectory, 'python'), python, 'python')
    files.push(...await copyInventory(args.config, path.join(releaseDirectory, 'config'), config, 'config'))
    files.push(await copyFile(args.uv, path.join(releaseDirectory, 'uv/uv'), 'uv/uv'))
    const descriptors = []
    for (const wheel of wheels.entries) {
      assert.ok(wheel.kind === 'file' && wheel.path.endsWith('.whl') && !wheel.path.includes('/'))
      const metadata = await wheelMetadata(path.join(args.wheels, wheel.path))
      assert.ok((metadata.distribution === 'imagegen-worker' && metadata.version === '0.1.0') ||
        (metadata.distribution === 'pillow' && metadata.version === '12.2.0'))
      if (metadata.distribution === 'imagegen-worker') {
        const expected = Object.fromEntries(sourceFreeze.python.entries.map((entry) => {
          assert.equal(entry.kind, 'file', 'Worker source must contain ordinary files only')
          return [entry.path, { bytes: entry.sizeBytes, sha256: entry.sha256 }]
        }))
        assert.deepEqual(metadata.workerFiles, expected, 'Built worker wheel differs from current Python source')
      }
      const descriptor = await copyFile(path.join(args.wheels, wheel.path),
        path.join(releaseDirectory, 'wheels', wheel.path), `wheels/${wheel.path}`)
      files.push(descriptor)
      descriptors.push({ path: descriptor.path, distribution: metadata.distribution,
        version: metadata.version, sha256: descriptor.sha256, sizeBytes: descriptor.sizeBytes })
      report.wheelMetadata ??= []
      report.wheelMetadata.push({ path: descriptor.path, ...metadata })
    }
    assert.deepEqual(descriptors.map((wheel) => wheel.distribution).sort(), ['imagegen-worker', 'pillow'])
    const manifest = {
      schemaVersion: 1, appVersion: 'qualification-0.1.0', releaseId: `cpu-refusal-${randomUUID()}`,
      profile: 'linux-nvidia', configPath: 'config', requirementsPath: 'requirements.txt',
      python: { version: '3.12.13', buildId: 'cpython-3.12.13-local-readonly-qualification', executable: 'python/bin/python3.12' },
      uv: { version: '0.11.11', executable: 'uv/uv' },
      worker: { distribution: 'imagegen-worker', distributionVersion: '0.1.0', cpuVersion: '0.1.0',
        inferenceVersion: '0.14.0', protocolVersion: '1' },
      host: { os: 'linux', arch: 'x64', glibcMinimum: '2.28', cudaVersion: '12.6',
        minimumNvidiaDriver: '560.0', gpuArchitectures: ['sm_89'] },
      lockSha256: sha256((await stableBytes(path.join(repository, 'worker-python/uv.lock'))).bytes),
      requiredFreeBytes: 1024 ** 3, wheels: descriptors, files,
    }
    const requirements = Buffer.from(runtimeReleaseRequirements(manifest))
    await fs.writeFile(path.join(releaseDirectory, 'requirements.txt'), requirements, { flag: 'wx', mode: 0o600 })
    files.push({ path: 'requirements.txt', kind: 'file', executable: false,
      sha256: sha256(requirements), sizeBytes: requirements.length })
    files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
    const keys = generateKeyPairSync('ed25519')
    const payload = canonicalRuntimeReleaseJson(manifest)
    const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const envelope = canonicalRuntimeReleaseJson({ schemaVersion: 1, keyId: 'ephemeral-cpu-refusal',
      payload: payload.toString('base64'), signature: sign(null, payload, keys.privateKey).toString('base64') })
    // The private key never leaves this local scope and is never serialized.
    await fs.writeFile(path.join(payloadRoot, 'qualification-public-key.pem'), publicKey, { flag: 'wx', mode: 0o600 })
    await fs.writeFile(path.join(payloadRoot, 'qualification-envelope.json'), envelope, { flag: 'wx', mode: 0o600 })
    selection = { appVersion: manifest.appVersion, directory: releaseDirectory, envelope,
      trustedKeys: { 'ephemeral-cpu-refusal': publicKey } }
    report.signedRelease = { manifest, manifestSha256: sha256(payload), envelopeSha256: sha256(envelope),
      publicKey, keyScope: 'This run only; private key not retained', hostMetadataQualified: false }
    const verified = await verifyRuntimeRelease(selection)
    await verified.verifyCompletePayloadSnapshot()
    return { files: files.length, bytes: files.filter((entry) => entry.kind === 'file').reduce((sum, entry) => sum + entry.sizeBytes, 0),
      configPins: config.entries.length, realWheels: descriptors }
  })

  let currentSelection = selection
  const backend = {
    loadRelease: async () => currentSelection,
    ensureHostCompatible: async () => {
      assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64')
      report.controlledHostCalls = (report.controlledHostCalls ?? 0) + 1
    },
    ensureAuxiliaryReady: async () => { report.controlledAuxiliaryCalls = (report.controlledAuxiliaryCalls ?? 0) + 1 },
    assemble: async (input) => {
      prepared = await assembleOfflineRuntime({ ...input, commandRunner: commandObserver })
      report.assembled = prepared
      return prepared
    },
    startProjectClient: async (location, options) => {
      const client = await ProjectWorkerClient.start(location, options)
      liveCpuClients.add(client)
      const processProof = await cgroupProof(client.child.pid)
      assert.equal(processProof.group, report.processBoundary.group, 'CPU child escaped the owned CLI cgroup')
      const receipt = { location, process: processProof, ready: client.ready }
      report.cpuClients.push(receipt)
      return {
        ready: client.ready,
        selfTest: async () => {
          receipt.selfTest = await client.selfTest()
          assert.equal(receipt.selfTest.pillowVersion, '12.2.0')
          return receipt.selfTest
        },
        close: async () => {
          await client.close()
          receipt.exitConfirmed = await ownedProcessExited(processProof)
          receipt.forcedTermination = client.forcedTermination
          receipt.signalCode = client.child.signalCode
          receipt.exitCode = client.child.exitCode
          receipt.closeMechanism = 'Production ProjectWorkerClient.close -> fail(CLOSED) sends SIGTERM, awaits physical exit; no SIGKILL escalation accepted.'
          assert.equal(receipt.exitConfirmed, true)
          assert.equal(receipt.forcedTermination, false, 'Forced CPU exit is not a successful qualification close')
          assert.equal(receipt.signalCode, 'SIGTERM')
          assert.equal(receipt.exitCode, null)
          liveCpuClients.delete(client)
        },
      }
    },
  }
  const startInference = async (location, environment) => {
    const receipt = { location, startedAt: new Date().toISOString(), environment }
    report.inferenceStarts.push(receipt)
    try {
      const client = await GenerationWorkerClient.start(location, { environment })
      try { receipt.unexpectedReady = client.ready } finally { await client.close() }
      throw new Error('The deliberately incomplete CPU release unexpectedly admitted inference')
    } catch (error) {
      receipt.error = errorSummary(error)
      receipt.exitFenceClear = !GenerationWorkerClient.hasUnconfirmedStartExit()
      throw error
    } finally { receipt.finishedAt = new Date().toISOString() }
  }
  manager = new RuntimeManager(roots, { platform: 'linux', arch: 'x64' }, startInference, backend)

  await check('invalid-signature-refuses-preview-before-execution', async () => {
    const envelope = JSON.parse(selection.envelope.toString('utf8'))
    const signature = Buffer.from(envelope.signature, 'base64'); signature[0] ^= 1
    currentSelection = { ...selection, envelope: canonicalRuntimeReleaseJson({ ...envelope, signature: signature.toString('base64') }) }
    const result = await manager.previewInstallation('install')
    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'RUNTIME_RELEASE_UNTRUSTED')
    assert.equal(report.commands.length, 0)
    assert.deepEqual(await fs.readdir(roots.environmentsDir), [])
    assert.deepEqual(await fs.readdir(roots.pythonDir), [])
    await absent(roots.pointerFile)
    currentSelection = selection
    return result
  })
  await check('same-length-payload-drift-refuses-preview-and-restores', async () => {
    const name = path.join(releaseDirectory, 'requirements.txt')
    const original = await fs.readFile(name)
    const changed = Buffer.from(original); changed[0] ^= 1
    let result
    try {
      await fs.writeFile(name, changed)
      result = await manager.previewInstallation('install')
      assert.equal(result.ok, false)
      assert.equal(result.error.code, 'RUNTIME_RELEASE_PAYLOAD_CHANGED')
      assert.equal(report.commands.length, 0)
      assert.deepEqual(await fs.readdir(roots.environmentsDir), [])
    } finally {
      await fs.writeFile(name, original)
      assert.equal(sha256(await fs.readFile(name)), sha256(original))
    }
    await (await verifyRuntimeRelease(selection)).verifyCompletePayloadSnapshot()
    return { result, exactBytesRestored: true, sha256: sha256(original) }
  })

  let review
  await check('real-signed-preview-creates-no-runtime-slot-or-process', async () => {
    review = value(await manager.previewInstallation('install'))
    assert.equal(review.scope, 'python-runtime-slot')
    assert.equal(review.mode, 'install')
    assert.equal(report.commands.length, 0)
    assert.deepEqual(await fs.readdir(roots.environmentsDir), [])
    assert.deepEqual(await fs.readdir(roots.pythonDir), [])
    return review
  })
  await check('actual-offline-assembly-cpu-self-test-and-inference-refusal', async () => {
    const result = await manager.install(review.token)
    report.installResult = result
    assert.equal(result.ok, false, 'CPU-only fixture must not activate Linux/NVIDIA')
    assert.equal(result.error.code, 'RUNTIME_INSTALL_FAILED')
    assert.ok(prepared, 'Actual offline assembly did not finish')
    assert.equal(report.cpuClients.length, 1)
    assert.equal(report.cpuClients[0].ready.workerVersion, '0.1.0')
    assert.equal(report.cpuClients[0].ready.runtimeProfile, 'derivatives-only')
    assert.ok(report.cpuClients[0].ready.capabilities.includes('export-composition'))
    assert.ok(report.cpuClients[0].selfTest)
    assert.equal(report.inferenceStarts.length, 1)
    assert.equal(report.inferenceStarts[0].error.code, 'WORKER_EXITED')
    assert.equal(report.inferenceStarts[0].exitFenceClear, true)
    assert.ok(report.commands.length >= 6)
    assert.ok(report.commands.every((command) => command.code === 0 && command.exitConfirmed === true))
    const inspection = report.commands.map((command) => {
      try { return JSON.parse(command.stdout) } catch { return null }
    }).find((entry) => entry?.workerFiles && entry?.packages)
    assert.ok(inspection, 'Production installed-byte inspection receipt is required')
    assert.deepEqual(inspection.packages.map((entry) => [normalizedDistribution(entry.name), entry.version]).sort(),
      [['imagegen-worker', '0.1.0'], ['pillow', '12.2.0']])
    report.installedInspection = { packages: inspection.packages,
      workerFiles: inspection.workerFiles, workerRoot: inspection.workerRoot }
    await absent(roots.pointerFile)
    return { result, actualCommands: report.commands.length, cpuSelfTest: report.cpuClients[0].selfTest,
      installedWorkerFiles: Object.keys(inspection.workerFiles).length }
  })
  await check('real-inference-entrypoint-refuses-missing-torch-with-physical-exit', async () => {
    const logPath = path.join(roots.workerLogsDir, 'inference-refusal.log')
    await fs.writeFile(logPath, '', { flag: 'wx', mode: 0o600 })
    const diagnostic = await commandObserver({ executable: prepared.pythonExecutable, cwd: roots.runtimeDir,
      environment: prepared.environment, logPath,
      args: ['-I', '-B', '-c', "import importlib.util,json; print(json.dumps({'torchSpec':importlib.util.find_spec('torch')}))"] })
    assert.equal(diagnostic.code, 0)
    assert.deepEqual(JSON.parse(diagnostic.stdout), { torchSpec: null })
    const result = await commandObserver({ executable: prepared.pythonExecutable, cwd: roots.runtimeDir,
      environment: prepared.environment, logPath, args: ['-I', '-B', '-m', 'imagegen_worker.inference_main'] })
    assert.equal(result.code, 78)
    assert.equal(result.stdout, '', 'Refused inference must not advertise ready')
    assert.match(result.stderr, /Inference startup failed:.*pinned CUDA inference runtime is unavailable/)
    return { torchSpec: null, code: result.code, stderr: result.stderr, exitConfirmed: result.exitConfirmed,
      inference: 'Actual entrypoint refuses before any Torch import/CUDA probe because Torch distribution is absent.' }
  })
  await check('one-use-review-retained-incomplete-slots-and-no-active-pointer', async () => {
    const consumed = await manager.install(review.token)
    assert.equal(consumed.ok, false)
    assert.equal(consumed.error.code, 'RUNTIME_INVALID_REVIEW')
    const pythonSlots = await fs.readdir(roots.pythonDir)
    const environmentSlots = await fs.readdir(roots.environmentsDir)
    assert.equal(pythonSlots.length, 1); assert.deepEqual(pythonSlots, environmentSlots)
    const markers = []
    for (const parent of [roots.pythonDir, roots.environmentsDir]) {
      const marker = path.join(parent, pythonSlots[0], OFFLINE_RUNTIME_INCOMPLETE_MARKER)
      const markerValue = JSON.parse(await fs.readFile(marker, 'utf8'))
      assert.equal(markerValue.schemaVersion, 1)
      assert.equal(markerValue.runtimeId, pythonSlots[0])
      assert.equal(markerValue.releaseId, report.signedRelease.manifest.releaseId)
      markers.push({ path: marker, value: markerValue })
    }
    await absent(roots.pointerFile)
    const status = value(await manager.getStatus())
    assert.equal(status.kind, 'not-installed')
    const journal = JSON.parse(await fs.readFile(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL), 'utf8'))
    assert.equal(journal.phase, 'failed')
    await absent(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_CLAIM))
    await absent(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_RECOVERY_CLAIM))
    report.finalStatus = status
    return { consumed, pythonSlots, environmentSlots, markers, journal, status, pointerAbsent: true }
  })
  await check('owned-sentinels-source-payload-and-physical-exit-restoration', async () => {
    for (const sentinel of sentinels) assert.deepEqual(await fs.readFile(sentinel.filename), sentinel.bytes)
    const after = { python: await inventory(args['python-root'], true), config: await inventory(args.config),
      wheels: await inventory(args.wheels), uv: await stableBytes(args.uv) }
    after.uv = { identity: after.uv.identity, sha256: sha256(after.uv.bytes) }
    assert.deepEqual(after, inputsFreeze, 'Read-only input bytes or metadata changed')
    assert.deepEqual(await freezeOwners(), sourceFreeze, 'Production/Python source changed during qualification')
    await (await verifyRuntimeRelease(selection)).verifyCompletePayloadSnapshot()
    assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
    assert.equal(GenerationWorkerClient.hasUnconfirmedStartExit(), false)
    assert.equal(hasUnconfirmedOfflineRuntimeCommands(), false)
    assert.equal(deadlineExceeded, false)
    report.finalProcessBoundary = await cgroupProof(process.pid)
    return { sentinels: sentinels.map((entry) => ({ path: entry.filename, sha256: sha256(entry.bytes) })),
      sourceUnchanged: true, readOnlyInputsUnchanged: true, signedPayloadRestored: true,
      exitConfirmed: true, forcedExitAccepted: false, unconfirmedFences: false, payloadsRetained: true }
  })
  report.outcome = 'PASS'
}

try {
  await main()
} catch (error) {
  report.outcome = 'FAIL'
  report.error = errorSummary(error)
  process.exitCode = 1
} finally {
  clearTimeout(deadlineTimer)
  if (manager) {
    try { await manager.cancelInstallation() } catch (error) { report.finalCancelError = errorSummary(error) }
    manager.preventNewGenerationWork()
  }
  if (liveCpuClients.size) {
    report.emergencyCpuCleanup = []
    for (const client of liveCpuClients) {
      const cleanup = { pid: client.child.pid, exitConfirmed: false }
      report.emergencyCpuCleanup.push(cleanup)
      try {
        await client.close()
        cleanup.exitConfirmed = client.exitObserved
        cleanup.forcedTermination = client.forcedTermination
        if (cleanup.exitConfirmed) liveCpuClients.delete(client)
      } catch (error) { cleanup.error = errorSummary(error) }
    }
    report.outcome = 'FAIL'; process.exitCode = 1
  }
  report.finishedAt = new Date().toISOString()
  report.cleanup = { action: 'none', payloadRoot, retained: true,
    reason: 'Owning run performs retention, dependency audit and bounded cleanup separately.' }
  report.finalExitFences = { project: ProjectWorkerClient.hasUnconfirmedExit(),
    inference: GenerationWorkerClient.hasUnconfirmedStartExit(), commands: hasUnconfirmedOfflineRuntimeCommands() }
  if (sourceFreeze) {
    try {
      report.sourceAfter = await freezeOwners()
      report.sourceUnchanged = JSON.stringify(report.sourceAfter) === JSON.stringify(sourceFreeze)
      assert.equal(report.sourceUnchanged, true)
    } catch (error) { report.sourceAuditError = errorSummary(error); report.outcome = 'FAIL'; process.exitCode = 1 }
  }
  if (inputsFreeze && inputArguments) {
    try {
      const uv = await stableBytes(inputArguments.uv)
      const after = { python: await inventory(inputArguments['python-root'], true),
        config: await inventory(inputArguments.config), wheels: await inventory(inputArguments.wheels),
        uv: { identity: uv.identity, sha256: sha256(uv.bytes) } }
      assert.deepEqual(after, inputsFreeze)
      report.readOnlyInputsUnchanged = true
    } catch (error) { report.inputAuditError = errorSummary(error); report.outcome = 'FAIL'; process.exitCode = 1 }
  }
  if (Object.values(report.finalExitFences).some(Boolean)) {
    report.outcome = 'FAIL'; process.exitCode = 1
  }
  report.exitConfirmed = !Object.values(report.finalExitFences).some(Boolean) && liveCpuClients.size === 0 &&
    report.commands.every((command) => command.exitConfirmed === true)
  if (reportFile) await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  process.stdout.write(`${JSON.stringify({ outcome: report.outcome, checks: report.checks.map(({ name, outcome }) => ({ name, outcome })), reportFile })}\n`)
}
