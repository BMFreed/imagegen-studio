/**
 * Real offline assembly through the existing release/installer/worker owners. Default: two-wheel
 * CPU qualification and mandatory inference refusal, <=4 GiB. --profile full-inference: verified
 * 67-wheel input, native qualification and activation, <=8 GiB. --profile full-engine adopts an
 * existing signed transport and pinned local LaMa, then exercises native Install/Repair/rollback.
 * --profile full-engine-install uses the same source through one qualified final slot for a later
 * packaged application run. All require zero swap/600 s external bounds. No public downloads or
 * payload cleanup.
 */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yauzl from 'yauzl'

import { ensureAppPaths, resolveAppPaths } from '../src/main/app-paths.ts'
import { GenerationWorkerClient } from '../src/main/projects/generation-worker-client.ts'
import { ProjectWorkerClient } from '../src/main/projects/worker-client.ts'
import { createRuntimeRoots, RuntimeManager } from '../src/main/runtime/index.ts'
import { createLamaAuxiliaryInstaller } from '../src/main/runtime/inference-auxiliary-installer.ts'
import { InferenceAuxiliaryResources } from '../src/main/runtime/inference-auxiliary-resources.ts'
import { LAMA_OUTPAINT_ARTIFACT } from '../src/main/runtime/lama-manifest.ts'
import { extractRuntimeTransport } from '../src/main/runtime/runtime-release-extraction.ts'
import { verifyRuntimeTransport } from '../src/main/runtime/runtime-release-transport.ts'
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
const engineProfiles = new Set(['full-engine', 'full-engine-install'])
const engineOwnerPaths = [
  'src/main/runtime/engine-install-plan.ts',
  'src/main/runtime/engine-installation-review.ts',
  'src/main/runtime/runtime-release-transport.ts',
  'src/main/runtime/runtime-release-extraction.ts',
  'src/main/runtime/runtime-transport-cache.ts',
  'src/main/runtime/inference-auxiliary-installer.ts',
  'src/main/runtime/inference-auxiliary-resources.ts',
  'src/main/runtime/lama-manifest.ts',
  'src/main/models/model-downloader.ts',
  'src/shared/projects/alpha-outpaint.ts',
]
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
const liveInferenceClients = new Set()
let fullInference = false
let fullEngine = false
let engineTransport
let engineTrustedKeys
let engineResources
let failEngineAfterActivation = false

export function argumentsFrom(argv) {
  const legacy = ['python-root', 'uv', 'config', 'wheels', 'report-file']
  const engine = [
    'transport-dir',
    'trusted-keys',
    'app-version',
    'lama-source',
    'wheelhouse-report',
    'report-file',
  ]
  const allowed = new Set([...legacy, ...engine, 'profile'])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '')
    assert.ok(argv[index]?.startsWith('--') && allowed.has(key), 'Unknown CLI argument')
    assert.ok(argv[index + 1] && !Object.hasOwn(values, key), `Missing/duplicate --${key}`)
    if (key === 'profile') {
      assert.ok(
        argv[index + 1] === 'full-inference' || engineProfiles.has(argv[index + 1]),
        'Unsupported qualification profile',
      )
    } else if (key === 'app-version') {
      assert.match(argv[index + 1], /^[A-Z0-9][\w.+!-]{0,127}$/i, 'Invalid app version')
      assert.ok(!/[\r\n]/.test(argv[index + 1]), 'Invalid app version')
    } else {
      assert.ok(path.isAbsolute(argv[index + 1]), `--${key} must be absolute`)
      assert.equal(path.normalize(argv[index + 1]), argv[index + 1], `Noncanonical --${key}`)
    }
    values[key] = argv[index + 1]
  }
  const engineProfile = engineProfiles.has(values.profile)
  const required = engineProfile ? engine : legacy
  const profileAllowed = new Set([
    ...required,
    'profile',
    ...(engineProfile ? [] : ['wheelhouse-report']),
  ])
  for (const key of Object.keys(values))
    assert.ok(profileAllowed.has(key), `Input unsupported by selected profile: --${key}`)
  for (const key of required) assert.ok(Object.hasOwn(values, key), `Required --${key}`)
  assert.equal(
    Object.hasOwn(values, 'wheelhouse-report'),
    values.profile === 'full-inference' || engineProfile,
    'A wheelhouse report is required only for full profiles',
  )
  return values
}

/** Signed source adoption is exact; an existing valid release cannot borrow another wheel plan. */
export function validateEngineRelease(manifest, plan) {
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.profile, 'linux-nvidia')
  assert.equal(manifest.dependencyPolicy, 'invoke-inference-v1')
  assert.equal(manifest.lockSha256, plan.lockSha256)
  assert.match(manifest.lockSha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(manifest.worker, {
    distribution: 'imagegen-worker',
    distributionVersion: '0.1.0',
    cpuVersion: '0.1.0',
    inferenceVersion: '0.14.0',
    protocolVersion: '1',
  })
  assert.equal(manifest.python.version, '3.12.13')
  assert.equal(manifest.python.executable, 'python/bin/python3.12')
  assert.equal(manifest.configPath, 'config')
  assert.equal(manifest.requirementsPath, 'requirements.txt')
  assert.equal(manifest.host.os, plan.target.os)
  assert.equal(manifest.host.arch, plan.target.arch)
  assert.equal(manifest.host.glibcMinimum, plan.target.glibcMinimum)
  assert.ok(Array.isArray(manifest.wheels) && manifest.wheels.length === 67)
  const rows = (wheels) =>
    wheels
      .map((entry) => ({
        distribution: entry.distribution,
        version: entry.version,
        path: entry.path,
        sha256: entry.sha256,
        sizeBytes: entry.sizeBytes,
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
  for (const entry of manifest.wheels)
    assert.deepEqual(Object.keys(entry).sort(), [
      'distribution',
      'path',
      'sha256',
      'sizeBytes',
      'version',
    ])
  assert.deepEqual(
    rows(manifest.wheels),
    rows(plan.wheels),
    'Signed wheel set differs from bound proof',
  )
  assert.equal(new Set(manifest.wheels.map((entry) => entry.distribution)).size, 67)
  assert.equal(new Set(manifest.wheels.map((entry) => entry.path)).size, 67)
  return true
}

/** Local artifact proof is not a publisher signature or installed-runtime qualification. */
export function validateFullWheelhouseProof(verificationBytes, planBytes) {
  assert.ok(
    verificationBytes.length > 0 && verificationBytes.length <= 2 * 1024 ** 2,
    'Wheelhouse verification exceeds its bound',
  )
  assert.ok(
    planBytes.length > 0 && planBytes.length <= 8 * 1024 ** 2,
    'Wheelhouse plan exceeds its bound',
  )
  const verification = JSON.parse(verificationBytes.toString('utf8'))
  const plan = JSON.parse(planBytes.toString('utf8'))
  assert.equal(verification.schemaVersion, 1)
  assert.equal(verification.scope, 'linux-nvidia-wheelhouse-verification')
  assert.equal(verification.artifactBytesVerified, true)
  assert.equal(verification.dependencyEvidence, 'wheel-metadata')
  assert.equal(verification.installQualified, false)
  assert.equal(verification.dependencyPolicy, 'invoke-inference-v1')
  assert.equal(
    verification.planSha256,
    sha256(planBytes),
    'Wheelhouse proof is not bound to exact plan bytes',
  )
  assert.equal(plan.schemaVersion, 1)
  assert.equal(plan.scope, 'linux-nvidia-wheelhouse-plan')
  assert.equal(plan.dependencyPolicy, 'invoke-inference-v1')
  assert.equal(plan.artifactBytesVerified, false)
  assert.equal(plan.dependencyEvidence, 'lock-graph-only')
  assert.equal(plan.installQualified, false)
  assert.deepEqual(plan.rootExtras, ['inference'])
  assert.deepEqual(plan.excludedDependencies, ['notebook'])
  assert.deepEqual(plan.target, {
    os: 'linux',
    arch: 'x64',
    pythonVersion: '3.12.13',
    glibcMinimum: '2.28',
  })
  assert.deepEqual(verification.target, plan.target)
  assert.equal(verification.wheelCount, 67)
  assert.ok(Array.isArray(plan.wheels) && plan.wheels.length === 67)
  assert.ok(Array.isArray(verification.wheels) && verification.wheels.length === 67)
  const actual = new Map(verification.wheels.map((entry) => [entry.filename, entry]))
  assert.equal(actual.size, 67, 'Duplicate verified filename')
  const distributions = new Set()
  const filenames = new Set()
  let total = 0
  let external = 0
  for (const entry of plan.wheels) {
    assert.ok(
      typeof entry.distribution === 'string' &&
        entry.distribution.length <= 128 &&
        /^[a-z0-9][a-z0-9-]*$/.test(entry.distribution) &&
        normalizedDistribution(entry.distribution) === entry.distribution,
    )
    assert.ok(typeof entry.version === 'string' && /^[\w.+!-]{1,128}$/.test(entry.version))
    assert.ok(
      typeof entry.filename === 'string' &&
        entry.filename.length <= 255 &&
        /^[A-Za-z0-9_.+-]+\.whl$/.test(entry.filename),
    )
    assert.equal(entry.path, `wheels/${entry.filename}`)
    assert.ok(typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256))
    assert.ok(
      Number.isSafeInteger(entry.sizeBytes) &&
        entry.sizeBytes > 0 &&
        entry.sizeBytes <= 4 * 1024 ** 3,
    )
    assert.ok(
      !distributions.has(entry.distribution) && !filenames.has(entry.filename),
      'Duplicate wheel identity',
    )
    distributions.add(entry.distribution)
    filenames.add(entry.filename)
    const row = actual.get(entry.filename)
    assert.ok(row, 'Missing verified wheel')
    for (const field of ['distribution', 'version', 'filename', 'sha256', 'sizeBytes']) {
      assert.equal(row[field], entry[field], `Wheelhouse report differs: ${field}`)
    }
    total += entry.sizeBytes
    if (entry.url !== null) external += entry.sizeBytes
  }
  assert.ok(distributions.has('imagegen-worker'))
  const worker = plan.wheels.find((entry) => entry.distribution === 'imagegen-worker')
  assert.equal(worker.version, '0.1.0')
  assert.equal(worker.url, null)
  assert.equal(plan.totalWheelBytes, total)
  assert.equal(plan.externalWheelBytes, external)
  assert.equal(verification.totalWheelBytes, total)
  assert.equal(verification.dependencyCheck?.status, 'ok')
  assert.equal(verification.dependencyCheck?.schemaVersion, 1)
  assert.equal(verification.dependencyCheck?.policy, 'invoke-inference-v1')
  assert.equal(verification.dependencyCheck?.root, 'imagegen-worker')
  assert.equal(verification.dependencyCheck?.pythonVersion, '3.12.13')
  assert.equal(verification.dependencyCheck?.packageCount, 67)
  assert.deepEqual(verification.dependencyCheck?.rootExtras, ['inference'])
  assert.deepEqual(verification.dependencyCheck?.excludedDependencies, ['notebook'])
  assert.equal(plan.requirements, runtimeReleaseRequirements({ wheels: plan.wheels }))
  return { plan, verification }
}

async function fullWheelhouseProof(args) {
  const verificationPath = args['wheelhouse-report']
  const planPath = path.join(path.dirname(verificationPath), 'wheelhouse-plan.json')
  assert.equal(await fs.realpath(verificationPath), verificationPath)
  assert.equal(await fs.realpath(planPath), planPath)
  const verified = await stableBytes(verificationPath, 2 * 1024 ** 2)
  const planned = await stableBytes(planPath, 8 * 1024 ** 2)
  const proof = validateFullWheelhouseProof(verified.bytes, planned.bytes)
  assert.equal(
    proof.plan.lockSha256,
    sha256((await stableBytes(path.join(repository, 'worker-python/uv.lock'))).bytes),
  )
  assert.equal(
    proof.plan.pyprojectSha256,
    sha256((await stableBytes(path.join(repository, 'worker-python/pyproject.toml'))).bytes),
  )
  return {
    ...proof,
    files: {
      verification: {
        path: verificationPath,
        identity: verified.identity,
        sha256: sha256(verified.bytes),
      },
      plan: { path: planPath, identity: planned.identity, sha256: sha256(planned.bytes) },
    },
  }
}

async function canonicalDirectory(directory) {
  const stat = await fs.lstat(directory)
  assert.ok(
    stat.isDirectory() && !stat.isSymbolicLink(),
    `Expected ordinary directory: ${directory}`,
  )
  assert.equal(
    await fs.realpath(directory),
    directory,
    `Directory has a symlink ancestor: ${directory}`,
  )
  return directory
}

async function absent(name) {
  await assert.rejects(fs.lstat(name), (error) => error.code === 'ENOENT')
}

async function mkdirNew(directory) {
  await fs.mkdir(directory, { mode: 0o700 })
  return canonicalDirectory(directory)
}

async function stableBytes(name, maximumBytes = 128 * 1024 ** 2) {
  const before = await fs.lstat(name, { bigint: true })
  assert.ok(before.isFile() && !before.isSymbolicLink(), `Expected ordinary file: ${name}`)
  assert.ok(before.size <= BigInt(maximumBytes), `Source file exceeds harness bound: ${name}`)
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

/** Invoke's buffered hashing adapted to Studio's ordinary/stable input contract. */
export async function stableFile(name, destination, expected) {
  const before = await fs.lstat(name, { bigint: true })
  assert.ok(
    before.isFile() && !before.isSymbolicLink() && before.size <= 32n * 1024n ** 3n,
    'Source must be an ordinary bounded file',
  )
  const reader = await fs.open(
    name,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  let writer
  try {
    assert.equal(identity(await reader.stat({ bigint: true })), identity(before))
    if (expected) assert.equal(identity(before), expected.identity)
    if (destination) {
      await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 })
      writer = await fs.open(destination, 'wx', before.mode & 0o111n ? 0o700 : 0o600)
    }
    const chunk = Buffer.allocUnsafe(1024 * 1024)
    const hash = createHash('sha256')
    let count = 0
    for (;;) {
      const { bytesRead } = await reader.read(chunk, 0, chunk.length, null)
      if (!bytesRead) break
      count += bytesRead
      assert.ok(BigInt(count) <= before.size, 'Source grew while streaming')
      hash.update(chunk.subarray(0, bytesRead))
      if (writer) {
        let offset = 0
        while (offset < bytesRead) {
          const wrote = await writer.write(chunk, offset, bytesRead - offset)
          assert.ok(wrote.bytesWritten > 0, 'Source copy stopped making progress')
          offset += wrote.bytesWritten
        }
      }
    }
    const digest = hash.digest('hex')
    assert.equal(BigInt(count), before.size)
    assert.equal(identity(await reader.stat({ bigint: true })), identity(before))
    assert.equal(identity(await fs.lstat(name, { bigint: true })), identity(before))
    if (expected) assert.equal(digest, expected.sha256)
    await writer?.sync()
    return {
      sha256: digest,
      sizeBytes: count,
      identity: identity(before),
      executable: Boolean(before.mode & 0o111n),
    }
  } finally {
    await writer?.close()
    await reader.close()
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
        assert.ok(
          within(root, path.resolve(path.dirname(absolute), target)),
          'Python link escapes root',
        )
        assert.ok(within(root, await fs.realpath(absolute)), 'Python link resolves outside root')
        assert.equal(identity(await fs.lstat(absolute, { bigint: true })), identity(stat))
        entries.push({ path: entryPath, kind: 'symlink', target, identity: identity(stat) })
      } else {
        assert.ok(stat.isFile(), `Special source entry forbidden: ${absolute}`)
        const file = await stableFile(absolute)
        entries.push({
          path: entryPath,
          kind: 'file',
          sha256: file.sha256,
          sizeBytes: file.sizeBytes,
          executable: file.executable,
          identity: file.identity,
        })
      }
      assert.ok(entries.length <= 20_000, 'Harness inventory entry bound exceeded')
    }
    assert.equal(
      identity(await fs.lstat(directory, { bigint: true })),
      before,
      'Source tree changed',
    )
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
      await stableFile(path.join(sourceRoot, entry.path), destination, entry)
      descriptors.push({
        path: `${prefix}/${entry.path}`,
        kind: 'file',
        sha256: entry.sha256,
        sizeBytes: entry.sizeBytes,
        executable: entry.executable,
      })
    }
  }
  return descriptors
}

async function copyFile(source, destination, relative, expected) {
  const file = await stableFile(source, destination, expected)
  return {
    path: relative,
    kind: 'file',
    sha256: file.sha256,
    sizeBytes: file.sizeBytes,
    executable: file.executable,
  }
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
        const workerRelative =
          entry.fileName.startsWith('imagegen_worker/') && !entry.fileName.endsWith('/')
            ? entry.fileName.slice('imagegen_worker/'.length)
            : null
        if (!isMetadata && !workerRelative) return zip.readEntry()
        if (entry.fileName.startsWith('/') || entry.fileName.split('/').includes('..')) {
          zip.close()
          reject(new Error('Unsafe wheel ZIP path'))
          return
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError)
          const chunks = []
          let size = 0
          stream.on('error', reject)
          stream.on('data', (chunk) => {
            size += chunk.length
            if (size > (isMetadata ? 256 * 1024 : 16 * 1024 ** 2))
              stream.destroy(new Error('Wheel entry exceeds bound'))
            else chunks.push(chunk)
          })
          stream.on('end', () => {
            const entryBytes = Buffer.concat(chunks)
            if (isMetadata) metadata.push(entryBytes.toString('utf8'))
            else {
              totalWorkerBytes += entryBytes.length
              if (totalWorkerBytes > 64 * 1024 ** 2 || Object.hasOwn(workerFiles, workerRelative)) {
                zip.close()
                reject(new Error('Worker wheel payload exceeds bound or contains duplicate entry'))
                return
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
          resolve({
            distribution: normalizedDistribution(nameField),
            version,
            entries,
            workerFiles,
            metadataSha256: sha256(Buffer.from(metadata[0])),
          })
        } catch (validationError) {
          reject(validationError)
        }
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
  try {
    return (await fs.readFile(path.join(git, ref), 'utf8')).trim()
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    const packed = await fs.readFile(path.join(git, 'packed-refs'), 'utf8')
    const found = packed.split('\n').find((line) => line.endsWith(` ${ref}`))
    assert.ok(found, `Missing Git ref ${ref}`)
    return found.split(' ')[0]
  }
}

async function freezeOwners() {
  const owners = [
    'scripts/qualify-runtime-offline.mjs',
    'scripts/qualify-runtime-offline.test.mjs',
    'package.json',
    'worker-python/uv.lock',
    'worker-python/pyproject.toml',
    'src/main/runtime/index.ts',
    'src/main/runtime/runtime-installation-manager.test.ts',
    'src/main/app-paths.ts',
    'src/main/runtime/runtime-release.ts',
    'src/main/runtime/offline-runtime-assembly.ts',
    'src/main/runtime/runtime-installation.ts',
    'src/main/projects/worker-client.ts',
    'src/main/runtime/runtime-host-preflight.ts',
    'worker-python/src/imagegen_worker/runtime_dependencies.py',
    'src/main/projects/generation-worker-client.ts',
    'src/main/projects/inference-worker-ownership.ts',
    'src/shared/projects/inference-worker-capabilities.ts',
    ...(fullEngine ? engineOwnerPaths : []),
  ]
  const python = await inventory(path.join(repository, 'worker-python/src/imagegen_worker'))
  const files = []
  for (const name of owners) {
    const entry = await stableBytes(path.join(repository, name))
    files.push({ path: name, sha256: sha256(entry.bytes), identity: entry.identity })
  }
  return { head: await repositoryHead(repository), files, python }
}

async function engineInputs(args) {
  await canonicalDirectory(args['transport-dir'])
  assert.equal(await fs.realpath(args['trusted-keys']), args['trusted-keys'])
  assert.equal(await fs.realpath(args['lama-source']), args['lama-source'])
  const keys = await stableBytes(args['trusted-keys'], 128 * 1024)
  const trustedKeys = JSON.parse(keys.bytes.toString('utf8'))
  assert.ok(trustedKeys && typeof trustedKeys === 'object' && !Array.isArray(trustedKeys))
  if (engineTransport) await engineTransport.verifyCompleteTransportSnapshot()
  else {
    engineTrustedKeys = Object.freeze({ ...trustedKeys })
    engineTransport = await verifyRuntimeTransport({
      appVersion: args['app-version'],
      directory: args['transport-dir'],
      trustedKeys: engineTrustedKeys,
    })
  }
  const inner = await stableBytes(
    path.join(args['transport-dir'], 'runtime-release.json'),
    1024 ** 2,
  )
  const outer = await stableBytes(
    path.join(args['transport-dir'], 'runtime-transport.json'),
    1024 ** 2,
  )
  const archive = await fs.lstat(path.join(args['transport-dir'], 'runtime-payload.zip'), {
    bigint: true,
  })
  const lama = await stableFile(args['lama-source'])
  assert.equal(lama.sha256, LAMA_OUTPAINT_ARTIFACT.sha256)
  assert.equal(lama.sizeBytes, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
  return {
    keys: { path: args['trusted-keys'], identity: keys.identity, sha256: sha256(keys.bytes) },
    transport: {
      directory: args['transport-dir'],
      manifest: engineTransport.manifest,
      archiveIdentity: identity(archive),
      inner: { identity: inner.identity, sha256: sha256(inner.bytes) },
      outer: { identity: outer.identity, sha256: sha256(outer.bytes) },
    },
    lama: { path: args['lama-source'], ...lama },
    wheelhouseProof: (await fullWheelhouseProof(args)).files,
  }
}

async function cgroupProof(pid) {
  const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8')
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
  const cgroup = (await fs.readFile(`/proc/${pid}/cgroup`, 'utf8')).trim()
  const group = cgroup
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3)
  assert.ok(group && group !== '/' && path.isAbsolute(group) && path.normalize(group) === group)
  const root = `/sys/fs/cgroup${group}`
  const memoryMax = (await fs.readFile(path.join(root, 'memory.max'), 'utf8')).trim()
  const swapMax = (await fs.readFile(path.join(root, 'memory.swap.max'), 'utf8')).trim()
  const maximumGiB = fullInference ? 8n : 4n
  assert.ok(
    /^\d+$/.test(memoryMax) &&
      BigInt(memoryMax) > 0n &&
      BigInt(memoryMax) <= maximumGiB * 1024n ** 3n,
    `Actual CLI/worker cgroup must already have MemoryMax <=${maximumGiB} GiB`,
  )
  assert.equal(swapMax, '0', 'Actual CLI/worker cgroup must already have MemorySwapMax=0')
  return {
    pid,
    startTicks: fields[19],
    processGroup: Number(fields[2]),
    group,
    memoryMax,
    swapMax,
    memoryCurrent: (await fs.readFile(path.join(root, 'memory.current'), 'utf8')).trim(),
    memoryStat: await fs.readFile(path.join(root, 'memory.stat'), 'utf8'),
    memoryEvents: await fs.readFile(path.join(root, 'memory.events'), 'utf8'),
  }
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
  try {
    result.evidence = await operation()
    result.outcome = 'PASS'
  } catch (error) {
    result.outcome = 'FAIL'
    result.error = errorSummary(error)
    throw error
  } finally {
    result.finishedAt = new Date().toISOString()
  }
}

function errorSummary(error) {
  return {
    name: error?.name,
    code: error?.code,
    message: String(error?.message ?? error),
    exitConfirmed: error?.exitConfirmed,
    recoveryRequired: error?.recoveryRequired,
    stack: error?.stack,
  }
}

async function commandObserver(command) {
  const receipt = {
    executable: command.executable,
    args: [...command.args],
    cwd: command.cwd,
    logPath: command.logPath,
    startedAt: new Date().toISOString(),
    environment: { ...command.environment },
    executor: 'production runOfflineRuntimeCommand; unchanged command/result',
    physicalExitBoundary:
      'Default executor owns detached process group; returns only after child close and group absence.',
  }
  report.commands.push(receipt)
  try {
    const result = await runOfflineRuntimeCommand(command)
    Object.assign(receipt, {
      code: result.code,
      exitConfirmed: result.exitConfirmed,
      stdout: result.stdout,
      stderr: result.stderr,
      stdoutBytes: Buffer.byteLength(result.stdout),
      stderrBytes: Buffer.byteLength(result.stderr),
      stdoutSha256: sha256(Buffer.from(result.stdout)),
      stderrSha256: sha256(Buffer.from(result.stderr)),
    })
    assert.equal(result.exitConfirmed, true)
    return result
  } catch (error) {
    receipt.error = errorSummary(error)
    throw error
  } finally {
    receipt.finishedAt = new Date().toISOString()
    const log = await stableBytes(command.logPath)
    receipt.log = { sha256: sha256(log.bytes), sizeBytes: log.bytes.length }
  }
}

async function fullInstalledChecks({ roots, backend, startInference, review, wheelhouseProof }) {
  const expectedPackages = wheelhouseProof.plan.wheels
    .map((entry) => [entry.distribution, entry.version])
    .sort()
  await check('actual-full-offline-install-pre-and-post-activation-qualification', async () => {
    const result = value(await manager.install(review.token))
    report.installResult = result
    assert.equal(result.kind, 'ready')
    assert.equal(result.profile, 'linux-nvidia')
    assert.ok(prepared)
    assert.equal(result.runtimeId, prepared.runtimeId)
    assert.equal(
      report.cpuClients.length,
      2,
      'CPU qualification must run before and after activation',
    )
    assert.equal(
      report.inferenceStarts.length,
      2,
      'Inference qualification must run before and after activation',
    )
    assert.ok(
      report.cpuClients.every(
        (entry) => entry.selfTest && entry.exitConfirmed && !entry.forcedTermination,
      ),
    )
    assert.ok(
      report.inferenceStarts.every(
        (entry) => entry.ready && entry.exitConfirmed && !entry.forcedTermination,
      ),
    )
    assert.ok(report.commands.length >= 6)
    assert.ok(report.commands.every((entry) => entry.code === 0 && entry.exitConfirmed))
    const inspection = report.commands
      .map((entry) => {
        try {
          return JSON.parse(entry.stdout)
        } catch {
          return null
        }
      })
      .find((entry) => entry?.packages && entry?.workerFiles)
    assert.ok(inspection)
    assert.deepEqual(
      inspection.packages
        .map((entry) => [normalizedDistribution(entry.name), entry.version])
        .sort(),
      expectedPackages,
    )
    const provenancePath = path.join(prepared.environmentRoot, 'runtime-installation.json')
    const provenance = JSON.parse((await stableBytes(provenancePath)).bytes.toString('utf8'))
    assert.equal(provenance.runtimeId, prepared.runtimeId)
    assert.equal(provenance.releaseId, report.signedRelease.manifest.releaseId)
    assert.equal(provenance.manifestSha256, report.signedRelease.manifestSha256)
    assert.equal(provenance.dependencyCheck?.status, 'ok')
    assert.equal(provenance.dependencyCheck?.policy, 'invoke-inference-v1')
    assert.equal(provenance.dependencyCheck?.packageCount, 67)
    assert.deepEqual(provenance.dependencyCheck?.excludedDependencies, ['notebook'])
    assert.deepEqual(provenance.dependencyCheck?.rootExtras, ['inference'])
    assert.deepEqual(provenance.workerFiles, inspection.workerFiles)
    assert.deepEqual(provenance.packages, inspection.packages)
    report.installedInspection = inspection
    report.installationProvenance = {
      path: provenancePath,
      sha256: sha256((await stableBytes(provenancePath)).bytes),
      value: provenance,
    }
    for (const parent of [roots.pythonDir, roots.environmentsDir]) {
      await absent(path.join(parent, prepared.runtimeId, OFFLINE_RUNTIME_INCOMPLETE_MARKER))
    }
    const pointer = JSON.parse((await stableBytes(roots.pointerFile)).bytes.toString('utf8'))
    assert.deepEqual(pointer, {
      schemaVersion: 1,
      runtimeId: prepared.runtimeId,
      pythonExecutable: prepared.pythonExecutable,
    })
    const journal = JSON.parse(
      (await stableBytes(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL))).bytes.toString(
        'utf8',
      ),
    )
    assert.equal(journal.phase, 'complete')
    await absent(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_CLAIM))
    await absent(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_RECOVERY_CLAIM))
    report.activatedPointer = pointer
    report.completedJournal = journal
    const hostLogs = (await fs.readdir(roots.workerLogsDir)).filter((name) =>
      name.startsWith('runtime-host-'),
    )
    assert.equal(hostLogs.length, 1, 'The default real host preflight must run once')
    report.hostPreflightLogs = await Promise.all(
      hostLogs.map(async (name) => {
        const entry = await stableBytes(path.join(roots.workerLogsDir, name))
        return {
          path: name,
          sizeBytes: entry.bytes.length,
          sha256: sha256(entry.bytes),
          bytes: entry.bytes.toString('utf8'),
        }
      }),
    )
    report.hostFacts = {
      platform: process.platform,
      arch: process.arch,
      glibcVersion: process.report.getReport().header.glibcVersionRuntime,
    }
    report.signedRelease.hostMetadataQualified =
      'Actual default preflight on this host only; no support matrix'
    return {
      result,
      packages: inspection.packages.length,
      workerFiles: Object.keys(inspection.workerFiles).length,
      preAndPostCpuClients: 2,
      preAndPostInferenceClients: 2,
      pointer,
      journalPhase: journal.phase,
      dependencyCheck: provenance.dependencyCheck,
    }
  })
  const pointerBytes = (await stableBytes(roots.pointerFile)).bytes
  await check(
    'new-runtime-manager-resolves-installed-cpu-and-performs-fresh-native-status',
    async () => {
      const scratch = path.join(roots.appDataDir, 'scratch')
      await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
      const fresh = new RuntimeManager(
        roots,
        { platform: 'linux', arch: 'x64' },
        startInference,
        backend,
      )
      try {
        const beforeInference = report.inferenceStarts.length
        const status = value(await fresh.getStatus())
        assert.equal(status.kind, 'ready')
        assert.equal(status.runtimeId, prepared.runtimeId)
        assert.equal(
          report.inferenceStarts.length,
          beforeInference + 1,
          'New manager must not inherit the installation cache',
        )
        const resolved = await fresh.resolveInstalledProjectWorker(scratch)
        assert.ok(resolved)
        assert.equal(resolved.location.pythonExecutable, prepared.pythonExecutable)
        const cpu = await backend.startProjectClient(resolved.location, {
          environment: resolved.environment,
        })
        try {
          await cpu.selfTest()
        } finally {
          await cpu.close()
        }
        report.reopenedStatus = status
        report.resolvedInstalledCpu = resolved
        return {
          status,
          actualAdditionalInferenceClients: 1,
          actualAdditionalCpuClients: 1,
          cpuResolvedAtInstalledFinalPath: true,
        }
      } finally {
        fresh.preventNewGenerationWork()
      }
    },
  )
  await check('installed-native-cuda-allocation-fill-kernel-and-runtime-facts', async () => {
    const logPath = path.join(roots.workerLogsDir, 'installed-native-smoke.log')
    await fs.writeFile(logPath, '', { flag: 'wx', mode: 0o600 })
    // Invoke tests/family_e2e/test_gpu_memory.py CUDA_CHILD: allocation/fill/sync,
    // deliberately scaled to16 elements. This does not replace a model inference gate.
    const source =
      "import importlib.metadata,json,torch; assert torch.cuda.is_available(); torch.zeros(1,device='cuda'); torch.cuda.synchronize(); x=torch.empty(16,device='cuda'); x.fill_(1); torch.cuda.synchronize(); assert x.sum().item()==16; print(json.dumps({'pythonRuntime':'installed-final-slot','torch':importlib.metadata.version('torch'),'torchvision':importlib.metadata.version('torchvision'),'buildCuda':torch.version.cuda,'hip':torch.version.hip,'gpuName':torch.cuda.get_device_name(0),'gpuSm':list(torch.cuda.get_device_capability(0)),'cudnn':torch.backends.cudnn.version(),'compiledArchitectures':torch.cuda.get_arch_list(),'allocatedBytes':torch.cuda.memory_allocated(),'reservedBytes':torch.cuda.memory_reserved(),'kernelSum':x.sum().item()})); del x; torch.cuda.empty_cache(); torch.cuda.synchronize()"
    const result = await commandObserver({
      executable: prepared.pythonExecutable,
      cwd: roots.runtimeDir,
      environment: prepared.environment,
      logPath,
      args: ['-I', '-B', '-c', source],
    })
    assert.equal(result.code, 0)
    const native = JSON.parse(result.stdout)
    assert.equal(native.torch.split('+')[0], '2.7.1')
    assert.equal(native.torchvision.split('+')[0], '0.22.1')
    assert.equal(native.buildCuda, '12.6')
    assert.equal(native.hip, null)
    assert.deepEqual(native.gpuSm, [8, 9], 'This qualification fixture is scoped to SM89')
    assert.ok(Number.isInteger(native.cudnn) && native.cudnn > 0)
    assert.ok(
      Array.isArray(native.compiledArchitectures) && native.compiledArchitectures.length > 0,
    )
    assert.equal(native.kernelSum, 16)
    report.nativeSmoke = {
      facts: native,
      exitConfirmed: result.exitConfirmed,
      scope: 'Tiny installed CUDA kernel smoke, not image/model inference or the release matrix.',
    }
    return report.nativeSmoke
  })
  await check(
    'cuda-hidden-startup-refuses-with-pointer-preserved-and-unmasked-neighbor-ready',
    async () => {
      const location = {
        pythonExecutable: prepared.pythonExecutable,
        runtimeRoot: roots.runtimeDir,
        scratchBasePath: path.join(roots.appDataDir, 'scratch'),
      }
      let unexpected
      let refusal
      try {
        unexpected = await startInference(location, {
          ...prepared.environment,
          CUDA_VISIBLE_DEVICES: '',
        })
        assert.fail('A CUDA-hidden installed worker must not advertise inference ready')
      } catch (error) {
        assert.equal(error.code, 'WORKER_EXITED')
        refusal = errorSummary(error)
      } finally {
        await unexpected?.close()
      }
      assert.equal(GenerationWorkerClient.hasUnconfirmedStartExit(), false)
      assert.deepEqual((await stableBytes(roots.pointerFile)).bytes, pointerBytes)
      const neighbor = await startInference(location, prepared.environment)
      try {
        assert.equal(neighbor.ready.workerVersion, '0.14.0')
      } finally {
        await neighbor.close()
      }
      assert.deepEqual((await stableBytes(roots.pointerFile)).bytes, pointerBytes)
      return {
        refusal,
        failedStartFenceClear: true,
        pointerUnchanged: true,
        unmaskedNeighborReady: true,
      }
    },
  )
  await check('one-use-review-complete-journal-and-only-owned-final-slot', async () => {
    const consumed = await manager.install(review.token)
    assert.equal(consumed.ok, false)
    assert.equal(consumed.error.code, 'RUNTIME_INVALID_REVIEW')
    assert.deepEqual(await fs.readdir(roots.pythonDir), [prepared.runtimeId])
    assert.deepEqual(await fs.readdir(roots.environmentsDir), [prepared.runtimeId])
    const journal = JSON.parse(
      (await stableBytes(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL))).bytes.toString(
        'utf8',
      ),
    )
    assert.equal(journal.phase, 'complete')
    assert.deepEqual((await stableBytes(roots.pointerFile)).bytes, pointerBytes)
    await absent(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_CLAIM))
    await absent(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_RECOVERY_CLAIM))
    return {
      consumed,
      runtimeId: prepared.runtimeId,
      journalPhase: journal.phase,
      pointerSha256: sha256(pointerBytes),
      slotRetainedForOwningAudit: true,
    }
  })
  report.fullProfileQualified = {
    profile: 'linux-nvidia',
    scope: 'python-runtime-slot',
    runtimeId: prepared.runtimeId,
    hostOnly: true,
    auxiliaryQualified: false,
    publisherTrustQualified: false,
    modelInferenceQualified: false,
  }
}

async function fullEngineInstalledChecks({ roots, installOnly }) {
  await check('installed-pinned-lama-native-cuda-infill-smoke', async () => {
    const resource = await engineResources.resolveVerifiedOutpaintInfill()
    assert.equal(report.auxiliary.copies.length, 1)
    const output = path.join(payloadRoot, 'installed-lama-smoke.png')
    await absent(output)
    const logPath = path.join(roots.workerLogsDir, 'installed-lama-smoke.log')
    await fs.writeFile(logPath, '', { flag: 'wx', mode: 0o600 })
    const source = [
      'import hashlib,json,sys,torch',
      'from pathlib import Path',
      'from PIL import Image',
      'from imagegen_worker.derivatives import SRGB_ICC_PROFILE',
      'from imagegen_worker.lama_infill import load_local_lama',
      'torch.cuda.set_per_process_memory_fraction(0.75)',
      "source=Image.new('RGBA',(64,64),(12,34,56,0))",
      "source.paste(Image.new('RGBA',(32,32),(180,90,40,255)),(16,16))",
      "source.info['icc_profile']=SRGB_ICC_PROFILE",
      'original=source.tobytes()',
      `model=load_local_lama(Path(sys.argv[1]),expected_sha256='${LAMA_OUTPAINT_ARTIFACT.sha256}',expected_byte_size=${LAMA_OUTPAINT_ARTIFACT.sizeBytes},device='cuda')`,
      'result=model.infill_processing_source(source)',
      'torch.cuda.synchronize()',
      "assert result.mode=='RGB' and result.size==(64,64)",
      "assert result.info.get('icc_profile')==SRGB_ICC_PROFILE",
      "assert source.mode=='RGBA' and source.size==(64,64) and source.tobytes()==original and source.info.get('icc_profile')==SRGB_ICC_PROFILE",
      "with open(sys.argv[2],'xb') as output: result.save(output,format='PNG',icc_profile=SRGB_ICC_PROFILE)",
      "print(json.dumps({'device':'cuda','allocatorFraction':0.75,'size':list(result.size),'mode':result.mode,'sourceUnchanged':True,'srgb':True,'pngSha256':hashlib.sha256(Path(sys.argv[2]).read_bytes()).hexdigest(),'scope':'installed LaMa TorchScript compute only; no diffusion or visual acceptance'}))",
    ].join('\n')
    const result = await commandObserver({
      executable: prepared.pythonExecutable,
      cwd: roots.runtimeDir,
      environment: prepared.environment,
      logPath,
      args: ['-I', '-B', '-c', source, resource.managedPath, output],
    })
    assert.equal(result.code, 0)
    const facts = JSON.parse(result.stdout)
    const png = await stableBytes(output, 1024 ** 2)
    assert.equal(facts.pngSha256, sha256(png.bytes))
    assert.deepEqual(facts.size, [64, 64])
    assert.equal(facts.mode, 'RGB')
    assert.equal(facts.sourceUnchanged, true)
    assert.equal(facts.srgb, true)
    await backendAuxiliaryVerified()
    report.nativeLamaSmoke = {
      facts,
      output,
      sha256: sha256(png.bytes),
      sizeBytes: png.bytes.length,
      exitConfirmed: result.exitConfirmed,
    }
    return report.nativeLamaSmoke
  })
  if (installOnly) {
    assert.deepEqual(
      report.assembledSlots.map(({ runtimeId }) => runtimeId),
      [prepared.runtimeId],
    )
    assert.ok(
      report.cpuClients.every(({ ready }) => ready.capabilities.includes('export-composition')),
      'The installed CPU worker must support packaged Project image export',
    )
    report.fullProfileQualified = {
      ...report.fullProfileQualified,
      scope: 'engine',
      auxiliaryQualified: true,
      nativeLamaComputeQualified: true,
      controlledAuxiliaryTransport: 'explicit pinned local copy port; not public HTTP',
    }
    return
  }
  await check('native-engine-repair-builds-new-slot-and-reuses-exact-lama', async () => {
    const previous = (await stableBytes(roots.pointerFile)).bytes
    const old = JSON.parse(previous.toString('utf8'))
    const review = value(await manager.previewInstallation('repair'))
    assert.equal(review.scope, 'engine')
    assert.equal(review.requiredFreeBytes, null)
    assert.equal(review.plan.totals.downloadBytes, 0)
    assert.equal(review.plan.totals.additionalInstalledBytes, null)
    assert.equal(review.plan.artifacts.find((entry) => entry.kind === 'runtime').reused, false)
    assert.equal(review.plan.artifacts.find((entry) => entry.kind === 'runtime').sourceCached, true)
    assert.equal(
      review.plan.artifacts.find((entry) => entry.kind === 'outpaint-infill').reused,
      true,
    )
    const cpuBefore = report.cpuClients.length
    const gpuBefore = report.inferenceStarts.length
    const result = value(await manager.repair(review.token))
    assert.equal(result.kind, 'ready')
    assert.notEqual(result.runtimeId, old.runtimeId)
    assert.equal(result.runtimeId, prepared.runtimeId)
    assert.equal(report.cpuClients.length, cpuBefore + 2)
    assert.equal(report.inferenceStarts.length, gpuBefore + 2)
    assert.ok(
      report.cpuClients
        .slice(cpuBefore)
        .every((entry) => entry.selfTest && entry.exitConfirmed && !entry.forcedTermination),
    )
    assert.ok(
      report.inferenceStarts
        .slice(gpuBefore)
        .every((entry) => entry.ready && entry.exitConfirmed && !entry.forcedTermination),
    )
    const pointerBytes = (await stableBytes(roots.pointerFile)).bytes
    const pointer = JSON.parse(pointerBytes.toString('utf8'))
    assert.equal(pointer.runtimeId, result.runtimeId)
    assert.equal((await manager.repair(review.token)).error.code, 'RUNTIME_INVALID_REVIEW')
    assert.deepEqual((await stableBytes(roots.pointerFile)).bytes, pointerBytes)
    const provenance = await stableBytes(
      path.join(prepared.environmentRoot, 'runtime-installation.json'),
    )
    const record = JSON.parse(provenance.bytes.toString('utf8'))
    assert.equal(record.releaseId, report.signedRelease.manifest.releaseId)
    assert.equal(record.manifestSha256, report.signedRelease.manifestSha256)
    assert.equal(record.dependencyCheck.packageCount, 67)
    const packageIdentities = (packages) =>
      packages.map((entry) => [normalizedDistribution(entry.name), entry.version]).sort()
    assert.deepEqual(
      packageIdentities(record.packages),
      packageIdentities(report.installedInspection.packages),
    )
    assert.ok(
      record.packages.every(
        (entry) =>
          within(prepared.environmentRoot, entry.root) && !entry.direct?.dir_info?.editable,
      ),
    )
    assert.deepEqual(record.workerFiles, report.installedInspection.workerFiles)
    assert.equal(report.auxiliary.copies.length, 1)
    await backendAuxiliaryVerified()
    report.repairInstallationProvenance = {
      path: path.join(prepared.environmentRoot, 'runtime-installation.json'),
      sha256: sha256(provenance.bytes),
      value: record,
    }
    report.repairResult = {
      result,
      previousPointer: old,
      pointer,
      provenanceSha256: sha256(provenance.bytes),
      preAndPostCpuClients: 2,
      preAndPostInferenceClients: 2,
      lamaCopies: 1,
    }
    return report.repairResult
  })
  const success = prepared
  await check(
    'native-postactivation-cuda-refusal-rolls-back-repair-and-preserves-lama',
    async () => {
      const previous = (await stableBytes(roots.pointerFile)).bytes
      const review = value(await manager.previewInstallation('repair'))
      assert.equal(review.scope, 'engine')
      assert.equal(review.plan.totals.downloadBytes, 0)
      const cpuBefore = report.cpuClients.length
      const gpuBefore = report.inferenceStarts.length
      let result
      try {
        failEngineAfterActivation = true
        result = await manager.repair(review.token)
        assert.equal(result.ok, false)
        assert.equal(result.error.code, 'RUNTIME_INSTALL_FAILED')
        report.failedRepairPrepared = prepared
        assert.notEqual(prepared.runtimeId, success.runtimeId)
      } finally {
        failEngineAfterActivation = false
        prepared = success
        report.assembled = success
      }
      assert.equal(report.cpuClients.length, cpuBefore + 2)
      assert.equal(report.inferenceStarts.length, gpuBefore + 2)
      assert.ok(
        report.cpuClients
          .slice(cpuBefore)
          .every((entry) => entry.exitConfirmed && !entry.forcedTermination),
      )
      const [pre, post] = report.inferenceStarts.slice(gpuBefore)
      assert.ok(pre.ready && pre.exitConfirmed && !pre.forcedTermination)
      assert.equal(post.controlledFault, 'CUDA hidden after candidate pointer activation only')
      assert.equal(post.error.code, 'WORKER_EXITED')
      assert.equal(post.exitFenceClear, true)
      // The production client deliberately exposes a generic failed-start error. Observe the
      // exact CUDA-unavailable reason separately with the same failed slot/environment, rather
      // than presenting import failure, crash or OOM as the intended refusal.
      const diagnosticLog = path.join(roots.workerLogsDir, 'failed-repair-cuda-diagnostic.log')
      await fs.writeFile(diagnosticLog, '', { flag: 'wx', mode: 0o600 })
      const diagnostic = await commandObserver({
        executable: report.failedRepairPrepared.pythonExecutable,
        cwd: roots.runtimeDir,
        environment: { ...report.failedRepairPrepared.environment, CUDA_VISIBLE_DEVICES: '' },
        logPath: diagnosticLog,
        args: ['-I', '-B', '-m', 'imagegen_worker.inference_main'],
      })
      assert.equal(diagnostic.code, 78)
      assert.match(diagnostic.stderr, /Inference startup failed: A CUDA GPU is unavailable\./)
      assert.equal(diagnostic.stdout, '')
      assert.deepEqual((await stableBytes(roots.pointerFile)).bytes, previous)
      const journal = JSON.parse(
        (
          await stableBytes(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL))
        ).bytes.toString('utf8'),
      )
      assert.equal(journal.phase, 'rolled-back')
      assert.equal(journal.prepared.runtimeId, report.failedRepairPrepared.runtimeId)
      await absent(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_CLAIM))
      await absent(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_RECOVERY_CLAIM))
      assert.equal(GenerationWorkerClient.hasUnconfirmedStartExit(), false)
      assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
      assert.equal(report.auxiliary.copies.length, 1)
      await backendAuxiliaryVerified()
      const beforeStatus = report.inferenceStarts.length
      const status = value(await manager.getStatus())
      assert.equal(status.kind, 'ready')
      assert.equal(status.runtimeId, success.runtimeId)
      assert.equal(report.inferenceStarts.length, beforeStatus + 1)
      assert.deepEqual((await stableBytes(roots.pointerFile)).bytes, previous)
      assert.equal((await manager.repair(review.token)).error.code, 'RUNTIME_INVALID_REVIEW')
      const slots = report.assembledSlots.map((entry) => entry.runtimeId).sort()
      assert.equal(slots.length, 3)
      assert.deepEqual((await fs.readdir(roots.pythonDir)).sort(), slots)
      assert.deepEqual((await fs.readdir(roots.environmentsDir)).sort(), slots)
      report.failedRepairResult = {
        result,
        status,
        pointerSha256: sha256(previous),
        journal,
        originalActiveRuntimeId: success.runtimeId,
        lamaCopies: 1,
        exactPointerRollback: true,
        cudaUnavailableDiagnostic: {
          code: diagnostic.code,
          stderrSha256: sha256(Buffer.from(diagnostic.stderr)),
          exitConfirmed: diagnostic.exitConfirmed,
          scope:
            'Separate same-slot hidden-CUDA diagnostic; not stderr of the original manager start.',
        },
      }
      return report.failedRepairResult
    },
  )
  report.fullProfileQualified = {
    ...report.fullProfileQualified,
    scope: 'engine',
    runtimeId: success.runtimeId,
    auxiliaryQualified: true,
    nativeLamaComputeQualified: true,
    successfulRepairQualified: true,
    postActivationRollbackQualified: true,
    controlledAuxiliaryTransport: 'explicit pinned local copy port; not public HTTP',
  }
}

async function backendAuxiliaryVerified() {
  const resource = await engineResources.resolveVerifiedOutpaintInfill()
  assert.equal(resource.sha256, LAMA_OUTPAINT_ARTIFACT.sha256)
  assert.equal(resource.byteSize, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
  return resource
}

async function main(argv) {
  const args = argumentsFrom(argv)
  inputArguments = args
  const installOnly = args.profile === 'full-engine-install'
  fullEngine = engineProfiles.has(args.profile)
  fullInference = args.profile === 'full-inference' || fullEngine
  if (fullInference) {
    report.qualification = 'actual-full-offline-python-slot-install-native-qualification'
    report.controlledPorts.host =
      'Default production Main host preflight; no controlled OS/libc/driver/SM facts.'
    report.negativeScope = [
      'Python-runtime-slot qualification on this host only; no shipped publisher trust root or support matrix.',
      'Auxiliary LaMa is an explicit no-op; no full Engine Setup or complete engine preview/download.',
      'No model weights, image generation, visual acceptance, second install/repair or previous-runtime rollback proof.',
      'No ordinary app data or existing SHARED runtime/catalog/models are inspected or changed.',
      'The owned slot is left at its final path for the Root retention/audit owner; this harness never deletes it.',
    ]
  }
  if (fullEngine) {
    report.qualification = installOnly
      ? 'actual-signed-full-engine-install-native-qualification'
      : 'actual-signed-full-engine-install-repair-native-qualification'
    report.controlledPorts.auxiliary =
      'Production pinned installer/resolver; controlled stable-file copy transport from an explicit hash-verified local LaMa source. No public HTTP qualification.'
    report.controlledPorts.releaseTrust =
      'Explicit external public qualification keyring and unchanged retained signed transport; no new key, release ID or signature.'
    report.negativeScope = [
      installOnly
        ? 'Host-scoped signed local engine installation; no shipped key distribution, public release endpoint, public Setup or support matrix.'
        : 'Host-scoped signed local engine installation/repair; no shipped key distribution, public release endpoint, public Setup or support matrix.',
      'Real native worker startup and tiny CUDA/LaMa smoke only; no diffusion models, image-generation or visual acceptance.',
      installOnly
        ? 'One installed slot at its packaged app data path; Repair, rollback and the packaged application are outside this run.'
        : 'The last Repair injects CUDA-hidden startup only after candidate activation; native readiness is never fabricated.',
      'Only the explicit original LaMa file and signed transport/proof are read; existing runtime/model/project state remains unchanged.',
      'All new sources/slots and exact mutation controls are retained for Root audit and cleanup; this harness never deletes them.',
    ]
  }
  assert.equal(process.platform, 'linux')
  assert.equal(process.arch, 'x64')
  await canonicalDirectory(artifactRoot)
  await canonicalDirectory(path.dirname(args['report-file']))
  assert.ok(
    within(path.join(artifactRoot, 'runs'), args['report-file']),
    'Report must be in an owned RUN',
  )
  await absent(args['report-file'])
  reportFile = args['report-file']
  let uvInput
  if (!fullEngine) {
    for (const key of ['python-root', 'config', 'wheels']) await canonicalDirectory(args[key])
    assert.equal(await fs.realpath(args.uv), args.uv, 'uv must be a canonical ordinary executable')
    uvInput = await stableBytes(args.uv)
    assert.ok(uvInput.executable)
  }
  const wheelhouseProof = fullInference ? await fullWheelhouseProof(args) : null
  if (wheelhouseProof) report.wheelhouseProof = wheelhouseProof
  report.processBoundary = await cgroupProof(process.pid)
  report.deadline = {
    seconds: 600,
    externalCgroupDeadlineRequired: true,
    aggregateGiB: fullInference ? 8 : 4,
    noKdeScope: 'CLI only; CPU and inference children must inherit this single aggregate cgroup.',
  }
  sourceFreeze = await freezeOwners()
  report.sourceBefore = sourceFreeze
  const invoke = path.resolve(repository, '../sources/InvokeAI')
  const launcher = path.resolve(repository, '../sources/launcher')
  report.sourceBasis = {
    invokeRevision: await repositoryHead(invoke),
    launcherRevision: await repositoryHead(launcher),
    invokePaths: [
      'invokeai/app/services/model_install/install_staging_ledger.py',
      'invokeai/app/services/model_install/model_install_default.py',
      'invokeai/backend/model_hash/model_hash.py',
      'invokeai/backend/model_manager/model_on_disk.py',
      'invokeai/app/util/startup_utils.py',
      'invokeai/app/run_app.py',
      'tests/family_e2e/test_gpu_memory.py',
      ...(fullEngine
        ? [
            'invokeai/backend/image_util/infill_methods/lama.py',
            'invokeai/app/invocations/infill.py',
            'invokeai/app/services/shared/invocation_context.py',
          ]
        : []),
    ],
    launcherPaths: ['download_uv.ts', 'src/main/install-manager.ts', 'src/main/index.ts'],
    adaptation:
      'Existing production release/assembly/transaction/worker owners; no alternative installer or worker.',
  }
  assert.equal(report.sourceBasis.invokeRevision, '4875d96531ca6712b288f6e660fcbb34143408c1')
  assert.equal(report.sourceBasis.launcherRevision, 'c267bdb439519216b277a7a8c6ad408b9d79efce')
  const payloads = path.join(path.dirname(reportFile), 'payloads')
  try {
    await mkdirNew(payloads)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    await canonicalDirectory(payloads)
  }
  payloadRoot = await fs.mkdtemp(path.join(payloads, 'native-runtime-offline-'))
  report.payloadRoot = payloadRoot
  let releaseDirectory
  if (!fullEngine) releaseDirectory = await mkdirNew(path.join(payloadRoot, 'signed-payload'))
  const xdgDataHome = path.join(payloadRoot, 'data')
  const packagedPaths = installOnly ? resolveAppPaths({ XDG_DATA_HOME: xdgDataHome }) : null
  const roots = await createRuntimeRoots(packagedPaths?.dataRoot ?? path.join(payloadRoot, 'app'))
  ensureAppPaths({
    dataRoot: roots.appDataDir,
    cacheRoot: roots.cacheDir,
    databaseRoot: path.join(roots.appDataDir, 'database'),
    logsRoot: roots.logsDir,
    runtimeRoot: roots.runtimeDir,
  })
  report.roots = roots
  if (packagedPaths) {
    assert.equal(roots.appDataDir, packagedPaths.dataRoot)
    report.packagedAppData = { xdgDataHome, dataRoot: roots.appDataDir }
  }
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
    manager?.cancelInstallation().catch((error) => {
      report.cancelError = errorSummary(error)
    })
  }, 600_000)
  deadlineTimer.unref()

  let selection
  if (fullEngine) {
    await check(
      'adopt-exact-signed-transport-and-native-wheelhouse-without-resigning',
      async () => {
        inputsFreeze = await engineInputs(args)
        report.inputsBefore = inputsFreeze
        selection = await extractRuntimeTransport({
          appVersion: args['app-version'],
          transportDirectory: args['transport-dir'],
          trustedKeys: engineTrustedKeys,
          outputDirectory: path.join(payloadRoot, 'extracted-transport'),
        })
        releaseDirectory = selection.directory
        const release = await verifyRuntimeRelease(selection)
        validateEngineRelease(release.manifest, wheelhouseProof.plan)
        const worker = release.manifest.wheels.find(
          (entry) => entry.distribution === 'imagegen-worker',
        )
        const metadata = await wheelMetadata(path.join(releaseDirectory, worker.path))
        const expected = Object.fromEntries(
          sourceFreeze.python.entries.map((entry) => {
            assert.equal(entry.kind, 'file')
            return [entry.path, { bytes: entry.sizeBytes, sha256: entry.sha256 }]
          }),
        )
        assert.deepEqual(
          metadata.workerFiles,
          expected,
          'Adopted worker wheel differs from current source',
        )
        report.wheelMetadata = [{ path: worker.path, ...metadata }]
        report.signedRelease = {
          manifest: release.manifest,
          manifestSha256: sha256(canonicalRuntimeReleaseJson(release.manifest)),
          envelopeSha256: sha256(selection.envelope),
          trustedKeys: engineTrustedKeys,
          keyScope: 'Explicit retained qualification keys; no private key read or new signature',
          hostMetadataQualified: false,
        }
        await release.verifyCompletePayloadSnapshot()
        return {
          adoptedExactInnerEnvelope: true,
          releaseId: release.manifest.releaseId,
          wheelCount: release.manifest.wheels.length,
          workerFiles: Object.keys(metadata.workerFiles).length,
          newReleaseSigning: false,
          transport: engineTransport.manifest,
        }
      },
    )
  } else
    await check('actual-source-copy-and-real-wheel-metadata', async () => {
      const python = await inventory(args['python-root'], true)
      const config = await inventory(args.config)
      const wheels = await inventory(args.wheels)
      assert.equal(
        wheels.entries.length,
        fullInference ? 67 : 2,
        'Only the exact supplied wheel set is allowed',
      )
      assert.deepEqual(
        config.entries.map((entry) => entry.path).sort(),
        Object.keys(PINNED_RUNTIME_CONFIG_FILES).sort(),
      )
      for (const entry of config.entries)
        assert.equal(entry.sha256, PINNED_RUNTIME_CONFIG_FILES[entry.path])
      inputsFreeze = {
        python,
        config,
        wheels,
        uv: { identity: uvInput.identity, sha256: sha256(uvInput.bytes) },
        ...(wheelhouseProof ? { wheelhouseProof: wheelhouseProof.files } : {}),
      }
      report.inputsBefore = inputsFreeze
      const files = await copyInventory(
        args['python-root'],
        path.join(releaseDirectory, 'python'),
        python,
        'python',
      )
      files.push(
        ...(await copyInventory(
          args.config,
          path.join(releaseDirectory, 'config'),
          config,
          'config',
        )),
      )
      files.push(
        await copyFile(args.uv, path.join(releaseDirectory, 'uv/uv'), 'uv/uv', {
          identity: uvInput.identity,
          sha256: sha256(uvInput.bytes),
        }),
      )
      const descriptors = []
      for (const wheel of wheels.entries) {
        assert.ok(wheel.kind === 'file' && wheel.path.endsWith('.whl') && !wheel.path.includes('/'))
        const planned = wheelhouseProof?.plan.wheels.find((entry) => entry.filename === wheel.path)
        if (fullInference) {
          assert.ok(planned, 'An input wheel is absent from the bound proof')
          assert.equal(wheel.sha256, planned.sha256)
          assert.equal(wheel.sizeBytes, planned.sizeBytes)
        }
        const metadata =
          !fullInference || planned.distribution === 'imagegen-worker'
            ? await wheelMetadata(path.join(args.wheels, wheel.path))
            : {
                distribution: planned.distribution,
                version: planned.version,
                metadataSha256: wheelhouseProof.verification.wheels.find(
                  (entry) => entry.filename === wheel.path,
                ).metadataSha256,
                basis:
                  'Actual prior byte/METADATA proof, exact plan binding and fresh streamed input hash; no new resolver.',
              }
        if (fullInference) {
          assert.equal(metadata.distribution, planned.distribution)
          assert.equal(metadata.version, planned.version)
        } else {
          assert.ok(
            (metadata.distribution === 'imagegen-worker' && metadata.version === '0.1.0') ||
              (metadata.distribution === 'pillow' && metadata.version === '12.2.0'),
          )
        }
        if (metadata.distribution === 'imagegen-worker') {
          const expected = Object.fromEntries(
            sourceFreeze.python.entries.map((entry) => {
              assert.equal(entry.kind, 'file', 'Worker source must contain ordinary files only')
              return [entry.path, { bytes: entry.sizeBytes, sha256: entry.sha256 }]
            }),
          )
          assert.deepEqual(
            metadata.workerFiles,
            expected,
            'Built worker wheel differs from current Python source',
          )
        }
        const descriptor = await copyFile(
          path.join(args.wheels, wheel.path),
          path.join(releaseDirectory, 'wheels', wheel.path),
          `wheels/${wheel.path}`,
          wheel,
        )
        files.push(descriptor)
        descriptors.push({
          path: descriptor.path,
          distribution: metadata.distribution,
          version: metadata.version,
          sha256: descriptor.sha256,
          sizeBytes: descriptor.sizeBytes,
        })
        report.wheelMetadata ??= []
        report.wheelMetadata.push({ path: descriptor.path, ...metadata })
      }
      assert.deepEqual(
        descriptors.map((wheel) => wheel.distribution).sort(),
        fullInference
          ? wheelhouseProof.plan.wheels.map((wheel) => wheel.distribution).sort()
          : ['imagegen-worker', 'pillow'],
      )
      const manifest = {
        schemaVersion: 1,
        appVersion: 'qualification-0.1.0',
        releaseId: `${fullInference ? 'full-native' : 'cpu-refusal'}-${randomUUID()}`,
        ...(fullInference ? { dependencyPolicy: 'invoke-inference-v1' } : {}),
        profile: 'linux-nvidia',
        configPath: 'config',
        requirementsPath: 'requirements.txt',
        python: {
          version: '3.12.13',
          buildId: 'cpython-3.12.13-local-readonly-qualification',
          executable: 'python/bin/python3.12',
        },
        uv: { version: '0.11.11', executable: 'uv/uv' },
        worker: {
          distribution: 'imagegen-worker',
          distributionVersion: '0.1.0',
          cpuVersion: '0.1.0',
          inferenceVersion: '0.14.0',
          protocolVersion: '1',
        },
        host: {
          os: 'linux',
          arch: 'x64',
          glibcMinimum: '2.28',
          cudaVersion: '12.6',
          minimumNvidiaDriver: '560.0',
          gpuArchitectures: ['sm_89'],
        },
        lockSha256: sha256(
          (await stableBytes(path.join(repository, 'worker-python/uv.lock'))).bytes,
        ),
        requiredFreeBytes: (fullInference ? 20 : 1) * 1024 ** 3,
        wheels: descriptors,
        files,
      }
      const requirements = Buffer.from(runtimeReleaseRequirements(manifest))
      await fs.writeFile(path.join(releaseDirectory, 'requirements.txt'), requirements, {
        flag: 'wx',
        mode: 0o600,
      })
      files.push({
        path: 'requirements.txt',
        kind: 'file',
        executable: false,
        sha256: sha256(requirements),
        sizeBytes: requirements.length,
      })
      files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
      const keys = generateKeyPairSync('ed25519')
      const payload = canonicalRuntimeReleaseJson(manifest)
      const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
      const keyId = fullInference ? 'ephemeral-full-inference' : 'ephemeral-cpu-refusal'
      const envelope = canonicalRuntimeReleaseJson({
        schemaVersion: 1,
        keyId,
        payload: payload.toString('base64'),
        signature: sign(null, payload, keys.privateKey).toString('base64'),
      })
      // The private key never leaves this local scope and is never serialized.
      await fs.writeFile(path.join(payloadRoot, 'qualification-public-key.pem'), publicKey, {
        flag: 'wx',
        mode: 0o600,
      })
      await fs.writeFile(path.join(payloadRoot, 'qualification-envelope.json'), envelope, {
        flag: 'wx',
        mode: 0o600,
      })
      selection = {
        appVersion: manifest.appVersion,
        directory: releaseDirectory,
        envelope,
        trustedKeys: { [keyId]: publicKey },
      }
      report.signedRelease = {
        manifest,
        manifestSha256: sha256(payload),
        envelopeSha256: sha256(envelope),
        publicKey,
        keyScope: 'This run only; private key not retained',
        hostMetadataQualified: false,
      }
      const verified = await verifyRuntimeRelease(selection)
      await verified.verifyCompletePayloadSnapshot()
      return {
        files: files.length,
        bytes: files
          .filter((entry) => entry.kind === 'file')
          .reduce((sum, entry) => sum + entry.sizeBytes, 0),
        configPins: config.entries.length,
        realWheels: descriptors,
      }
    })

  let currentSelection = selection
  const backend = {
    loadRelease: async () => currentSelection,
    ensureHostCompatible: async () => {
      assert.equal(process.platform, 'linux')
      assert.equal(process.arch, 'x64')
      report.controlledHostCalls = (report.controlledHostCalls ?? 0) + 1
    },
    ensureAuxiliaryReady: async () => {
      report.controlledAuxiliaryCalls = (report.controlledAuxiliaryCalls ?? 0) + 1
    },
    assemble: async (input) => {
      prepared = await assembleOfflineRuntime({ ...input, commandRunner: commandObserver })
      report.assembled = prepared
      if (fullEngine) {
        report.assembledSlots ??= []
        report.assembledSlots.push(prepared)
      }
      return prepared
    },
    startProjectClient: async (location, options) => {
      const client = await ProjectWorkerClient.start(location, options)
      liveCpuClients.add(client)
      const processProof = await cgroupProof(client.child.pid)
      assert.equal(
        processProof.group,
        report.processBoundary.group,
        'CPU child escaped the owned CLI cgroup',
      )
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
          receipt.closeMechanism =
            'Production ProjectWorkerClient.close -> fail(CLOSED) sends SIGTERM, awaits physical exit; no SIGKILL escalation accepted.'
          assert.equal(receipt.exitConfirmed, true)
          assert.equal(
            receipt.forcedTermination,
            false,
            'Forced CPU exit is not a successful qualification close',
          )
          assert.equal(receipt.signalCode, 'SIGTERM')
          assert.equal(receipt.exitCode, null)
          liveCpuClients.delete(client)
        },
      }
    },
  }
  if (fullInference) delete backend.ensureHostCompatible
  if (fullEngine) {
    const resourcesDirectory = await mkdirNew(path.join(roots.appDataDir, 'inference-resources'))
    engineResources = new InferenceAuxiliaryResources(resourcesDirectory)
    report.auxiliary = {
      source: args['lama-source'],
      resourcesDirectory,
      copies: [],
      verifications: [],
      scope: 'actual pinned resource publication/reuse; controlled local copy transport only',
    }
    backend.engine = {
      transportDirectory: args['transport-dir'],
      auxiliaryInstaller: createLamaAuxiliaryInstaller(resourcesDirectory, {
        download: async (input) => {
          assert.equal(input.source, 'invoke-lama')
          assert.equal(input.url, LAMA_OUTPAINT_ARTIFACT.url)
          assert.equal(input.expectedBytes, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
          assert.equal(input.expectedSha256, LAMA_OUTPAINT_ARTIFACT.sha256)
          assert.equal(input.bearerToken, undefined)
          if (input.signal?.aborted) throw new Error('LaMa copy canceled before acquisition')
          const stagingPath = path.join(input.stagingDirectory, `${randomUUID()}.part`)
          const copied = await stableFile(args['lama-source'], stagingPath, inputsFreeze.lama)
          report.auxiliary.copies.push({
            sha256: copied.sha256,
            sizeBytes: copied.sizeBytes,
            stagingPath,
          })
          input.onProgress?.({ downloadedBytes: copied.sizeBytes, totalBytes: copied.sizeBytes })
          return { sha256: copied.sha256, sizeBytes: copied.sizeBytes, stagingPath }
        },
      }),
    }
    backend.ensureAuxiliaryReady = async () => {
      const resource = await engineResources.resolveVerifiedOutpaintInfill()
      report.auxiliary.verifications.push({ ...resource, at: new Date().toISOString() })
    }
  }
  const startInference = async (location, environment) => {
    const receipt = { location, startedAt: new Date().toISOString(), environment }
    report.inferenceStarts.push(receipt)
    try {
      let actualEnvironment = environment
      if (fullEngine && failEngineAfterActivation) {
        const pointer = JSON.parse((await stableBytes(roots.pointerFile)).bytes.toString('utf8'))
        if (pointer.runtimeId === prepared.runtimeId) {
          actualEnvironment = { ...environment, CUDA_VISIBLE_DEVICES: '' }
          receipt.controlledFault = 'CUDA hidden after candidate pointer activation only'
          receipt.actualEnvironment = actualEnvironment
        }
      }
      const client = await GenerationWorkerClient.start(location, {
        environment: actualEnvironment,
      })
      if (fullInference) {
        liveInferenceClients.add(client)
        const processProof = await cgroupProof(client.child.pid)
        assert.equal(
          processProof.group,
          report.processBoundary.group,
          'Inference child escaped aggregate cgroup',
        )
        receipt.process = processProof
        receipt.ready = client.ready
        receipt.readyAt = new Date().toISOString()
        assert.equal(client.ready.workerVersion, '0.14.0')
        assert.equal(client.ready.protocolVersion, '1')
        assert.equal(client.ready.runtimeProfile, 'linux-nvidia')
        for (const capability of [
          'linux-owned-inference-v1',
          'illustrious-txt2img',
          'illustrious-img2img',
          'illustrious-outpaint',
          'anima-txt2img',
          'anima-smart-patch-regional-txt2img-v1',
        ]) {
          assert.ok(
            client.ready.capabilities.includes(capability),
            `Missing installed capability: ${capability}`,
          )
        }
        return {
          ready: client.ready,
          close: async () => {
            receipt.closeStartedAt = new Date().toISOString()
            await client.close()
            receipt.exitConfirmed = await ownedProcessExited(processProof)
            receipt.forcedTermination = client.forcedTermination
            receipt.signalCode = client.child.signalCode
            receipt.exitCode = client.child.exitCode
            assert.equal(receipt.exitConfirmed, true)
            assert.equal(
              receipt.forcedTermination,
              false,
              'Forced inference close is not qualification success',
            )
            assert.equal(GenerationWorkerClient.hasUnconfirmedStartExit(), false)
            liveInferenceClients.delete(client)
            receipt.closedAt = new Date().toISOString()
          },
        }
      }
      try {
        receipt.unexpectedReady = client.ready
      } finally {
        await client.close()
      }
      throw new Error('The deliberately incomplete CPU release unexpectedly admitted inference')
    } catch (error) {
      receipt.error = errorSummary(error)
      receipt.exitFenceClear = !GenerationWorkerClient.hasUnconfirmedStartExit()
      throw error
    } finally {
      receipt.finishedAt = new Date().toISOString()
    }
  }
  manager = new RuntimeManager(roots, { platform: 'linux', arch: 'x64' }, startInference, backend)

  await check('invalid-signature-refuses-preview-before-execution', async () => {
    const envelope = JSON.parse(selection.envelope.toString('utf8'))
    const signature = Buffer.from(envelope.signature, 'base64')
    signature[0] ^= 1
    currentSelection = {
      ...selection,
      envelope: canonicalRuntimeReleaseJson({
        ...envelope,
        signature: signature.toString('base64'),
      }),
    }
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
    const changed = Buffer.from(original)
    changed[0] ^= 1
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
    assert.equal(review.scope, fullEngine ? 'engine' : 'python-runtime-slot')
    assert.equal(review.mode, 'install')
    assert.equal(report.commands.length, 0)
    assert.deepEqual(await fs.readdir(roots.environmentsDir), [])
    assert.deepEqual(await fs.readdir(roots.pythonDir), [])
    if (fullEngine) {
      assert.equal(review.requiredFreeBytes, null)
      assert.equal(review.runtimeRequiredFreeBytes, report.signedRelease.manifest.requiredFreeBytes)
      assert.equal(review.plan.totals.downloadBytes, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
      assert.equal(review.plan.totals.additionalInstalledBytes, null)
      const runtime = review.plan.artifacts.find((entry) => entry.kind === 'runtime')
      assert.equal(runtime.sourceCached, true)
      assert.equal(runtime.reused, false)
      assert.equal(report.auxiliary.copies.length, 0)
      assert.deepEqual(await fs.readdir(report.auxiliary.resourcesDirectory), [])
    }
    return review
  })
  if (fullInference) {
    await fullInstalledChecks({ args, roots, backend, startInference, review, wheelhouseProof })
    if (fullEngine) await fullEngineInstalledChecks({ roots, installOnly })
  } else {
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
      assert.ok(
        report.commands.every((command) => command.code === 0 && command.exitConfirmed === true),
      )
      const inspection = report.commands
        .map((command) => {
          try {
            return JSON.parse(command.stdout)
          } catch {
            return null
          }
        })
        .find((entry) => entry?.workerFiles && entry?.packages)
      assert.ok(inspection, 'Production installed-byte inspection receipt is required')
      assert.deepEqual(
        inspection.packages
          .map((entry) => [normalizedDistribution(entry.name), entry.version])
          .sort(),
        [
          ['imagegen-worker', '0.1.0'],
          ['pillow', '12.2.0'],
        ],
      )
      report.installedInspection = {
        packages: inspection.packages,
        workerFiles: inspection.workerFiles,
        workerRoot: inspection.workerRoot,
      }
      await absent(roots.pointerFile)
      return {
        result,
        actualCommands: report.commands.length,
        cpuSelfTest: report.cpuClients[0].selfTest,
        installedWorkerFiles: Object.keys(inspection.workerFiles).length,
      }
    })
    await check('real-inference-entrypoint-refuses-missing-torch-with-physical-exit', async () => {
      const logPath = path.join(roots.workerLogsDir, 'inference-refusal.log')
      await fs.writeFile(logPath, '', { flag: 'wx', mode: 0o600 })
      const diagnostic = await commandObserver({
        executable: prepared.pythonExecutable,
        cwd: roots.runtimeDir,
        environment: prepared.environment,
        logPath,
        args: [
          '-I',
          '-B',
          '-c',
          "import importlib.util,json; print(json.dumps({'torchSpec':importlib.util.find_spec('torch')}))",
        ],
      })
      assert.equal(diagnostic.code, 0)
      assert.deepEqual(JSON.parse(diagnostic.stdout), { torchSpec: null })
      const result = await commandObserver({
        executable: prepared.pythonExecutable,
        cwd: roots.runtimeDir,
        environment: prepared.environment,
        logPath,
        args: ['-I', '-B', '-m', 'imagegen_worker.inference_main'],
      })
      assert.equal(result.code, 78)
      assert.equal(result.stdout, '', 'Refused inference must not advertise ready')
      assert.match(
        result.stderr,
        /Inference startup failed:.*pinned CUDA inference runtime is unavailable/,
      )
      return {
        torchSpec: null,
        code: result.code,
        stderr: result.stderr,
        exitConfirmed: result.exitConfirmed,
        inference:
          'Actual entrypoint refuses before any Torch import/CUDA probe because Torch distribution is absent.',
      }
    })
    await check('one-use-review-retained-incomplete-slots-and-no-active-pointer', async () => {
      const consumed = await manager.install(review.token)
      assert.equal(consumed.ok, false)
      assert.equal(consumed.error.code, 'RUNTIME_INVALID_REVIEW')
      const pythonSlots = await fs.readdir(roots.pythonDir)
      const environmentSlots = await fs.readdir(roots.environmentsDir)
      assert.equal(pythonSlots.length, 1)
      assert.deepEqual(pythonSlots, environmentSlots)
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
      const journal = JSON.parse(
        await fs.readFile(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL), 'utf8'),
      )
      assert.equal(journal.phase, 'failed')
      await absent(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_CLAIM))
      await absent(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_RECOVERY_CLAIM))
      report.finalStatus = status
      return {
        consumed,
        pythonSlots,
        environmentSlots,
        markers,
        journal,
        status,
        pointerAbsent: true,
      }
    })
  }
  await check('owned-sentinels-source-payload-and-physical-exit-restoration', async () => {
    for (const sentinel of sentinels)
      assert.deepEqual(await fs.readFile(sentinel.filename), sentinel.bytes)
    let after
    if (fullEngine) after = await engineInputs(args)
    else {
      after = {
        python: await inventory(args['python-root'], true),
        config: await inventory(args.config),
        wheels: await inventory(args.wheels),
        uv: await stableBytes(args.uv),
      }
      after.uv = { identity: after.uv.identity, sha256: sha256(after.uv.bytes) }
      if (fullInference) after.wheelhouseProof = (await fullWheelhouseProof(args)).files
    }
    assert.deepEqual(after, inputsFreeze, 'Read-only input bytes or metadata changed')
    assert.deepEqual(
      await freezeOwners(),
      sourceFreeze,
      'Production/Python source changed during qualification',
    )
    await (await verifyRuntimeRelease(selection)).verifyCompletePayloadSnapshot()
    assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
    assert.equal(GenerationWorkerClient.hasUnconfirmedStartExit(), false)
    assert.equal(hasUnconfirmedOfflineRuntimeCommands(), false)
    assert.equal(deadlineExceeded, false)
    report.finalProcessBoundary = await cgroupProof(process.pid)
    return {
      sentinels: sentinels.map((entry) => ({ path: entry.filename, sha256: sha256(entry.bytes) })),
      sourceUnchanged: true,
      readOnlyInputsUnchanged: true,
      signedPayloadRestored: true,
      exitConfirmed: true,
      forcedExitAccepted: false,
      unconfirmedFences: false,
      payloadsRetained: true,
    }
  })
  report.outcome = 'PASS'
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    report.outcome = 'FAIL'
    report.error = errorSummary(error)
    process.exitCode = 1
  } finally {
    clearTimeout(deadlineTimer)
    if (manager) {
      try {
        await manager.cancelInstallation()
      } catch (error) {
        report.finalCancelError = errorSummary(error)
      }
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
        } catch (error) {
          cleanup.error = errorSummary(error)
        }
      }
      report.outcome = 'FAIL'
      process.exitCode = 1
    }
    if (liveInferenceClients.size) {
      report.emergencyInferenceCleanup = []
      for (const client of liveInferenceClients) {
        const cleanup = { pid: client.child.pid, exitConfirmed: false }
        report.emergencyInferenceCleanup.push(cleanup)
        try {
          await client.close()
          cleanup.exitConfirmed = client.exitObserved
          cleanup.forcedTermination = client.forcedTermination
          if (cleanup.exitConfirmed) liveInferenceClients.delete(client)
        } catch (error) {
          cleanup.error = errorSummary(error)
        }
      }
      report.outcome = 'FAIL'
      process.exitCode = 1
    }
    report.finishedAt = new Date().toISOString()
    report.cleanup = {
      action: 'none',
      payloadRoot,
      retained: true,
      reason: 'Owning run performs retention, dependency audit and bounded cleanup separately.',
    }
    report.finalExitFences = {
      project: ProjectWorkerClient.hasUnconfirmedExit(),
      inference: GenerationWorkerClient.hasUnconfirmedStartExit(),
      commands: hasUnconfirmedOfflineRuntimeCommands(),
    }
    if (sourceFreeze) {
      try {
        report.sourceAfter = await freezeOwners()
        report.sourceUnchanged = JSON.stringify(report.sourceAfter) === JSON.stringify(sourceFreeze)
        assert.equal(report.sourceUnchanged, true)
      } catch (error) {
        report.sourceAuditError = errorSummary(error)
        report.outcome = 'FAIL'
        process.exitCode = 1
      }
    }
    if (inputsFreeze && inputArguments) {
      try {
        let after
        if (fullEngine) after = await engineInputs(inputArguments)
        else {
          const uv = await stableBytes(inputArguments.uv)
          after = {
            python: await inventory(inputArguments['python-root'], true),
            config: await inventory(inputArguments.config),
            wheels: await inventory(inputArguments.wheels),
            uv: { identity: uv.identity, sha256: sha256(uv.bytes) },
          }
          if (fullInference)
            after.wheelhouseProof = (await fullWheelhouseProof(inputArguments)).files
        }
        assert.deepEqual(after, inputsFreeze)
        report.readOnlyInputsUnchanged = true
      } catch (error) {
        report.inputAuditError = errorSummary(error)
        report.outcome = 'FAIL'
        process.exitCode = 1
      }
    }
    if (Object.values(report.finalExitFences).some(Boolean)) {
      report.outcome = 'FAIL'
      process.exitCode = 1
    }
    report.exitConfirmed =
      !Object.values(report.finalExitFences).some(Boolean) &&
      liveCpuClients.size === 0 &&
      liveInferenceClients.size === 0 &&
      report.commands.every((command) => command.exitConfirmed === true)
    if (reportFile)
      await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, {
        flag: 'wx',
        mode: 0o600,
      })
    process.stdout.write(
      `${JSON.stringify({ outcome: report.outcome, checks: report.checks.map(({ name, outcome }) => ({ name, outcome })), reportFile })}\n`,
    )
  }
}
