import type { ApiResult } from '../../shared/api.js'
import { ipcChannels } from '../../shared/api.js'
import type { RuntimeSetupReview } from '../../shared/runtime-setup.js'

import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type {
  ModelDownloadInput,
  RuntimeArtifactDownloadInput,
  VerifiedStagedModelFile,
} from '../models/model-downloader.js'
import type { InferenceWorkerReady } from '../projects/illustrious-txt2img-job.js'
import type { WorkerReady, WorkerSelfTestResult } from '../projects/worker-client.js'
import type { EngineMetadataInstallationBackend } from './engine-metadata-installation.js'
import type { RuntimeInstallationBackend } from './index.js'
import type {
  AuxiliaryInstallationPreview,
  AuxiliaryInstallationResult,
} from './inference-auxiliary-installer.js'
import type {
  RuntimeReleaseFile,
  RuntimeReleaseManifest,
  RuntimeReleaseSelection,
} from './runtime-release.js'

import { ModelDownloadError } from '../models/model-downloader.js'
import { GenerationWorkerClient } from '../projects/generation-worker-client.js'
import { createRuntimeRoots, RuntimeManager } from './index.js'
import {
  AuxiliaryInstallationError,
  createLamaAuxiliaryInstaller,
} from './inference-auxiliary-installer.js'
import {
  InferenceAuxiliaryResources,
  verifyInferenceAuxiliaryFile,
} from './inference-auxiliary-resources.js'
import { LAMA_OUTPAINT_ARTIFACT } from './lama-manifest.js'
import {
  OFFLINE_RUNTIME_INCOMPLETE_MARKER,
  OfflineRuntimeAssemblyError,
} from './offline-runtime-assembly.js'
import {
  RUNTIME_INSTALLATION_CLAIM,
  RUNTIME_INSTALLATION_JOURNAL,
  RuntimeInstallationError,
} from './runtime-installation.js'
import { produceRuntimeTransport } from './runtime-release-transport.js'
import {
  canonicalRuntimeReleaseJson,
  PINNED_RUNTIME_CONFIG_FILES,
  runtimeReleaseRequirements,
} from './runtime-release.js'
import { registerRuntimeSetupIpc } from './runtime-setup-ipc.js'
import { cacheRuntimeTransport } from './runtime-transport-cache.js'

/**
 * Main integration: real signed inventory, private roots, install journal and atomic pointer.
 * Assembly and startup transports are explicit controlled ports, not Python/uv qualification. The
 * lease case additionally starts a real bounded protocol child through the existing owner.
 * Invoke4875 install_staging_ledger.py + model_install_default._write_install_marker callers;
 * launcher c267bdb4 download_uv.ts checksum and install-manager command/cancel callers.
 */
const configFixture = process.env.IGS_RUNTIME_RELEASE_CONFIG_FIXTURE
const fullPayload = { skip: !configFixture }
const lamaFixture = process.env.IGS_ENGINE_LAMA_FIXTURE
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
async function fixture(workDirectory?: string) {
  assert.ok(configFixture, 'The full Main integration requires the exact pinned17 config snapshot.')
  const work =
    workDirectory ?? (await fs.mkdtemp(path.join(os.tmpdir(), 'igs-runtime-manager-install-')))
  if (workDirectory) {
    assert.equal(path.resolve(workDirectory), workDirectory)
    assert.equal(await fs.realpath(path.dirname(workDirectory)), path.dirname(workDirectory))
    await fs.mkdir(workDirectory, { mode: 0o700 })
    assert.equal(await fs.realpath(workDirectory), workDirectory)
  }
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
      // Install/Repair must use the same private root as status and operational inference.
      // The download cache is intentionally not an inference scratch directory.
      assert.equal(location.scratchBasePath, scratch)
      assert.equal((await fs.stat(location.scratchBasePath)).mode & 0o777, 0o700)
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
    keys,
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

/** Controlled auxiliary port only. Native bytes are exercised by the separate opt-in case. */
async function engineFixture(f: Fixture) {
  const transportDirectory = path.join(f.work, 'transport')
  const transport = await produceRuntimeTransport({
    outputDirectory: transportDirectory,
    publisherKeyId: 'integration-only',
    publisherPrivateKey: f.keys.privateKey,
    release: f.selection,
  })
  const controls: {
    installed: boolean
    installHook?: (options: {
      onProgress?: (progress: { downloadedBytes: number; totalBytes: number | null }) => void
      signal?: AbortSignal
    }) => Promise<void>
    rejectInstall?: string
    transformPreview?: (preview: AuxiliaryInstallationPreview) => AuxiliaryInstallationPreview
  } = { installed: false }
  const plans = new Map<string, { installed: boolean }>()
  const auxiliaryInstaller = {
    install: async (
      planId: string,
      options: {
        onProgress?: (progress: { downloadedBytes: number; totalBytes: number | null }) => void
        signal?: AbortSignal
      } = {},
    ): Promise<AuxiliaryInstallationResult> => {
      f.events.push('aux-install')
      const reviewed = plans.get(planId)
      plans.delete(planId)
      if (!reviewed || controls.rejectInstall) {
        throw new AuxiliaryInstallationError(
          controls.rejectInstall ?? 'AUXILIARY_INVALID_PLAN',
          'Controlled expired auxiliary plan',
        )
      }
      await controls.installHook?.(options)
      if (options.signal?.aborted) {
        throw new AuxiliaryInstallationError(
          'AUXILIARY_INSTALL_CANCELED',
          'Controlled auxiliary request closed after cancellation',
        )
      }
      if (reviewed.installed && !controls.installed) {
        throw new AuxiliaryInstallationError(
          'AUXILIARY_PLAN_CHANGED',
          'The reviewed installed resource changed',
        )
      }
      const reused = controls.installed
      controls.installed = true
      f.events.push('aux-installed')
      return {
        byteSize: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
        managedPath: path.join(f.work, LAMA_OUTPAINT_ARTIFACT.filename),
        reused,
        role: LAMA_OUTPAINT_ARTIFACT.role,
        sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
      }
    },
    preview: async (): Promise<AuxiliaryInstallationPreview> => {
      f.events.push('aux-preview')
      const planId = randomUUID()
      plans.set(planId, { installed: controls.installed })
      const preview: AuxiliaryInstallationPreview = {
        artifact: {
          filename: LAMA_OUTPAINT_ARTIFACT.filename,
          role: LAMA_OUTPAINT_ARTIFACT.role,
          sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
          sizeBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
        },
        expiresAt: Date.now() + 600_000,
        installed: controls.installed,
        planId,
        requiredDownloadBytes: controls.installed ? 0 : LAMA_OUTPAINT_ARTIFACT.sizeBytes,
        scope: 'auxiliary-weights',
      }
      return controls.transformPreview?.(preview) ?? preview
    },
  }
  f.backend.engine = { auxiliaryInstaller, transportDirectory }
  f.controls.auxiliary = async () => {
    assert.equal(
      controls.installed,
      true,
      'Verification never installs an absent auxiliary resource',
    )
  }
  return { auxiliaryInstaller, controls, transport, transportDirectory }
}

test(
  'engine review binds the verified cached runtime and pinned LaMa without installing or inventing a disk peak',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const engine = await engineFixture(f)
      const review = value(await f.manager.previewInstallation('install'))
      assert.ok(review.scope === 'engine')
      assert.equal(review.requiredFreeBytes, null)
      assert.equal(review.runtimeRequiredFreeBytes, f.manifest.requiredFreeBytes)
      assert.equal(review.plan.totals.downloadBytes, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
      assert.equal(review.plan.totals.installedBytes, null)
      assert.equal(review.plan.totals.additionalInstalledBytes, null)
      const runtime = review.plan.artifacts.find((artifact) => artifact.kind === 'runtime')
      assert.ok(runtime)
      assert.equal(runtime.filename, engine.transport.manifest.artifact.filename)
      assert.equal(runtime.sha256, engine.transport.manifest.artifact.sha256)
      assert.equal(runtime.sizeBytes, engine.transport.manifest.artifact.sizeBytes)
      assert.equal(runtime.sourceCached, true)
      assert.equal(runtime.reused, false)
      assert.deepEqual(review.plan.unknownInstalledSizeArtifactIds, [runtime.id])
      assert.deepEqual(f.events, ['aux-preview'])
      await absent(f.roots.pointerFile)
      assert.deepEqual(await fs.readdir(f.roots.environmentsDir), [])
      assert.equal('planId' in review, false)
      assert.equal('transportDirectory' in review, false)
      assert.equal('trustedKeys' in review, false)
    })
  },
)

test(
  'explicit engine install prepares LaMa after host admission and re-verifies it around both qualification phases',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const engine = await engineFixture(f)
      const review = value(await f.manager.previewInstallation('install'))
      const result = value(await f.manager.install(review.token))
      assert.equal(result.kind, 'ready')
      assert.equal(engine.controls.installed, true)
      assert.ok(f.events.indexOf('host') < f.events.indexOf('aux-install'))
      assert.ok(f.events.indexOf('aux-installed') < f.events.indexOf('assemble'))
      assert.equal(f.events.filter((event) => event === 'auxiliary').length, 3)
      assert.ok(f.events.lastIndexOf('auxiliary') > f.events.indexOf('gpu-closed-2'))
      failure(await f.manager.install(review.token), 'RUNTIME_INVALID_REVIEW')
      assert.equal(f.events.filter((event) => event === 'aux-install').length, 1)
      const previous = await fs.readFile(f.roots.pointerFile)
      const repair = value(await f.manager.previewInstallation('repair'))
      assert.ok(repair.scope === 'engine')
      assert.equal(repair.plan.totals.downloadBytes, 0)
      assert.equal(repair.plan.totals.additionalInstalledBytes, null)
      assert.equal(
        repair.plan.artifacts.find((artifact) => artifact.kind === 'outpaint-infill')?.reused,
        true,
      )
      failure(await f.manager.install(repair.token), 'RUNTIME_INVALID_REVIEW')
      value(await f.manager.repair(repair.token))
      assert.notDeepEqual(await fs.readFile(f.roots.pointerFile), previous)
      assert.equal(f.events.filter((event) => event === 'aux-install').length, 2)
      assert.equal(f.events.filter((event) => event === 'auxiliary').length, 6)
    })
  },
)

test(
  'engine review rejects a nonpinned auxiliary preview before install, assembly or workers',
  fullPayload,
  async (t) => {
    for (const kind of ['filename', 'role', 'sha256', 'sizeBytes', 'scope', 'download'] as const) {
      await t.test(kind, async () => {
        await withFixture(async (f) => {
          const engine = await engineFixture(f)
          engine.controls.transformPreview = (preview) => {
            const changed = structuredClone(preview)
            if (kind === 'scope') {
              Reflect.set(changed, 'scope', 'complete-engine')
            } else if (kind === 'download') {
              Reflect.set(changed, 'requiredDownloadBytes', 1)
            } else {
              Reflect.set(changed.artifact, kind, kind === 'sizeBytes' ? 1 : 'wrong')
            }
            return changed
          }
          failure(
            await f.manager.previewInstallation('install'),
            'RUNTIME_INSTALL_PREPARATION_INVALID',
          )
          assert.deepEqual(f.events, ['aux-preview'])
          await absent(f.roots.pointerFile)
          assert.deepEqual(await fs.readdir(f.roots.environmentsDir), [])
        })
      })
    }
  },
)

test(
  'a signed transport for different envelope bytes cannot be attached to the reviewed expanded runtime',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      await engineFixture(f)
      // Same valid signed canonical payload, differently encoded outer envelope bytes.
      const changed = Buffer.from(
        JSON.stringify(JSON.parse(f.selection.envelope.toString()), null, 2),
      )
      assert.notDeepEqual(changed, f.selection.envelope)
      f.backend.loadRelease = async () => ({ ...f.selection, envelope: changed })
      failure(await f.manager.previewInstallation('install'), 'RUNTIME_INSTALL_PREPARATION_INVALID')
      assert.deepEqual(f.events, [])
      await absent(f.roots.pointerFile)
    })
  },
)

test(
  'cached transport drift after engine review refuses before spending auxiliary bytes and exact restoration permits a fresh review',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const engine = await engineFixture(f)
      const review = value(await f.manager.previewInstallation('install'))
      const archive = path.join(engine.transportDirectory, 'runtime-payload.zip')
      const original = await fs.readFile(archive)
      const changed = Buffer.from(original)
      changed[0] ^= 1
      await fs.writeFile(archive, changed)
      failure(await f.manager.install(review.token), 'RUNTIME_TRANSPORT_CHANGED')
      assert.equal(f.events.includes('aux-install'), false)
      assert.equal(f.events.includes('assemble'), false)
      await absent(f.roots.pointerFile)
      await fs.writeFile(archive, original)
      value(await f.install())
      assert.equal(engine.controls.installed, true)
    })
  },
)

test(
  'a superseded runtime pointer revokes engine review before auxiliary preparation',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      value(await f.install())
      const engine = await engineFixture(f)
      engine.controls.installed = true
      const review = value(await f.manager.previewInstallation('repair'))
      const other = new RuntimeManager(
        f.roots,
        { arch: 'x64', platform: 'linux' },
        async () => ({ close: async () => {}, ready: gpuReady }),
        f.backend,
      )
      value(await other.install(value(await other.previewInstallation('install')).token))
      const replaced = await fs.readFile(f.roots.pointerFile)
      const auxiliaryCalls = f.events.filter((event) => event === 'aux-install').length
      const assemblies = f.events.filter((event) => event === 'assemble').length
      failure(await f.manager.repair(review.token), 'RUNTIME_INSTALL_POINTER_CHANGED')
      assert.equal(f.events.filter((event) => event === 'aux-install').length, auxiliaryCalls)
      assert.equal(f.events.filter((event) => event === 'assemble').length, assemblies)
      assert.deepEqual(await fs.readFile(f.roots.pointerFile), replaced)
    })
  },
)

test(
  'expired or changed reviewed auxiliary state refuses before runtime assembly and cannot silently add a download',
  fullPayload,
  async (t) => {
    for (const kind of ['expired', 'changed'] as const) {
      await t.test(kind, async () => {
        await withFixture(async (f) => {
          const engine = await engineFixture(f)
          engine.controls.installed = kind === 'changed'
          const review = value(await f.manager.previewInstallation('install'))
          if (kind === 'expired') {
            engine.controls.rejectInstall = 'AUXILIARY_INVALID_PLAN'
          } else {
            engine.controls.installed = false
          }
          failure(
            await f.manager.install(review.token),
            kind === 'expired' ? 'AUXILIARY_INVALID_PLAN' : 'AUXILIARY_PLAN_CHANGED',
          )
          assert.equal(f.events.filter((event) => event === 'aux-install').length, 1)
          assert.equal(f.events.includes('assemble'), false)
          await absent(f.roots.pointerFile)
          assert.deepEqual(await fs.readdir(f.roots.environmentsDir), [])
        })
      })
    }
  },
)

test(
  'engine cancellation awaits the owned auxiliary request close and cannot advance to assembly',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const engine = await engineFixture(f)
      const entered = deferred()
      const closed = deferred()
      let signal: AbortSignal | undefined
      engine.controls.installHook = async (options) => {
        signal = options.signal
        entered.resolve()
        await closed.promise
        f.events.push('aux-closed')
      }
      const operation = f.install()
      await Promise.race([
        entered.promise,
        operation.then((result) =>
          assert.fail(`Engine install ended before auxiliary admission: ${JSON.stringify(result)}`),
        ),
      ])
      let settled = false
      const cancellation = f.manager.cancelInstallation().then(() => {
        settled = true
      })
      try {
        await Promise.resolve()
        assert.equal(signal?.aborted, true)
        assert.equal(settled, false)
        assert.equal(f.events.includes('assemble'), false)
        await absent(f.roots.pointerFile)
      } finally {
        closed.resolve()
      }
      await cancellation
      const result = await operation
      assert.equal(result.ok, false)
      assert.equal(f.events.includes('aux-closed'), true)
      assert.equal(f.events.includes('aux-installed'), false)
      assert.equal(f.events.includes('assemble'), false)
      await absent(f.roots.pointerFile)
    })
  },
)

test(
  'failed postactivation engine qualification retains verified auxiliary state and restores the previous pointer',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const engine = await engineFixture(f)
      value(await f.install())
      const previous = await fs.readFile(f.roots.pointerFile)
      f.controls.gpuReady = (number) =>
        number === 4 ? { ...gpuReady, workerVersion: 'unknown' } : gpuReady
      failure(await f.install('repair'), 'RUNTIME_INSTALL_FAILED')
      assert.equal(engine.controls.installed, true)
      assert.deepEqual(await fs.readFile(f.roots.pointerFile), previous)
      assert.ok(f.events.includes('gpu-closed-4'))
      assert.equal((await fs.readdir(f.roots.environmentsDir)).length, 2)
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
  'changed auxiliary health after either qualification phase refuses engine activation or rolls it back',
  fullPayload,
  async (t) => {
    for (const phase of ['before-activation', 'after-activation'] as const) {
      await t.test(phase, async () => {
        await withFixture(async (f) => {
          const engine = await engineFixture(f)
          value(await f.install())
          const previous = await fs.readFile(f.roots.pointerFile)
          const failingGpu = phase === 'before-activation' ? 3 : 4
          f.controls.gpuClose = async (number) => {
            if (number === failingGpu) {
              engine.controls.installed = false
            }
          }
          failure(await f.install('repair'), 'RUNTIME_INSTALL_FAILED')
          assert.deepEqual(await fs.readFile(f.roots.pointerFile), previous)
          assert.ok(f.events.includes(`gpu-closed-${failingGpu}`))
          const journal = JSON.parse(
            await fs.readFile(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL), 'utf8'),
          )
          assert.equal(journal.phase, phase === 'before-activation' ? 'failed' : 'rolled-back')
        })
      })
    }
  },
)

test(
  'actual pinned LaMa publication, reuse and repair run through the existing engine and filesystem owners',
  { skip: !configFixture || !lamaFixture },
  async () => {
    assert.ok(lamaFixture)
    const retained = process.env.IGS_ENGINE_LAMA_EVIDENCE_DIRECTORY
    if (retained) {
      const allowed = path.join(
        os.homedir(),
        '.codex/artifacts/imagegen-studio/runs/engine-lama-composition',
      )
      assert.equal(path.resolve(retained), retained)
      assert.ok(retained.startsWith(allowed + path.sep))
      assert.equal(path.basename(path.dirname(retained)), 'payloads')
    }
    await verifyInferenceAuxiliaryFile({
      byteSize: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
      managedPath: lamaFixture,
      sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
    })
    const f = await fixture(retained)
    const report: Record<string, unknown> = {
      keyScope: 'ephemeral test signing key; only public keyring serialized',
      nativeGpuQualified: false,
      nativePackageInstallationQualified: false,
      outcome: 'RUNNING',
      publicEndpointQualified: false,
      scope:
        'actual pinned LaMa filesystem publication with controlled runtime assembly and worker ports',
      sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
      sizeBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
      source: lamaFixture,
      trustedKeys: f.selection.trustedKeys,
      work: f.work,
    }
    let downloads = 0
    try {
      const engine = await engineFixture(f)
      const resourcesDirectory = path.join(f.work, 'inference-resources')
      await fs.mkdir(resourcesDirectory, { mode: 0o700 })
      const installer = createLamaAuxiliaryInstaller(resourcesDirectory, {
        download: async (request: ModelDownloadInput) => {
          downloads++
          assert.equal(request.source, 'invoke-lama')
          assert.equal(request.url, LAMA_OUTPAINT_ARTIFACT.url)
          assert.equal(request.expectedBytes, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
          assert.equal(request.expectedSha256, LAMA_OUTPAINT_ARTIFACT.sha256)
          assert.equal(request.bearerToken, undefined)
          const stagingPath = path.join(request.stagingDirectory, `${randomUUID()}.part`)
          await fs.copyFile(lamaFixture, stagingPath, constants.COPYFILE_EXCL)
          await fs.chmod(stagingPath, 0o600)
          request.onProgress?.({
            downloadedBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
            totalBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
          })
          return {
            sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
            sizeBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
            stagingPath,
          }
        },
      })
      f.backend.engine = {
        auxiliaryInstaller: installer,
        transportDirectory: engine.transportDirectory,
      }
      const resources = new InferenceAuxiliaryResources(resourcesDirectory)
      f.controls.auxiliary = async () => {
        await resources.resolveVerifiedOutpaintInfill()
      }
      const initial = value(await f.manager.previewInstallation('install'))
      assert.ok(initial.scope === 'engine')
      assert.equal(initial.plan.totals.downloadBytes, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
      assert.equal(downloads, 0)
      const installed = value(await f.manager.install(initial.token))
      assert.equal(downloads, 1)
      const actual = await resources.resolveVerifiedOutpaintInfill()
      assert.notEqual(actual.managedPath, lamaFixture)
      assert.notEqual((await fs.stat(actual.managedPath)).ino, (await fs.stat(lamaFixture)).ino)
      const firstPointer = await fs.readFile(f.roots.pointerFile)
      const repair = value(await f.manager.previewInstallation('repair'))
      assert.ok(repair.scope === 'engine')
      assert.equal(repair.plan.totals.downloadBytes, 0)
      assert.equal(repair.plan.totals.additionalInstalledBytes, null)
      const repaired = value(await f.manager.repair(repair.token))
      assert.notEqual(repaired.runtimeId, installed.runtimeId)
      assert.equal(downloads, 1)
      const beforeFailedRepair = await fs.readFile(f.roots.pointerFile)
      f.controls.gpuReady = (number) =>
        number === 6 ? { ...gpuReady, workerVersion: 'unknown' } : gpuReady
      failure(await f.install('repair'), 'RUNTIME_INSTALL_FAILED')
      assert.equal(downloads, 1)
      assert.deepEqual(await fs.readFile(f.roots.pointerFile), beforeFailedRepair)
      await resources.resolveVerifiedOutpaintInfill()
      await verifyInferenceAuxiliaryFile({
        byteSize: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
        managedPath: lamaFixture,
        sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
      })
      assert.deepEqual(await fs.readdir(resourcesDirectory), [LAMA_OUTPAINT_ARTIFACT.filename])
      report.outcome = 'PASS'
      report.downloadCalls = downloads
      report.publication = actual
      report.firstPointer = JSON.parse(firstPointer.toString())
      report.previousPointer = JSON.parse(beforeFailedRepair.toString())
      report.currentPointer = JSON.parse((await fs.readFile(f.roots.pointerFile)).toString())
      report.exactRollback = true
      report.sourceStillVerified = true
      report.events = [...f.events]
    } catch (error) {
      report.outcome = 'FAIL'
      report.error = error instanceof Error ? error.message : 'Actual LaMa integration failed'
      throw error
    } finally {
      await f.manager.cancelInstallation()
      report.readersClosed = true
      await (retained
        ? fs.writeFile(
            path.join(f.work, 'engine-lama-result.json'),
            `${JSON.stringify(report, null, 2)}\n`,
            { flag: 'wx', mode: 0o600 },
          )
        : fs.rm(f.work, { force: true, recursive: true }))
    }
  },
)

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

test(
  'public engine IPC uses the existing real review/controller, preserves byte meanings and consumes exact intent',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const handlers = new Map<
        string,
        (
          event: { sender: unknown; senderFrame: unknown },
          ...args: unknown[]
        ) => Promise<ApiResult<unknown>>
      >()
      const caller = { mainFrame: {} }
      const registration = registerRuntimeSetupIpc(
        {
          handle: (channel, handler) => {
            handlers.set(channel, handler)
          },
          removeHandler: (channel) => {
            handlers.delete(channel)
          },
        },
        caller,
        f.manager,
      )
      const call = (channel: string, ...args: unknown[]) =>
        handlers.get(channel)!({ sender: caller, senderFrame: caller.mainFrame }, ...args)
      const review = async (mode: 'install' | 'repair') =>
        value(
          (await call(
            ipcChannels.runtime.previewInstallation,
            mode,
          )) as ApiResult<RuntimeSetupReview>,
        )
      try {
        const slot = await call(ipcChannels.runtime.previewInstallation, 'install')
        assert.equal(
          slot.ok,
          false,
          'A signed Python-only slot cannot authorize the public engine API.',
        )
        await absent(f.roots.pointerFile)
        const engine = await engineFixture(f)
        const first = await review('install')
        assert.equal(first.scope, 'engine')
        assert.equal(first.source, 'verified-local-cache')
        assert.equal(first.runtimeSourceCached, true)
        assert.equal(first.outpaintInfillReused, false)
        assert.equal(first.downloadBytes, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
        assert.equal(first.requiredFreeBytes, null)
        assert.equal(first.runtimeRequiredFreeBytes, f.manifest.requiredFreeBytes)
        assert.equal(first.installedBytes, null)
        assert.equal(first.additionalInstalledBytes, null)
        const exposed = JSON.stringify(first)
        for (const forbidden of [
          f.work,
          'trustedKeys',
          'planId',
          'verifiedPayloadBytes',
          'pythonExecutable',
          'sha256',
        ]) {
          assert.equal(
            exposed.includes(forbidden),
            false,
            'Only the public path-free byte review may cross IPC.',
          )
        }
        assert.equal(f.events.includes('aux-install'), false)
        assert.equal(f.events.includes('assemble'), false)
        assert.equal((await call(ipcChannels.runtime.repair, first.token)).ok, false)
        const installed = value(
          (await call(ipcChannels.runtime.install, first.token)) as ApiResult<
            import('../../shared/api.js').RuntimeStatus
          >,
        )
        assert.equal(installed.kind, 'ready')
        assert.equal(engine.controls.installed, true)
        assert.equal((await call(ipcChannels.runtime.install, first.token)).ok, false)
        const original = await fs.readFile(f.roots.pointerFile)
        const discarded = await review('repair')
        assert.equal(discarded.downloadBytes, 0)
        assert.equal(discarded.outpaintInfillReused, true)
        value(await call(ipcChannels.runtime.discardInstallationReview))
        assert.equal((await call(ipcChannels.runtime.repair, discarded.token)).ok, false)
        const navigated = await review('repair')
        registration.invalidateReview()
        assert.equal((await call(ipcChannels.runtime.repair, navigated.token)).ok, false)
        const failedPreview = await review('repair')
        const load = f.backend.loadRelease
        f.backend.loadRelease = async () => null
        assert.equal((await call(ipcChannels.runtime.previewInstallation, 'repair')).ok, false)
        assert.equal((await call(ipcChannels.runtime.repair, failedPreview.token)).ok, false)
        assert.equal((await fs.readFile(f.roots.pointerFile)).equals(original), true)
        f.backend.loadRelease = load
        const final = await review('repair')
        value(await call(ipcChannels.runtime.repair, final.token))
        assert.equal((await fs.readFile(f.roots.pointerFile)).equals(original), false)
        assert.equal(f.events.filter((event) => event === 'assemble').length, 2)
        assert.equal(f.events.filter((event) => event === 'aux-install').length, 2)
        assert.equal(
          (await call(ipcChannels.runtime.repair)).ok,
          false,
          'Legacy zero-arg actions never mutate even when configured.',
        )
        assert.equal(f.events.filter((event) => event === 'assemble').length, 2)
      } finally {
        registration.dispose()
      }
    })
  },
)

test(
  'public engine preview normalizes actual missing-transport diagnostics without exposing local paths',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const engine = await engineFixture(f)
      await fs.rm(engine.transportDirectory, { recursive: true })
      const handlers = new Map<
        string,
        (
          event: { sender: unknown; senderFrame: unknown },
          ...args: unknown[]
        ) => Promise<ApiResult<unknown>>
      >()
      const caller = { mainFrame: {} }
      const registration = registerRuntimeSetupIpc(
        {
          handle: (channel, handler) => {
            handlers.set(channel, handler)
          },
        },
        caller,
        f.manager,
      )
      try {
        const result = await handlers.get(ipcChannels.runtime.previewInstallation)!(
          { sender: caller, senderFrame: caller.mainFrame },
          'install',
        )
        assert.equal(result.ok, false)
        assert.equal(JSON.stringify(result).includes(f.work), false)
        assert.equal(JSON.stringify(result).includes('ENOENT'), false)
        assert.equal(f.events.includes('assemble'), false)
        assert.equal(f.events.includes('aux-install'), false)
        await absent(f.roots.pointerFile)
      } finally {
        registration.dispose()
      }
    })
  },
)

type MetadataSetupHandler = Parameters<Parameters<typeof registerRuntimeSetupIpc>[0]['handle']>[1]

/**
 * Invoke4875 download_default.py:241 prepares parts before submit_multifile_download:281;
 * model_install_default.py:1606 pins metadata before obtaining bytes. Callers reread: infill.py:134
 * -> invocation_context.py:800 -> download_and_cache_model:1549. This fixture exercises the real
 * signed transport/cache/extractor/Main controller with controlled archive acquisition, auxiliary
 * resource, assembly and worker ports; it does not qualify public DNS, shipping trust, package
 * assembly or native inference.
 */
async function metadataEngineFixture(f: Fixture) {
  const engine = await engineFixture(f)
  const selection = {
    appVersion: f.selection.appVersion,
    cacheDirectory: path.join(f.work, 'metadata-cache'),
    runtimeEnvelope: Buffer.from(f.selection.envelope),
    source: {
      redirectOrigins: ['https://cdn.example.org'],
      url: 'https://example.org/reviewed-runtime.zip',
    },
    transportEnvelope: await fs.readFile(
      path.join(engine.transportDirectory, 'runtime-transport.json'),
    ),
    trustedKeys: { ...f.selection.trustedKeys },
  }
  const controls: {
    corruptArchive?: boolean
    downloadHook?: (request: RuntimeArtifactDownloadInput) => Promise<void>
    loads: number
  } = { loads: 0 }
  const downloads: RuntimeArtifactDownloadInput[] = []
  const preparedDirectories: string[] = []
  const downloader = {
    downloadRuntimeArtifact: async (
      request: RuntimeArtifactDownloadInput,
    ): Promise<VerifiedStagedModelFile> => {
      downloads.push(request)
      f.events.push('runtime-download')
      await controls.downloadHook?.(request)
      if (request.signal?.aborted) {
        throw new ModelDownloadError(
          'DOWNLOAD_CANCELED',
          'Controlled acquisition settled after cancellation.',
        )
      }
      const bytes = await fs.readFile(path.join(engine.transportDirectory, 'runtime-payload.zip'))
      if (controls.corruptArchive) {
        bytes[0] ^= 1
      }
      const stagingPath = path.join(request.stagingDirectory, `${randomUUID()}.part`)
      await fs.writeFile(stagingPath, bytes, { flag: 'wx', mode: 0o600 })
      request.onProgress?.({ downloadedBytes: bytes.length, totalBytes: request.expectedBytes })
      return { sha256: digest(bytes), sizeBytes: bytes.length, stagingPath }
    },
  }
  const backend: EngineMetadataInstallationBackend = {
    auxiliaryInstaller: engine.auxiliaryInstaller,
    downloader,
    loadMetadata: async () => {
      controls.loads++
      return selection
    },
  }
  f.backend.engine = undefined
  f.backend.loadRelease = undefined
  f.backend.metadata = backend
  const assemble = f.backend.assemble
  assert.ok(assemble)
  f.backend.assemble = async (request) => {
    assert.notEqual(
      request.release.directory,
      f.directory,
      'Assembly must receive the actual extracted selection.',
    )
    await request.release.verifyCompletePayloadSnapshot()
    preparedDirectories.push(request.release.directory)
    return await assemble(request)
  }
  return {
    ...engine,
    controls,
    downloads,
    engineControls: engine.controls,
    preparedDirectories,
    primeCache: async () => await cacheRuntimeTransport({ ...selection, downloader }),
    selection,
  }
}
function metadataSetupRegistrar(f: Fixture) {
  const handlers = new Map<string, MetadataSetupHandler>()
  const caller = { mainFrame: {} }
  const registration = registerRuntimeSetupIpc(
    {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => {
        handlers.delete(channel)
      },
    },
    caller,
    f.manager,
  )
  async function call<T = unknown>(channel: string, ...args: unknown[]): Promise<ApiResult<T>> {
    return (await handlers.get(channel)!(
      { sender: caller, senderFrame: caller.mainFrame },
      ...args,
    )) as ApiResult<T>
  }
  return {
    call,
    dispose: registration.dispose,
    invalidateReview: registration.invalidateReview,
    preview: async (mode: 'install' | 'repair') =>
      value(await call<RuntimeSetupReview>(ipcChannels.runtime.previewInstallation, mode)),
  }
}

test(
  'metadata-first public engine review defers real cache and extraction until exact token confirmation',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const metadata = await metadataEngineFixture(f)
      const ipc = metadataSetupRegistrar(f)
      try {
        const review = await ipc.preview('install')
        assert.equal(review.source, 'verified-metadata')
        assert.equal(review.runtimeSourceCached, false)
        assert.equal(
          review.downloadBytes,
          metadata.transport.manifest.artifact.sizeBytes + LAMA_OUTPAINT_ARTIFACT.sizeBytes,
        )
        assert.equal(review.requiredFreeBytes, null)
        assert.equal(review.runtimeRequiredFreeBytes, f.manifest.requiredFreeBytes)
        assert.equal(review.installedBytes, null)
        assert.equal(review.additionalInstalledBytes, null)
        assert.equal(metadata.controls.loads, 1)
        assert.equal(metadata.downloads.length, 0)
        assert.equal(metadata.preparedDirectories.length, 0)
        assert.deepEqual(f.events, ['aux-preview'])
        await absent(metadata.selection.cacheDirectory)
        await absent(path.join(f.roots.downloadsDir, `engine-${review.token}`))
        await absent(f.roots.pointerFile)
        assert.deepEqual(await fs.readdir(f.roots.environmentsDir), [])
        const installed = value(
          await ipc.call<import('../../shared/api.js').RuntimeStatus>(
            ipcChannels.runtime.install,
            review.token,
          ),
        )
        assert.equal(installed.kind, 'ready')
        assert.equal(metadata.controls.loads, 1, 'Confirmation must not reload latest metadata.')
        assert.equal(metadata.downloads.length, 1)
        assert.equal(
          metadata.downloads[0].expectedSha256,
          metadata.transport.manifest.artifact.sha256,
        )
        assert.equal(
          metadata.downloads[0].expectedBytes,
          metadata.transport.manifest.artifact.sizeBytes,
        )
        assert.ok(f.events.indexOf('host') < f.events.indexOf('runtime-download'))
        assert.equal(metadata.preparedDirectories.length, 1)
        assert.ok(
          metadata.preparedDirectories[0].startsWith(
            path.join(f.roots.downloadsDir, `engine-${review.token}`) + path.sep,
          ),
        )
        const pointer = await fs.readFile(f.roots.pointerFile)
        failure(await ipc.call(ipcChannels.runtime.install, review.token), 'RUNTIME_INVALID_REVIEW')
        const repair = await ipc.preview('repair')
        assert.equal(repair.source, 'verified-metadata')
        assert.equal(repair.runtimeSourceCached, true)
        assert.equal(repair.outpaintInfillReused, true)
        assert.equal(repair.downloadBytes, 0)
        value(await ipc.call(ipcChannels.runtime.repair, repair.token))
        assert.equal(
          metadata.downloads.length,
          1,
          'Repair must reuse the freshly verified complete source cache.',
        )
        assert.equal(metadata.preparedDirectories.length, 2)
        assert.notEqual(metadata.preparedDirectories[1], metadata.preparedDirectories[0])
        assert.equal((await fs.readFile(f.roots.pointerFile)).equals(pointer), false)
        assert.equal(f.events.filter((event) => event === 'assemble').length, 2)
      } finally {
        ipc.dispose()
      }
    })
  },
)

test(
  'metadata-first public dismissal, document invalidation and superseding preview refuse acquisition',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const metadata = await metadataEngineFixture(f)
      const ipc = metadataSetupRegistrar(f)
      try {
        const dismissed = await ipc.preview('install')
        value(await ipc.call(ipcChannels.runtime.discardInstallationReview))
        failure(
          await ipc.call(ipcChannels.runtime.install, dismissed.token),
          'RUNTIME_INVALID_REVIEW',
        )
        const navigated = await ipc.preview('install')
        ipc.invalidateReview()
        failure(
          await ipc.call(ipcChannels.runtime.install, navigated.token),
          'RUNTIME_INVALID_REVIEW',
        )
        const superseded = await ipc.preview('install')
        const current = await ipc.preview('install')
        failure(
          await ipc.call(ipcChannels.runtime.install, superseded.token),
          'RUNTIME_INVALID_REVIEW',
        )
        assert.equal(metadata.downloads.length, 0)
        assert.equal(metadata.preparedDirectories.length, 0)
        assert.equal(f.events.includes('assemble'), false)
        await absent(metadata.selection.cacheDirectory)
        await absent(f.roots.pointerFile)
        value(await ipc.call(ipcChannels.runtime.install, current.token))
        assert.equal(metadata.downloads.length, 1)
        assert.equal(metadata.preparedDirectories.length, 1)
      } finally {
        ipc.dispose()
      }
    })
  },
)

test(
  'metadata-first capture keeps signed A, source policy and keyring after mutable provider inputs change',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const metadata = await metadataEngineFixture(f)
      const selectedCache = metadata.selection.cacheDirectory
      const source = structuredClone(metadata.selection.source)
      const review = value(await f.manager.previewInstallation('install'))
      metadata.selection.runtimeEnvelope.fill(0)
      metadata.selection.transportEnvelope.fill(0)
      metadata.selection.source.url = 'https://other.example.org/changed.zip'
      metadata.selection.source.redirectOrigins.splice(0)
      metadata.selection.cacheDirectory = path.join(f.work, 'different-cache')
      metadata.selection.appVersion = '99.0.0'
      Reflect.deleteProperty(metadata.selection.trustedKeys, 'integration-only')
      value(await f.manager.install(review.token))
      assert.equal(metadata.controls.loads, 1)
      assert.equal(metadata.downloads.length, 1)
      assert.equal(metadata.downloads[0].url, source.url)
      assert.deepEqual(metadata.downloads[0].redirectOrigins, source.redirectOrigins)
      assert.equal(
        metadata.downloads[0].expectedSha256,
        metadata.transport.manifest.artifact.sha256,
      )
      assert.equal(
        (await fs.stat(path.join(selectedCache, 'transport', 'runtime-payload.zip'))).isFile(),
        true,
      )
      await absent(metadata.selection.cacheDirectory)
      const journal = JSON.parse(
        await fs.readFile(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL), 'utf8'),
      )
      assert.equal(journal.prepared.releaseId, f.manifest.releaseId)
      assert.equal(journal.prepared.manifestSha256, digest(canonicalRuntimeReleaseJson(f.manifest)))
    })
  },
)

test(
  'metadata-first host and reviewed pointer refusal precede runtime acquisition',
  fullPayload,
  async (t) => {
    for (const refusal of ['host', 'pointer'] as const) {
      await t.test(refusal, async () => {
        await withFixture(async (f) => {
          const metadata = await metadataEngineFixture(f)
          const review = value(await f.manager.previewInstallation('install'))
          let changedPointer: Buffer | undefined
          if (refusal === 'host') {
            f.controls.host = async () => {
              throw new Error('Controlled incompatible host.')
            }
          } else {
            changedPointer = Buffer.from(
              'Owned competing pointer bytes; never qualified as a runtime.',
            )
            await fs.writeFile(f.roots.pointerFile, changedPointer, { flag: 'wx', mode: 0o600 })
          }
          const result = await f.manager.install(review.token)
          failure(
            result,
            refusal === 'pointer' ? 'RUNTIME_INSTALL_POINTER_CHANGED' : 'RUNTIME_INSTALL_FAILED',
          )
          assert.equal(metadata.downloads.length, 0)
          assert.equal(metadata.preparedDirectories.length, 0)
          assert.equal(f.events.includes('aux-install'), false)
          assert.equal(f.events.includes('assemble'), false)
          await absent(metadata.selection.cacheDirectory)
          assert.deepEqual(await fs.readdir(f.roots.environmentsDir), [])
          if (changedPointer) {
            assert.equal((await fs.readFile(f.roots.pointerFile)).equals(changedPointer), true)
          } else {
            await absent(f.roots.pointerFile)
          }
          failure(await f.manager.install(review.token), 'RUNTIME_INVALID_REVIEW')
        })
      })
    }
  },
)

test(
  'metadata-first cached review cannot spend an unreviewed transfer after source cache loss or corruption',
  fullPayload,
  async (t) => {
    for (const drift of ['missing', 'corrupt'] as const) {
      await t.test(drift, async () => {
        await withFixture(async (f) => {
          const metadata = await metadataEngineFixture(f)
          metadata.engineControls.installed = true
          await metadata.primeCache()
          const transfers = metadata.downloads.length
          const review = value(await f.manager.previewInstallation('install'))
          assert.equal(review.scope, 'engine')
          if (review.scope !== 'engine') {
            throw new Error('Expected complete engine review.')
          }
          const runtime = review.plan.artifacts.find((artifact) => artifact.kind === 'runtime')
          assert.equal(runtime?.sourceCached, true)
          assert.equal(review.plan.totals.downloadBytes, 0)
          if (drift === 'missing') {
            await fs.rm(metadata.selection.cacheDirectory, { recursive: true })
          } else {
            const archive = path.join(
              metadata.selection.cacheDirectory,
              'transport',
              'runtime-payload.zip',
            )
            const bytes = await fs.readFile(archive)
            bytes[0] ^= 1
            await fs.writeFile(archive, bytes)
          }
          assert.equal((await f.manager.install(review.token)).ok, false)
          assert.equal(
            metadata.downloads.length,
            transfers,
            'Lost verified cache must require a fresh byte review, never hidden download.',
          )
          assert.equal(metadata.preparedDirectories.length, 0)
          assert.equal(f.events.includes('aux-install'), false)
          assert.equal(f.events.includes('assemble'), false)
          assert.deepEqual(await fs.readdir(f.roots.environmentsDir), [])
          await absent(f.roots.pointerFile)
          failure(await f.manager.install(review.token), 'RUNTIME_INVALID_REVIEW')
        })
      })
    }
  },
)

test(
  'metadata-first cancellation settles acquisition before returning and never activates a slot',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const metadata = await metadataEngineFixture(f)
      const entered = deferred()
      let signal: AbortSignal | undefined
      let settled = false
      metadata.controls.downloadHook = async (request) => {
        signal = request.signal
        assert.ok(signal)
        entered.resolve()
        await new Promise<void>((resolve) =>
          signal!.addEventListener('abort', () => resolve(), { once: true }),
        )
        settled = true
      }
      const review = value(await f.manager.previewInstallation('install'))
      const operation = f.manager.install(review.token)
      await entered.promise
      await f.manager.cancelInstallation()
      assert.equal((await operation).ok, false)
      assert.equal(signal?.aborted, true)
      assert.equal(settled, true)
      assert.equal(metadata.downloads.length, 1)
      assert.equal(metadata.preparedDirectories.length, 0)
      assert.equal(f.events.includes('aux-install'), false)
      assert.equal(f.events.includes('assemble'), false)
      assert.deepEqual(await fs.readdir(f.roots.environmentsDir), [])
      await absent(f.roots.pointerFile)
      failure(await f.manager.install(review.token), 'RUNTIME_INVALID_REVIEW')
    })
  },
)

test(
  'metadata-first failed acquisition preserves no activation and requires a new explicit review',
  fullPayload,
  async (t) => {
    for (const refusal of ['network', 'archive-hash'] as const) {
      await t.test(refusal, async () => {
        await withFixture(async (f) => {
          const metadata = await metadataEngineFixture(f)
          if (refusal === 'network') {
            metadata.controls.downloadHook = async () => {
              throw new ModelDownloadError('DOWNLOAD_NETWORK_ERROR', 'Controlled network refusal.')
            }
          } else {
            metadata.controls.corruptArchive = true
          }
          const review = value(await f.manager.previewInstallation('install'))
          assert.equal((await f.manager.install(review.token)).ok, false)
          assert.equal(metadata.downloads.length, 1)
          assert.equal(metadata.preparedDirectories.length, 0)
          assert.equal(f.events.includes('assemble'), false)
          assert.equal(f.events.includes('aux-install'), false)
          await absent(f.roots.pointerFile)
          failure(await f.manager.install(review.token), 'RUNTIME_INVALID_REVIEW')
          // A new explicit Main selection may choose fresh owned staging. It is not an automatic
          // fallback: the failed owner remains intact until the fixture's normal final cleanup.
          metadata.selection.cacheDirectory = path.join(f.work, 'explicit-new-cache')
          metadata.controls.downloadHook = undefined
          metadata.controls.corruptArchive = false
          const fresh = value(await f.manager.previewInstallation('install'))
          assert.notEqual(fresh.token, review.token)
          assert.equal(metadata.downloads.length, 1)
          value(await f.manager.install(fresh.token))
          assert.equal(metadata.downloads.length, 2)
          assert.equal(metadata.preparedDirectories.length, 1)
        })
      })
    }
  },
)

test(
  'metadata-first untrusted envelopes fail before auxiliary preview or acquisition',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const metadata = await metadataEngineFixture(f)
      Reflect.deleteProperty(metadata.selection.trustedKeys, 'integration-only')
      assert.equal((await f.manager.previewInstallation('install')).ok, false)
      assert.equal(metadata.downloads.length, 0)
      assert.deepEqual(f.events, [])
      await absent(metadata.selection.cacheDirectory)
      await absent(f.roots.pointerFile)
      assert.deepEqual(await fs.readdir(f.roots.environmentsDir), [])
    })
  },
)

type SetupProgressSnapshot = ReturnType<RuntimeManager['getInstallationProgress']>
type SetupProgressOperation = NonNullable<SetupProgressSnapshot['operation']>

function progressOperation(f: Fixture): SetupProgressOperation {
  const operation = f.manager.getInstallationProgress().operation
  assert.ok(operation, 'The accepted operation must have a current progress identity.')
  return operation
}

/**
 * Invoke4875 download_default.py:783–856 separates live bytes from settled cancellation;
 * model_install_default.py:1267,2630–2690 keeps install completion independent of download 100%.
 * These current Main/controller tests use controlled transport/assembly/worker ports and real
 * signed cache, extraction, installation journal and pointer; they are not native ML
 * qualification.
 */
test(
  'installation progress is read-only before consent and follows real owners without observer authority',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const metadata = await metadataEngineFixture(f)
      const initial = f.manager.getInstallationProgress()
      assert.equal(initial.operation, null)
      const review = value(await f.manager.previewInstallation('install'))
      assert.deepEqual(f.manager.getInstallationProgress(), initial)
      assert.equal(metadata.downloads.length, 0)
      const seen: SetupProgressSnapshot[] = []
      const unsubscribe = f.manager.onInstallationProgressChanged((snapshot) =>
        seen.push(structuredClone(snapshot)),
      )
      const unsubscribeBroken = f.manager.onInstallationProgressChanged(() => {
        throw new Error('Controlled observer failure must not own installation.')
      })
      const assemble = f.backend.assemble!
      f.backend.assemble = async (request) => {
        await request.onStage?.('copying')
        await request.onStage?.('assembling')
        await request.onStage?.('verifying')
        return await assemble(request)
      }
      metadata.engineControls.installHook = async (options) => {
        options.onProgress?.({
          downloadedBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
          totalBytes: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
        })
      }
      try {
        value(await f.manager.install(review.token))
        const terminal = progressOperation(f)
        assert.equal(terminal.operationId, review.token)
        assert.equal(terminal.mode, 'install')
        assert.equal(terminal.state, 'succeeded')
        assert.equal(terminal.bytesDownloaded, null)
        assert.equal(terminal.bytesTotal, null)
        assert.ok(seen.length > 1)
        assert.ok(
          seen.every(
            (snapshot, index) => index === 0 || snapshot.revision > seen[index - 1].revision,
          ),
        )
        assert.ok(
          seen.every(
            (snapshot) =>
              snapshot.operation === null || snapshot.operation.operationId === review.token,
          ),
        )
        const stages = new Set(seen.map((snapshot) => snapshot.operation?.stage))
        for (const stage of [
          'preparing',
          'preparing-runtime',
          'downloading-runtime',
          'extracting-runtime',
          'installing-outpaint',
          'copying-runtime',
          'assembling-runtime',
          'verifying-runtime',
          'checking-runtime',
          'checking-activation',
          'finalizing',
        ] as const) {
          assert.ok(stages.has(stage), `Actual owner stage was not published: ${stage}`)
        }
        const fullDownload = seen.find(
          (snapshot) =>
            snapshot.operation?.stage === 'downloading-runtime' &&
            snapshot.operation.bytesDownloaded === metadata.transport.manifest.artifact.sizeBytes,
        )
        assert.equal(
          fullDownload?.operation?.state,
          'running',
          '100% file bytes must not complete installation.',
        )
        const clone = f.manager.getInstallationProgress()
        Reflect.set(clone, 'revision', -1)
        if (clone.operation) {
          Reflect.set(clone.operation, 'state', 'failed')
        }
        assert.equal(progressOperation(f).state, 'succeeded')
        assert.ok(f.manager.getInstallationProgress().revision >= 0)
        assert.ok((await fs.readFile(f.roots.pointerFile)).length > 0)
      } finally {
        unsubscribeBroken()
        unsubscribe()
      }
    })
  },
)

test(
  'public installation Cancel waits for acquisition settlement after 100% bytes and then publishes canceled',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const metadata = await metadataEngineFixture(f)
      const entered = deferred()
      const closed = deferred()
      metadata.controls.downloadHook = async (request) => {
        request.onProgress?.({
          downloadedBytes: request.expectedBytes,
          totalBytes: request.expectedBytes,
        })
        entered.resolve()
        await closed.promise
      }
      const ipc = metadataSetupRegistrar(f)
      try {
        const review = await ipc.preview('install')
        const operation = ipc.call(ipcChannels.runtime.install, review.token)
        await entered.promise
        const running = value(
          await ipc.call<SetupProgressSnapshot>(ipcChannels.runtime.getInstallationProgress),
        )
        assert.equal(running.operation?.operationId, review.token)
        assert.equal(running.operation?.state, 'running')
        assert.equal(running.operation?.stage, 'downloading-runtime')
        assert.equal(
          running.operation?.bytesDownloaded,
          metadata.transport.manifest.artifact.sizeBytes,
        )
        let settled = false
        const cancellation = ipc
          .call<SetupProgressSnapshot>(ipcChannels.runtime.cancelInstallation, review.token)
          .then((result) => {
            settled = true
            return result
          })
        try {
          await Promise.resolve()
          assert.equal(settled, false)
          assert.equal(progressOperation(f).state, 'cancelling')
          await absent(f.roots.pointerFile)
          assert.equal(metadata.preparedDirectories.length, 0)
        } finally {
          closed.resolve()
        }
        const canceled = value(await cancellation)
        failure(await operation, 'RUNTIME_INSTALL_CANCELED')
        assert.equal(canceled.operation?.operationId, review.token)
        assert.equal(canceled.operation?.state, 'canceled')
        assert.equal(canceled.operation?.bytesDownloaded, null)
        assert.equal(canceled.operation?.bytesTotal, null)
        await absent(f.roots.pointerFile)
      } finally {
        closed.resolve()
        ipc.dispose()
      }
    })
  },
)

test(
  'old installation IDs and late progress cannot abort or overwrite the next accepted operation',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const metadata = await metadataEngineFixture(f)
      const callbacks: { staleProgress?: RuntimeArtifactDownloadInput['onProgress'] } = {}
      metadata.controls.downloadHook = async (request) => {
        callbacks.staleProgress = request.onProgress
      }
      const first = value(await f.manager.previewInstallation('install'))
      value(await f.manager.install(first.token))
      assert.ok(callbacks.staleProgress)
      const pointer = await fs.readFile(f.roots.pointerFile)
      const entered = deferred()
      const closed = deferred()
      let signal: AbortSignal | undefined
      f.backend.ensureHostCompatible = async (_host, currentSignal) => {
        signal = currentSignal
        entered.resolve()
        await closed.promise
      }
      const second = value(await f.manager.previewInstallation('repair'))
      const operation = f.manager.repair(second.token)
      await entered.promise
      try {
        assert.notEqual(first.token, second.token)
        const before = f.manager.getInstallationProgress()
        callbacks.staleProgress({
          downloadedBytes: 0,
          totalBytes: metadata.transport.manifest.artifact.sizeBytes,
        })
        assert.deepEqual(f.manager.getInstallationProgress(), before)
        await assert.rejects(
          f.manager.cancelInstallation(first.token),
          (error: unknown) =>
            error instanceof RuntimeInstallationError && error.code === 'RUNTIME_INVALID_OPERATION',
        )
        assert.equal(signal?.aborted, false)
        assert.equal(progressOperation(f).operationId, second.token)
        const cancel = f.manager.cancelInstallation(second.token)
        assert.equal(signal?.aborted, true)
        closed.resolve()
        await cancel
        failure(await operation, 'RUNTIME_INSTALL_CANCELED')
        const terminal = f.manager.getInstallationProgress()
        callbacks.staleProgress({
          downloadedBytes: metadata.transport.manifest.artifact.sizeBytes,
          totalBytes: metadata.transport.manifest.artifact.sizeBytes,
        })
        assert.deepEqual(f.manager.getInstallationProgress(), terminal)
        assert.equal(terminal.operation?.operationId, second.token)
        assert.equal(terminal.operation?.state, 'canceled')
        assert.equal((await fs.readFile(f.roots.pointerFile)).equals(pointer), true)
      } finally {
        closed.resolve()
      }
    })
  },
)

test(
  'installation progress ignores invalid transfer telemetry without changing actual acquisition',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      const metadata = await metadataEngineFixture(f)
      metadata.controls.downloadHook = async (request) => {
        const before = f.manager.getInstallationProgress()
        request.onProgress?.({ downloadedBytes: -1, totalBytes: request.expectedBytes })
        request.onProgress?.({ downloadedBytes: Number.NaN, totalBytes: request.expectedBytes })
        request.onProgress?.({
          downloadedBytes: request.expectedBytes + 1,
          totalBytes: request.expectedBytes,
        })
        request.onProgress?.({ downloadedBytes: 1, totalBytes: request.expectedBytes + 1 })
        assert.deepEqual(f.manager.getInstallationProgress(), before)
      }
      value(await f.install())
      assert.equal(progressOperation(f).state, 'succeeded')
      assert.equal(metadata.downloads.length, 1)
    })
  },
)

test(
  'postactivation Cancel remains cancelling until qualification closes and real controller rollback finishes',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      await metadataEngineFixture(f)
      const entered = deferred()
      const closed = deferred()
      f.controls.gpuClose = async (number) => {
        if (number === 2) {
          entered.resolve()
          await closed.promise
        }
      }
      const review = value(await f.manager.previewInstallation('install'))
      const operation = f.manager.install(review.token)
      await entered.promise
      const pointer = await fs.readFile(f.roots.pointerFile)
      assert.equal(progressOperation(f).stage, 'checking-activation')
      const cancellation = f.manager.cancelInstallation(review.token)
      try {
        await Promise.resolve()
        assert.equal(progressOperation(f).state, 'cancelling')
        assert.equal((await fs.readFile(f.roots.pointerFile)).equals(pointer), true)
        assert.equal(f.events.includes('gpu-closed-2'), false)
      } finally {
        closed.resolve()
      }
      await cancellation
      failure(await operation, 'RUNTIME_INSTALL_CANCELED')
      assert.equal(progressOperation(f).state, 'canceled')
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
  'Cancel cannot hide recovery-required or unconfirmed worker exit behind a canceled terminal state',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      await metadataEngineFixture(f)
      const entered = deferred()
      const closed = deferred()
      let exitConfirmed = false
      f.controls.gpuClose = async () => {
        if (!exitConfirmed) {
          entered.resolve()
          await closed.promise
          throw new Error('Controlled physical exit remains unconfirmed after abort.')
        }
      }
      const review = value(await f.manager.previewInstallation('install'))
      const operation = f.manager.install(review.token)
      await entered.promise
      const cancellation = f.manager.cancelInstallation(review.token)
      try {
        await Promise.resolve()
        assert.equal(progressOperation(f).state, 'cancelling')
      } finally {
        closed.resolve()
      }
      try {
        await cancellation
        failure(await operation, 'RUNTIME_INSTALL_RECOVERY_REQUIRED')
        assert.equal(progressOperation(f).state, 'recovery-required')
        assert.equal(
          JSON.parse(
            await fs.readFile(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL), 'utf8'),
          ).phase,
          'recovery-required',
        )
        assert.ok(await fs.lstat(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_CLAIM)))
      } finally {
        exitConfirmed = true
        f.manager.preventNewGenerationWork()
        assert.equal(await f.manager.retryUnconfirmedGenerationExit(), true)
      }
    })
  },
)

test(
  'late Cancel after controller commit loses to actual success and cannot rewrite its terminal result',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      await metadataEngineFixture(f)
      let lateCancel: Promise<void> | undefined
      let finalizing = false
      const unsubscribe = f.manager.onInstallationProgressChanged((snapshot) => {
        if (
          snapshot.operation?.stage === 'finalizing' &&
          snapshot.operation.state === 'running' &&
          !finalizing
        ) {
          finalizing = true
          lateCancel = f.manager.cancelInstallation(snapshot.operation.operationId)
        }
      })
      try {
        const review = value(await f.manager.previewInstallation('install'))
        value(await f.manager.install(review.token))
        await lateCancel
        assert.equal(finalizing, true)
        assert.equal(progressOperation(f).state, 'succeeded')
        assert.equal(
          JSON.parse(
            await fs.readFile(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL), 'utf8'),
          ).phase,
          'complete',
        )
        assert.ok((await fs.readFile(f.roots.pointerFile)).length > 0)
        await assert.rejects(
          f.manager.cancelInstallation(review.token),
          (error: unknown) =>
            error instanceof RuntimeInstallationError && error.code === 'RUNTIME_INVALID_OPERATION',
        )
        assert.equal(progressOperation(f).state, 'succeeded')
      } finally {
        unsubscribe()
      }
    })
  },
)

test(
  'targeted installation Cancel awaits the real protocol child owner and records physical exit before terminal canceled',
  fullPayload,
  async (t) => {
    await withFixture(async (f) => {
      await metadataEngineFixture(f)
      const pidFile = path.join(f.work, 'owned-install-qualification.pid')
      const entered = deferred()
      const released = deferred()
      const assemble = f.backend.assemble!
      f.backend.assemble = async (request) => {
        const prepared = await assemble(request)
        const executable = await fs.realpath(prepared.pythonExecutable)
        const source = await fs.readFile(executable, 'utf8')
        const newline = source.indexOf('\n')
        assert.ok(newline > 0 && source.startsWith('#!'))
        const instrumented = `${source.slice(
          0,
          newline + 1,
        )}require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));\n${source.slice(
          newline + 1,
        )}`
        await fs.writeFile(executable, instrumented, { mode: 0o700 })
        return prepared
      }
      let actual: GenerationWorkerClient | undefined
      const other = new RuntimeManager(
        f.roots,
        { arch: 'x64', platform: 'linux' },
        async (location, environment) => {
          actual = await GenerationWorkerClient.start(location, { environment })
          const captured = actual
          return {
            close: async () => {
              entered.resolve()
              await released.promise
              await captured.close()
            },
            ready: captured.ready,
          }
        },
        f.backend,
      )
      const physical: { pid: number | null; terminalExit: boolean[] } = {
        pid: null,
        terminalExit: [],
      }
      const unsubscribe = other.onInstallationProgressChanged((snapshot) => {
        if (snapshot.operation?.state === 'canceled' && physical.pid !== null) {
          let exited = false
          try {
            process.kill(physical.pid, 0)
          } catch (error) {
            exited = error instanceof Error && 'code' in error && error.code === 'ESRCH'
          }
          physical.terminalExit.push(exited)
        }
      })
      try {
        const review = value(await other.previewInstallation('install'))
        const operation = other.install(review.token)
        await Promise.race([
          entered.promise,
          operation.then((result) =>
            assert.fail(`Protocol fixture ended before its close fence: ${JSON.stringify(result)}`),
          ),
        ])
        const pid = Number(await fs.readFile(pidFile, 'utf8'))
        assert.ok(Number.isSafeInteger(pid) && pid > 1)
        physical.pid = pid
        process.kill(pid, 0)
        let settled = false
        const cancellation = other.cancelInstallation(review.token).then(() => {
          settled = true
        })
        try {
          await Promise.resolve()
          assert.equal(settled, false)
          assert.equal(other.getInstallationProgress().operation?.state, 'cancelling')
          process.kill(pid, 0)
          await absent(f.roots.pointerFile)
        } finally {
          released.resolve()
        }
        await cancellation
        failure(await operation, 'RUNTIME_INSTALL_CANCELED')
        assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
        assert.equal(physical.terminalExit.length, 1)
        assert.equal(
          physical.terminalExit[0],
          true,
          'The terminal event must follow physical child exit.',
        )
        assert.equal(other.getInstallationProgress().operation?.state, 'canceled')
        await absent(f.roots.pointerFile)
        t.diagnostic(
          JSON.stringify({
            aliveAtCloseFence: true,
            fixture:
              'Real bounded GenerationWorkerClient owner over Node protocol program; CPU/assembly ports controlled; no Python or native ML qualification.',
            physicallyExitedBeforeTerminal: true,
            pid,
          }),
        )
      } finally {
        unsubscribe()
        released.resolve()
        other.preventNewGenerationWork()
        await other.cancelInstallation()
        await actual?.close()
        assert.equal(await other.retryUnconfirmedGenerationExit(), true)
      }
    })
  },
)

test(
  'Cancel preserves recovery-required when rollback encounters a competing pointer after activation',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      await metadataEngineFixture(f)
      const entered = deferred()
      const closed = deferred()
      f.controls.gpuClose = async (number) => {
        if (number === 2) {
          entered.resolve()
          await closed.promise
        }
      }
      const review = value(await f.manager.previewInstallation('install'))
      const operation = f.manager.install(review.token)
      await entered.promise
      const candidate = await fs.readFile(f.roots.pointerFile)
      const competing = Buffer.from(
        'Controlled concurrent pointer bytes; rollback must preserve another owner.',
      )
      const cancellation = f.manager.cancelInstallation(review.token)
      try {
        await Promise.resolve()
        assert.equal(progressOperation(f).state, 'cancelling')
        assert.equal((await fs.readFile(f.roots.pointerFile)).equals(candidate), true)
        await fs.writeFile(f.roots.pointerFile, competing)
      } finally {
        closed.resolve()
      }
      await cancellation
      failure(await operation, 'RUNTIME_INSTALL_RECOVERY_REQUIRED')
      assert.equal(progressOperation(f).state, 'recovery-required')
      assert.equal((await fs.readFile(f.roots.pointerFile)).equals(competing), true)
      assert.equal(
        JSON.parse(
          await fs.readFile(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL), 'utf8'),
        ).phase,
        'recovery-required',
      )
      assert.ok(await fs.lstat(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_CLAIM)))
    })
  },
)

test(
  'local cached-engine assembly cancellation publishes canceled after confirmed assembly settlement',
  fullPayload,
  async () => {
    await withFixture(async (f) => {
      await engineFixture(f)
      const entered = deferred()
      const released = deferred()
      let assemblySignal: AbortSignal | undefined
      let assemblySettled = false
      f.backend.assemble = async (request) => {
        assemblySignal = request.signal
        entered.resolve()
        await released.promise
        assemblySettled = true
        throw new OfflineRuntimeAssemblyError(
          'RUNTIME_ASSEMBLY_CANCELED',
          'Controlled local assembly confirmed exit after cancellation.',
          [],
          true,
        )
      }
      const review = value(await f.manager.previewInstallation('install'))
      const operation = f.manager.install(review.token)
      await entered.promise
      let cancelSettled = false
      const cancellation = f.manager.cancelInstallation(review.token).then(() => {
        cancelSettled = true
      })
      try {
        await Promise.resolve()
        assert.equal(assemblySignal?.aborted, true)
        assert.equal(assemblySettled, false)
        assert.equal(cancelSettled, false)
        assert.equal(progressOperation(f).state, 'cancelling')
        await absent(f.roots.pointerFile)
      } finally {
        released.resolve()
      }
      await cancellation
      failure(await operation, 'RUNTIME_INSTALL_CANCELED')
      assert.equal(assemblySettled, true)
      assert.equal(progressOperation(f).state, 'canceled')
      assert.equal(progressOperation(f).bytesDownloaded, null)
      assert.equal(progressOperation(f).bytesTotal, null)
      await absent(f.roots.pointerFile)
      assert.equal(
        JSON.parse(
          await fs.readFile(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL), 'utf8'),
        ).phase,
        'failed',
      )
    })
  },
)
