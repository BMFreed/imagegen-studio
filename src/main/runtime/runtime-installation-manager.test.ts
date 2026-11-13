import type { ApiResult } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type { InferenceWorkerReady } from '../projects/illustrious-txt2img-job.js'
import type { WorkerReady, WorkerSelfTestResult } from '../projects/worker-client.js'
import type { RuntimeInstallationBackend } from './index.js'
import type {
  RuntimeReleaseFile,
  RuntimeReleaseManifest,
  RuntimeReleaseSelection,
} from './runtime-release.js'

import { createRuntimeRoots, RuntimeManager } from './index.js'
import { OFFLINE_RUNTIME_INCOMPLETE_MARKER } from './offline-runtime-assembly.js'
import { RUNTIME_INSTALLATION_CLAIM, RUNTIME_INSTALLATION_JOURNAL } from './runtime-installation.js'
import {
  canonicalRuntimeReleaseJson,
  PINNED_RUNTIME_CONFIG_FILES,
  runtimeReleaseRequirements,
} from './runtime-release.js'

/**
 * Main integration: real signed inventory, private roots, install journal and atomic pointer.
 * Assembly and startup transports are explicit controlled ports, not Python/uv qualification. The
 * lease case additionally starts a real bounded protocol child through the existing owner.
 * Invoke4875 install_staging_ledger.py + model_install_default._write_install_marker callers;
 * launcher c267bdb4 download_uv.ts checksum and install-manager command/cancel callers.
 */
const configFixture = process.env.IGS_RUNTIME_RELEASE_CONFIG_FIXTURE
const fullPayload = { skip: !configFixture }
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const cpuReady: WorkerReady = {
  capabilities: [
    'image-derivatives',
    'import-normalization',
    'self-test',
    'preview-composition',
    'target-composition',
    'export-composition',
  ],
  protocolVersion: '1',
  pythonVersion: '3.12.13',
  runtimeProfile: 'derivatives-only',
  workerVersion: '0.1.0',
}
const gpuReady: InferenceWorkerReady = {
  capabilities: [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-lora',
    'illustrious-vae-precision',
    'illustrious-external-vae',
    'illustrious-embeddings',
    'illustrious-outpaint',
    'linux-owned-inference-v1',
  ],
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.14.0',
}
const cpuSelfTest: WorkerSelfTestResult = {
  colorConversion: 'srgb',
  imageCodecs: ['PNG', 'WEBP'],
  pillowVersion: 'fixture',
  runtimeProfile: 'derivatives-only',
}

type Fixture = Awaited<ReturnType<typeof fixture>>
function value<T>(result: ApiResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.value
}
function failure<T>(result: ApiResult<T>, code: string): void {
  assert.equal(result.ok, false)
  if (result.ok) {
    throw new Error('Expected a runtime failure')
  }
  assert.equal(result.error.code, code)
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function absent(file: string): Promise<void> {
  await assert.rejects(
    fs.lstat(file),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT',
  )
}

function descriptor(name: string, bytes: Buffer, executable = false): RuntimeReleaseFile {
  return { executable, kind: 'file', path: name, sha256: digest(bytes), sizeBytes: bytes.length }
}
async function fixture() {
  assert.ok(configFixture, 'The full Main integration requires the exact pinned17 config snapshot.')
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-runtime-manager-install-'))
  const roots = await createRuntimeRoots(path.join(work, 'app'))
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { mode: 0o700 })
  const directory = path.join(work, 'release')
  const wheelBytes = Buffer.from(
    'Inventory fixture only; actual wheel installation is qualified separately.',
  )
  const wheel = descriptor('wheels/imagegen_worker-0.1.0-py3-none-any.whl', wheelBytes)
  let manifest: RuntimeReleaseManifest = {
    appVersion: '1.0.0',
    configPath: 'config',
    files: [],
    host: {
      arch: 'x64',
      cudaVersion: '12.6',
      glibcMinimum: '2.28',
      gpuArchitectures: ['sm_89'],
      minimumNvidiaDriver: '560.0',
      os: 'linux',
    },
    lockSha256: 'a'.repeat(64),
    profile: 'linux-nvidia',
    python: {
      buildId: 'cpython-3.12.13-linux-x86_64',
      executable: 'python/bin/python3.12',
      version: '3.12.13',
    },
    releaseId: 'manager-release-fixture',
    requiredFreeBytes: 16 * 1024 ** 2,
    requirementsPath: 'requirements.txt',
    schemaVersion: 1,
    uv: { executable: 'uv/uv', version: '0.11.11' },
    wheels: [
      {
        distribution: 'imagegen-worker',
        path: wheel.path,
        sha256: wheel.sha256,
        sizeBytes: wheel.sizeBytes,
        version: '0.1.0',
      },
    ],
    worker: {
      cpuVersion: '0.1.0',
      distribution: 'imagegen-worker',
      distributionVersion: '0.1.0',
      inferenceVersion: '0.14.0',
      protocolVersion: '1',
    },
  }
  const material: [string, Buffer, boolean][] = [
    [
      'python/bin/python3.12',
      Buffer.from('Declared inventory Python; controlled assembly is the process boundary.'),
      true,
    ],
    ['uv/uv', Buffer.from('Declared inventory uv; never executed in manager integration.'), true],
    [wheel.path, wheelBytes, false],
    ['requirements.txt', Buffer.from(runtimeReleaseRequirements(manifest)), false],
  ]
  for (const [name, sha256] of Object.entries(PINNED_RUNTIME_CONFIG_FILES)) {
    const bytes: Buffer = await fs.readFile(path.join(configFixture, name))
    assert.equal(digest(bytes), sha256, `Expected pinned actual config: ${name}`)
    material.push([`config/${name}`, bytes, false])
  }
  const files: RuntimeReleaseFile[] = []
  for (const [name, bytes, executable] of material) {
    const destination = path.join(directory, name)
    await fs.mkdir(path.dirname(destination), { mode: 0o700, recursive: true })
    await fs.writeFile(destination, bytes, { flag: 'wx', mode: executable ? 0o700 : 0o600 })
    files.push(descriptor(name, bytes, executable))
  }
  manifest = { ...manifest, files }
  const keys = generateKeyPairSync('ed25519')
  const payload = canonicalRuntimeReleaseJson(manifest)
  const selection: RuntimeReleaseSelection = {
    appVersion: '1.0.0',
    directory,
    envelope: Buffer.from(
      JSON.stringify({
        keyId: 'integration-only',
        payload: payload.toString('base64'),
        schemaVersion: 1,
        signature: sign(null, payload, keys.privateKey).toString('base64'),
      }),
    ),
    trustedKeys: {
      'integration-only': keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    },
  }
  const events: string[] = []
  let cpuNumber = 0
  let gpuNumber = 0
  const controls: {
    auxiliary?: () => Promise<void>
    cpuClose?: (number: number) => Promise<void>
    cpuReady?: (number: number) => WorkerReady
    cpuSelfTest?: (number: number) => Promise<WorkerSelfTestResult>
    gpuClose?: (number: number) => Promise<void>
    gpuReady?: (number: number) => InferenceWorkerReady
    host?: () => Promise<void>
  } = {}
  const backend: RuntimeInstallationBackend = {
    assemble: async ({ release, roots: ownedRoots, runtimeId, signal }) => {
      assert.equal(ownedRoots, roots)
      assert.equal(signal?.aborted, false)
      await release.verifyCompletePayloadSnapshot()
      events.push('assemble')
      const environmentRoot = path.join(roots.environmentsDir, runtimeId)
      const pythonRoot = path.join(roots.pythonDir, runtimeId)
      const config = path.join(environmentRoot, 'resources', 'sdxl-config')
      await fs.mkdir(path.join(environmentRoot, 'bin'), { mode: 0o700, recursive: true })
      await fs.mkdir(pythonRoot, { mode: 0o700 })
      await fs.cp(path.join(directory, 'config'), config, { force: false, recursive: true })
      const pythonExecutable = path.join(environmentRoot, 'bin/python')
      // Real child only for lease ownership. No generation requests or native execution occur.
      const program = `#!${process.execPath}\nconst ready=process.argv.includes('imagegen_worker')?${JSON.stringify(cpuReady)}:${JSON.stringify({ ...gpuReady, pythonVersion: '3.12.13' })};\nprocess.stdout.write(JSON.stringify({...ready,type:'ready'})+'\\n');\nprocess.stdin.resume();\nprocess.on('SIGTERM',()=>process.exit(0));\n`
      await fs.writeFile(path.join(pythonRoot, 'python'), program, { flag: 'wx', mode: 0o700 })
      await fs.symlink(path.join(pythonRoot, 'python'), pythonExecutable)
      const marker = JSON.stringify({
        releaseId: release.manifest.releaseId,
        runtimeId,
        schemaVersion: 1,
      })
      for (const root of [environmentRoot, pythonRoot]) {
        await fs.writeFile(path.join(root, OFFLINE_RUNTIME_INCOMPLETE_MARKER), marker, {
          flag: 'wx',
          mode: 0o600,
        })
      }
      return {
        environment: {
          HF_DATASETS_OFFLINE: '1',
          HF_HOME: roots.cacheDir,
          HF_HUB_OFFLINE: '1',
          IGS_SDXL_CONFIG_DIR: config,
          TRANSFORMERS_OFFLINE: '1',
        },
        environmentRoot,
        logPath: path.join(roots.workerLogsDir, `${runtimeId}.log`),
        manifestSha256: digest(canonicalRuntimeReleaseJson(release.manifest)),
        pythonExecutable,
        pythonRoot,
        releaseId: release.manifest.releaseId,
        runtimeId,
      }
    },
    ensureAuxiliaryReady: async () => {
      events.push('auxiliary')
      await controls.auxiliary?.()
    },
    ensureHostCompatible: async (host) => {
      events.push('host')
      assert.deepEqual(host, manifest.host)
      await controls.host?.()
    },
    loadRelease: async () => selection,
    startProjectClient: async (location, options) => {
      const number = ++cpuNumber
      events.push(`cpu-start-${number}`)
      assert.equal(location.runtimeRoot, roots.runtimeDir)
      assert.equal(options?.environment?.CUDA_VISIBLE_DEVICES, '')
      assert.equal(options?.environment?.HF_HUB_OFFLINE, '1')
      return {
        close: async () => {
          events.push(`cpu-closing-${number}`)
          await controls.cpuClose?.(number)
          events.push(`cpu-closed-${number}`)
        },
        ready: controls.cpuReady?.(number) ?? cpuReady,
        selfTest: async () => {
          events.push(`cpu-test-${number}`)
          return (await controls.cpuSelfTest?.(number)) ?? cpuSelfTest
        },
      }
    },
  }
  const manager = new RuntimeManager(
    roots,
    { arch: 'x64', platform: 'linux' },
    async (location, environment, options) => {
      const number = ++gpuNumber
      events.push(`gpu-start-${number}`)
      assert.equal(location.runtimeRoot, roots.runtimeDir)
      assert.equal(environment.HF_HUB_OFFLINE, '1')
      assert.equal(options?.signal?.aborted ?? false, false)
      return {
        close: async () => {
          events.push(`gpu-closing-${number}`)
          await controls.gpuClose?.(number)
          events.push(`gpu-closed-${number}`)
        },
        ready: controls.gpuReady?.(number) ?? gpuReady,
      }
    },
    backend,
  )
  async function install(mode: 'install' | 'repair' = 'install') {
    const review = value(await manager.previewInstallation(mode))
    return mode === 'install' ? manager.install(review.token) : manager.repair(review.token)
  }
  return {
    backend,
    controls,
    directory,
    events,
    install,
    manager,
    manifest,
    resign: () => {
      const payload = canonicalRuntimeReleaseJson(manifest)
      Reflect.set(
        selection,
        'envelope',
        Buffer.from(
          JSON.stringify({
            keyId: 'integration-only',
            payload: payload.toString('base64'),
            schemaVersion: 1,
            signature: sign(null, payload, keys.privateKey).toString('base64'),
          }),
        ),
      )
    },
    roots,
    scratch,
    selection,
    work,
  }
}
async function withFixture(use: (f: Fixture) => Promise<void>) {
  const f = await fixture()
  try {
    await use(f)
  } finally {
    await f.manager.cancelInstallation()
    await fs.rm(f.work, { force: true, recursive: true })
  }
}

test('public default stays unavailable without a Main-owned release provider', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-runtime-no-release-'))
  try {
    const roots = await createRuntimeRoots(temporary)
    const manager = new RuntimeManager(roots)
    failure(await manager.previewInstallation('install'), 'RUNTIME_INSTALL_UNAVAILABLE')
    failure(await manager.install(), 'RUNTIME_INSTALL_UNAVAILABLE')
    failure(await manager.repair(), 'RUNTIME_INSTALL_UNAVAILABLE')
    await absent(roots.pointerFile)
    assert.deepEqual(await fs.readdir(roots.environmentsDir), [])
  } finally {
    await fs.rm(temporary, { force: true, recursive: true })
  }
})

test(
  'preview enforces signature and actual payload before assembly or workers',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const trusted = f.selection.trustedKeys
      f.backend.loadRelease = async () => ({ ...f.selection, trustedKeys: {} })
      failure(await f.manager.previewInstallation('install'), 'RUNTIME_RELEASE_UNTRUSTED')
      assert.deepEqual(f.events, [])
      f.backend.loadRelease = async () => ({ ...f.selection, trustedKeys: trusted })
      await fs.writeFile(path.join(f.directory, 'uv/uv'), 'different actual payload')
      const rejected = await f.manager.previewInstallation('install')
      assert.equal(rejected.ok, false)
      assert.deepEqual(f.events, [])
      await absent(f.roots.pointerFile)
    })
  },
)

test(
  'review is detached, operation-specific, one-use, and installs through both qualification phases',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const review = value(await f.manager.previewInstallation('install'))
      assert.equal(review.scope, 'python-runtime-slot')
      assert.equal(review.releaseId, f.manifest.releaseId)
      assert.equal(
        review.verifiedPayloadBytes,
        f.manifest.files.reduce(
          (sum, file) => sum + (file.kind === 'file' ? file.sizeBytes : 0),
          0,
        ),
      )
      assert.deepEqual(f.events, [])
      failure(await f.manager.repair(review.token), 'RUNTIME_INVALID_REVIEW')
      review.releaseId = 'caller-mutation'
      const result = value(await f.manager.install(review.token))
      assert.equal(result.kind, 'ready')
      failure(await f.manager.install(review.token), 'RUNTIME_INVALID_REVIEW')
      assert.deepEqual(f.events, [
        'host',
        'auxiliary',
        'assemble',
        'cpu-start-1',
        'cpu-test-1',
        'cpu-closing-1',
        'cpu-closed-1',
        'gpu-start-1',
        'gpu-closing-1',
        'gpu-closed-1',
        'cpu-start-2',
        'cpu-test-2',
        'cpu-closing-2',
        'cpu-closed-2',
        'gpu-start-2',
        'gpu-closing-2',
        'gpu-closed-2',
      ])
      const pointer = JSON.parse(await fs.readFile(f.roots.pointerFile, 'utf8'))
      assert.equal(pointer.runtimeId, result.kind === 'ready' ? result.runtimeId : undefined)
      for (const root of [f.roots.environmentsDir, f.roots.pythonDir]) {
        await absent(path.join(root, pointer.runtimeId, OFFLINE_RUNTIME_INCOMPLETE_MARKER))
      }
      const journal = JSON.parse(
        await fs.readFile(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL), 'utf8'),
      )
      assert.equal(journal.phase, 'complete')
      assert.equal(journal.prepared.releaseId, f.manifest.releaseId)
      assert.equal(journal.prepared.manifestSha256, digest(canonicalRuntimeReleaseJson(f.manifest)))
      await absent(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_CLAIM))
      assert.deepEqual(await fs.readdir(f.roots.downloadsDir), [])
    })
  },
)

test('unsupported host and absent release never materialize a slot', fullPayload, async () => {
  await withFixture(async (f) => {
    const unsupported = new RuntimeManager(
      f.roots,
      { arch: 'arm64', platform: 'darwin' },
      undefined,
      f.backend,
    )
    failure(await unsupported.previewInstallation('install'), 'RUNTIME_UNSUPPORTED')
    f.backend.loadRelease = async () => null
    failure(await f.manager.previewInstallation('install'), 'RUNTIME_INSTALL_UNAVAILABLE')
    assert.deepEqual(await fs.readdir(f.roots.environmentsDir), [])
    assert.deepEqual(f.events, [])
  })
})

test(
  'default Main host preflight refuses an incompatible signed glibc floor before auxiliary or assembly',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      delete f.backend.ensureHostCompatible
      Reflect.set(f.manifest.host, 'glibcMinimum', '999.0')
      f.resign()
      failure(await f.install(), 'RUNTIME_HOST_GLIBC_UNSUPPORTED')
      assert.deepEqual(f.events, [])
      assert.deepEqual(await fs.readdir(f.roots.environmentsDir), [])
      assert.deepEqual(await fs.readdir(f.roots.pythonDir), [])
      await absent(f.roots.pointerFile)
      await absent(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL))
    })
  },
)

test(
  'actual Main host preflight reaches controlled assembly without starting Python or inference',
  { skip: !configFixture || process.env.IGS_RUNTIME_HOST_ACTUAL !== '1' },
  async () => {
    await withFixture(async (f) => {
      delete f.backend.ensureHostCompatible
      f.backend.assemble = async () => {
        f.events.push('controlled-assembly-after-real-host')
        throw new Error('Controlled assembly refusal after actual host preflight')
      }
      failure(await f.install(), 'RUNTIME_INSTALL_FAILED')
      assert.deepEqual(f.events, ['auxiliary', 'controlled-assembly-after-real-host'])
      const logs = await fs.readdir(f.roots.workerLogsDir)
      assert.equal(logs.length, 1)
      assert.match(
        await fs.readFile(path.join(f.roots.workerLogsDir, logs[0]), 'utf8'),
        /\d+\.\d+,\s*\d+\.\d+/,
      )
      assert.deepEqual(await fs.readdir(f.roots.environmentsDir), [])
      await absent(f.roots.pointerFile)
    })
  },
)

test(
  'host inspection receives installation abort and cancellation cannot continue into auxiliary or assembly',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const entered = deferred()
      let received: AbortSignal | undefined
      f.backend.ensureHostCompatible = async (_requirements, signal) => {
        received = signal
        entered.resolve()
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        )
      }
      const operation = f.install()
      await entered.promise
      const cancel = f.manager.cancelInstallation()
      await cancel
      failure(await operation, 'RUNTIME_INSTALL_CANCELED')
      assert.equal(received?.aborted, true)
      assert.deepEqual(f.events, [])
      assert.deepEqual(await fs.readdir(f.roots.environmentsDir), [])
      await absent(f.roots.pointerFile)
      await absent(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL))
    })
  },
)

test(
  'payload drift after preview revokes setup before host and assembly',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const review = value(await f.manager.previewInstallation('install'))
      const source = path.join(f.directory, 'uv/uv')
      const bytes = await fs.readFile(source)
      bytes[0] ^= 1
      await fs.writeFile(source, bytes)
      assert.equal((await f.manager.install(review.token)).ok, false)
      failure(await f.manager.install(review.token), 'RUNTIME_INVALID_REVIEW')
      assert.deepEqual(f.events, [])
      assert.deepEqual(await fs.readdir(f.roots.environmentsDir), [])
      await absent(f.roots.pointerFile)
    })
  },
)

test(
  'changed reviewed pointer is refused before assembly and preserved byte-for-byte',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      value(await f.install())
      const review = value(await f.manager.previewInstallation('repair'))
      // An independently completed real controller operation supersedes the reviewed selection.
      const other = new RuntimeManager(
        f.roots,
        { arch: 'x64', platform: 'linux' },
        async () => ({ close: async () => {}, ready: gpuReady }),
        f.backend,
      )
      value(await other.install(value(await other.previewInstallation('install')).token))
      const changed = await fs.readFile(f.roots.pointerFile)
      const assemblies = f.events.filter((event) => event === 'assemble').length
      failure(await f.manager.repair(review.token), 'RUNTIME_INSTALL_POINTER_CHANGED')
      assert.deepEqual(await fs.readFile(f.roots.pointerFile), changed)
      assert.equal(f.events.filter((event) => event === 'assemble').length, assemblies)
    })
  },
)

test(
  'host or separately owned auxiliary failure precedes assembly and download',
  fullPayload,
  async (t) => {
    for (const owner of ['host', 'auxiliary'] as const) {
      await t.test(owner, async () => {
        await withFixture(async (f) => {
          f.controls[owner] = async () => {
            throw new Error(`${owner} readiness refused`)
          }
          failure(await f.install(), 'RUNTIME_INSTALL_FAILED')
          assert.deepEqual(f.events, owner === 'host' ? ['host'] : ['host', 'auxiliary'])
          assert.deepEqual(await fs.readdir(f.roots.environmentsDir), [])
          assert.deepEqual(await fs.readdir(f.roots.downloadsDir), [])
          await absent(f.roots.pointerFile)
        })
      })
    }
  },
)

test(
  'CPU export capability and exact inference readiness are required and transports close',
  fullPayload,
  async (t) => {
    for (const broken of [
      'cpu-export',
      'cpu-self-test',
      'gpu-version',
      'gpu-capability',
    ] as const) {
      await t.test(broken, async () => {
        await withFixture(async (f) => {
          if (broken === 'cpu-export') {
            f.controls.cpuReady = () => ({
              ...cpuReady,
              capabilities: cpuReady.capabilities.filter(
                (capability) => capability !== 'export-composition',
              ),
            })
          }
          if (broken === 'cpu-self-test') {
            f.controls.cpuSelfTest = async () => {
              throw new Error('Image codec self-test rejected')
            }
          }
          if (broken === 'gpu-version') {
            f.controls.gpuReady = () => ({ ...gpuReady, workerVersion: '0.13.0' })
          }
          if (broken === 'gpu-capability') {
            f.controls.gpuReady = () => ({
              ...gpuReady,
              capabilities: gpuReady.capabilities.filter(
                (capability) => capability !== 'illustrious-outpaint',
              ),
            })
          }
          failure(await f.install(), 'RUNTIME_INSTALL_FAILED')
          assert.ok(f.events.includes('cpu-closed-1'))
          if (broken.startsWith('gpu')) {
            assert.ok(f.events.includes('gpu-closed-1'))
          } else {
            assert.ok(!f.events.includes('gpu-start-1'))
          }
          await absent(f.roots.pointerFile)
          assert.equal(
            JSON.parse(
              await fs.readFile(
                path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL),
                'utf8',
              ),
            ).phase,
            'failed',
          )
        })
      })
    }
  },
)

test(
  'failed release inference close stays retained until shutdown retry confirms physical exit',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      let exitConfirmed = false
      let closeAttempts = 0
      f.controls.gpuClose = async () => {
        closeAttempts += 1
        if (!exitConfirmed) {
          throw new Error('Controlled transport has not confirmed physical exit')
        }
      }
      failure(await f.install(), 'RUNTIME_INSTALL_RECOVERY_REQUIRED')
      assert.equal(closeAttempts, 1)
      await absent(f.roots.pointerFile)
      assert.equal(
        JSON.parse(
          await fs.readFile(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL), 'utf8'),
        ).phase,
        'recovery-required',
      )
      assert.ok(await fs.lstat(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_CLAIM)))
      f.manager.preventNewGenerationWork()
      assert.equal(await f.manager.retryUnconfirmedGenerationExit(), false)
      assert.equal(closeAttempts, 2)
      exitConfirmed = true
      assert.equal(await f.manager.retryUnconfirmedGenerationExit(), true)
      assert.equal(closeAttempts, 3)
      // Confirming exit is not permission to guess away the durable recovery record.
      assert.ok(await fs.lstat(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_CLAIM)))
      assert.equal(f.events.filter((event) => event.startsWith('gpu-start-')).length, 1)
    })
  },
)

test(
  'post-activation failure restores the exact previous pointer and keeps both slots',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      value(await f.install())
      const previous = await fs.readFile(f.roots.pointerFile)
      const previousPointer = JSON.parse(previous.toString())
      const previousExecutable = await fs.readFile(previousPointer.pythonExecutable)
      f.controls.gpuReady = (number) =>
        number === 4 ? { ...gpuReady, workerVersion: 'unknown' } : gpuReady
      failure(await f.install('repair'), 'RUNTIME_INSTALL_FAILED')
      assert.deepEqual(await fs.readFile(f.roots.pointerFile), previous)
      assert.deepEqual(await fs.readFile(previousPointer.pythonExecutable), previousExecutable)
      assert.equal((await fs.readdir(f.roots.environmentsDir)).length, 2)
      assert.equal((await fs.readdir(f.roots.pythonDir)).length, 2)
      assert.ok(f.events.includes('gpu-closed-4'))
      assert.equal(
        JSON.parse(
          await fs.readFile(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL), 'utf8'),
        ).phase,
        'rolled-back',
      )
    })
  },
)

test(
  'installation blocks generation and CPU resolution until controlled physical close settles',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      value(await f.install())
      const previous = await fs.readFile(f.roots.pointerFile)
      const closed = deferred()
      const entered = deferred()
      f.controls.cpuClose = async (number) => {
        if (number === 3) {
          entered.resolve()
          await closed.promise
        }
      }
      const operation = f.install('repair')
      try {
        await entered.promise
        assert.equal(value(await f.manager.getStatus()).kind, 'checking')
        assert.equal(await f.manager.resolveInstalledProjectWorker(f.scratch), null)
        assert.equal(
          await f.manager.withGenerationAdmission(f.scratch, async () => 'must not run'),
          null,
        )
        failure(await f.manager.previewInstallation('repair'), 'RUNTIME_INSTALL_BUSY')
        assert.deepEqual(await fs.readFile(f.roots.pointerFile), previous)
      } finally {
        closed.resolve()
      }
      value(await operation)
      assert.ok(await f.manager.resolveInstalledProjectWorker(f.scratch))
      assert.deepEqual(await fs.readdir(f.roots.downloadsDir), [])
    })
  },
)

test(
  'cancel waits for the owned transport close and never publishes an unqualified slot',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const closed = deferred()
      const entered = deferred()
      f.controls.cpuClose = async () => {
        entered.resolve()
        await closed.promise
      }
      const operation = f.install()
      await entered.promise
      let cancelSettled = false
      const cancellation = f.manager.cancelInstallation().then(() => {
        cancelSettled = true
      })
      try {
        await Promise.resolve()
        assert.equal(cancelSettled, false)
        await absent(f.roots.pointerFile)
        assert.ok(!f.events.includes('gpu-start-1'))
      } finally {
        closed.resolve()
      }
      await cancellation
      assert.equal((await operation).ok, false)
      await absent(f.roots.pointerFile)
      assert.ok(f.events.includes('cpu-closed-1'))
    })
  },
)

test(
  'shutdown awaits in-progress installation close and permanently prevents admission',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const closed = deferred()
      const entered = deferred()
      f.controls.cpuClose = async () => {
        entered.resolve()
        await closed.promise
      }
      const operation = f.install()
      await entered.promise
      f.manager.preventNewGenerationWork()
      let shutdownSettled = false
      const shutdown = f.manager.retryUnconfirmedGenerationExit().then((result) => {
        shutdownSettled = true
        return result
      })
      try {
        await Promise.resolve()
        assert.equal(shutdownSettled, false)
        assert.equal(await f.manager.resolveInstalledProjectWorker(f.scratch), null)
      } finally {
        closed.resolve()
      }
      assert.equal(await shutdown, true)
      assert.equal((await operation).ok, false)
      failure(await f.manager.previewInstallation('install'), 'RUNTIME_INSTALL_BUSY')
      await absent(f.roots.pointerFile)
      assert.ok(f.events.includes('cpu-closed-1'))
    })
  },
)

test(
  'cancel after pointer activation awaits inference close before rolling back',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const closed = deferred()
      const entered = deferred()
      f.controls.gpuClose = async (number) => {
        if (number === 2) {
          entered.resolve()
          await closed.promise
        }
      }
      const operation = f.install()
      await entered.promise
      const published = await fs.readFile(f.roots.pointerFile)
      let cancelSettled = false
      const cancellation = f.manager.cancelInstallation().then(() => {
        cancelSettled = true
      })
      try {
        await Promise.resolve()
        assert.equal(cancelSettled, false)
        assert.deepEqual(await fs.readFile(f.roots.pointerFile), published)
        assert.ok(!f.events.includes('gpu-closed-2'))
      } finally {
        closed.resolve()
      }
      await cancellation
      assert.equal((await operation).ok, false)
      assert.ok(f.events.includes('gpu-closed-2'))
      await absent(f.roots.pointerFile)
      assert.equal(
        JSON.parse(
          await fs.readFile(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL), 'utf8'),
        ).phase,
        'rolled-back',
      )
    })
  },
)

test(
  'malformed interrupted-install metadata blocks startup, CPU resolution and generation',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      value(await f.install())
      const previous = await fs.readFile(f.roots.pointerFile)
      await fs.writeFile(
        path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL),
        '{torn journal',
      )
      f.events.splice(0)
      assert.equal(value(await f.manager.getStatus()).kind, 'needs-repair')
      assert.equal(await f.manager.resolveInstalledProjectWorker(f.scratch), null)
      assert.equal(await f.manager.readQualifiedInferenceReady(), null)
      assert.equal(
        await f.manager.withGenerationAdmission(f.scratch, async () => 'must not run'),
        null,
      )
      assert.deepEqual(f.events, [])
      assert.deepEqual(await fs.readFile(f.roots.pointerFile), previous)
      assert.equal((await fs.readdir(f.roots.environmentsDir)).length, 1)
    })
  },
)

test(
  'an incomplete environment or Python marker prevents use of the active selection',
  fullPayload,
  async (t) => {
    for (const slot of ['environment', 'python'] as const) {
      await t.test(slot, async () => {
        await withFixture(async (f) => {
          value(await f.install())
          const previous = await fs.readFile(f.roots.pointerFile)
          const selected = JSON.parse(previous.toString())
          const root = path.join(
            slot === 'environment' ? f.roots.environmentsDir : f.roots.pythonDir,
            selected.runtimeId,
          )
          const marker = path.join(root, OFFLINE_RUNTIME_INCOMPLETE_MARKER)
          await fs.writeFile(
            marker,
            JSON.stringify({
              releaseId: f.manifest.releaseId,
              runtimeId: selected.runtimeId,
              schemaVersion: 1,
            }),
          )
          f.events.splice(0)
          assert.equal(await f.manager.resolveInstalledProjectWorker(f.scratch), null)
          assert.equal(await f.manager.readQualifiedInferenceReady(), null)
          assert.equal(value(await f.manager.getStatus()).kind, 'needs-repair')
          assert.equal(
            await f.manager.withGenerationAdmission(f.scratch, async () => 'must not run'),
            null,
          )
          assert.deepEqual(f.events, [])
          assert.deepEqual(await fs.readFile(f.roots.pointerFile), previous)
          await fs.unlink(marker)
          assert.ok(await f.manager.resolveInstalledProjectWorker(f.scratch))
        })
      })
    }
  },
)

test(
  'a live generation lease refuses repair and preserves its resolved old slot',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      value(await f.install())
      const previous = await fs.readFile(f.roots.pointerFile)
      const resolved = await f.manager.resolveInstalledProjectWorker(f.scratch)
      assert.ok(resolved)
      const previousExecutable = await fs.readFile(resolved.location.pythonExecutable)
      const review = value(await f.manager.previewInstallation('repair'))
      const entered = deferred()
      const released = deferred()
      const generation = f.manager.withGenerationWorker(f.scratch, async () => {
        entered.resolve()
        await released.promise
        return 'finished'
      })
      try {
        await Promise.race([
          entered.promise,
          generation.then((result) => {
            assert.fail(`Lease failed before the callback: ${String(result)}`)
          }),
        ])
        failure(await f.manager.repair(review.token), 'RUNTIME_INSTALL_BUSY')
        assert.deepEqual(await fs.readFile(f.roots.pointerFile), previous)
        assert.deepEqual(await fs.readFile(resolved.location.pythonExecutable), previousExecutable)
      } finally {
        released.resolve()
      }
      assert.equal(await generation, 'finished')
      value(await f.install('repair'))
      assert.deepEqual(await fs.readFile(resolved.location.pythonExecutable), previousExecutable)
    })
  },
)

test(
  'a CPU preparation lease still refuses repair after its original GPU lease has closed',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      value(await f.install())
      const previous = await fs.readFile(f.roots.pointerFile)
      const generationEntered = deferred()
      const generationReleased = deferred()
      const preparationEntered = deferred()
      const preparationReleased = deferred()
      const generation = f.manager.withGenerationWorker(f.scratch, async () => {
        generationEntered.resolve()
        await generationReleased.promise
        return 'gpu-finished'
      })
      let preparation: Promise<string | null> | undefined
      try {
        await Promise.race([
          generationEntered.promise,
          generation.then((result) => {
            assert.fail(`GPU lease failed before callback: ${String(result)}`)
          }),
        ])
        preparation = f.manager.withGenerationPreparation(f.scratch, async () => {
          preparationEntered.resolve()
          await preparationReleased.promise
          return 'cpu-finished'
        })
        await Promise.race([
          preparationEntered.promise,
          preparation.then((result) => {
            assert.fail(`CPU lease failed before callback: ${String(result)}`)
          }),
        ])
        generationReleased.resolve()
        assert.equal(await generation, 'gpu-finished')
        const review = value(await f.manager.previewInstallation('repair'))
        failure(await f.manager.repair(review.token), 'RUNTIME_INSTALL_BUSY')
        assert.deepEqual(await fs.readFile(f.roots.pointerFile), previous)
      } finally {
        generationReleased.resolve()
        preparationReleased.resolve()
        await generation
        if (preparation) {
          await preparation
        }
      }
      value(await f.install('repair'))
      assert.equal((await fs.readdir(f.roots.environmentsDir)).length, 2)
    })
  },
)
