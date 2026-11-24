import assert from 'node:assert/strict'
import { createHash, createPublicKey } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath, statfs } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { ModelDownloader } from '../../src/main/models/model-downloader.js'
import {
  GenerationWorkerClient,
  GenerationWorkerError,
} from '../../src/main/projects/generation-worker-client.js'
import {
  type RuntimeInstallationBackend,
  RuntimeManager,
  type RuntimeRoots,
} from '../../src/main/runtime/index.js'
import { createLamaAuxiliaryInstaller } from '../../src/main/runtime/inference-auxiliary-installer.js'
import { InferenceAuxiliaryResources } from '../../src/main/runtime/inference-auxiliary-resources.js'
import { LAMA_OUTPAINT_ARTIFACT } from '../../src/main/runtime/lama-manifest.js'
import {
  assembleOfflineRuntime,
  runOfflineRuntimeCommand,
} from '../../src/main/runtime/offline-runtime-assembly.js'
import { preflightRuntimeHost } from '../../src/main/runtime/runtime-host-preflight.js'

const appVersion = 'qualification-0.1.0'
const runtimeUrl = 'https://runtime-qualification.example.org/runtime.zip'
const routes = new Map([
  [LAMA_OUTPAINT_ARTIFACT.url, '/big-lama.pt'],
  [runtimeUrl, '/runtime.zip'],
])
const allowedHosts = new Set(Array.from(routes.keys(), (url) => new URL(url).hostname))
const sha256 = /^[a-f\d]{64}$/
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/
type StartClient = NonNullable<ConstructorParameters<typeof RuntimeManager>[2]>
type RuntimeAdvisory = ConstructorParameters<typeof RuntimeManager>[4]

interface BytePin {
  path: string
  sha256: string
}

interface SetupConfig {
  appVersion: typeof appVersion
  port: number
  postActivationCudaFault: boolean
  repairDataRoot?: string
  runtimeEnvelope: BytePin
  schemaVersion: 1
  transportEnvelope: BytePin
  trustedKeys: BytePin
  unsupportedDriverProbe?: boolean
}

interface RepairCandidate {
  attemptId: string
  preActivationReady: boolean
  previousPointer: Buffer
  pythonExecutable: string
  runtimeId: string
}

/** Only the separate qualification package imports this Main collaborator. */
export async function createPackagedRuntimeSetupManager(
  roots: RuntimeRoots,
  dataRoot: string,
  advisory: RuntimeAdvisory,
): Promise<RuntimeManager> {
  const artifacts = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
  const qualificationRuns = path.join(artifacts, 'runs/packaged-runtime-setup')
  const configPath = process.env.IMAGEGEN_PACKAGED_RUNTIME_SETUP_CONFIG
  const uid = process.getuid?.()
  assert.ok(uid !== undefined && configPath && path.basename(configPath) === 'setup-config.json')
  assertChild(qualificationRuns, configPath)
  const run = path.dirname(configPath)
  assert.notEqual(run, qualificationRuns)
  assert.equal(dataRoot, roots.appDataDir)
  for (const directory of [run, dataRoot]) {
    assert.equal(await realpath(directory), directory)
    const info = await lstat(directory)
    assert.ok(info.isDirectory() && info.uid === uid)
  }
  const config = readConfig(await pinnedBytes(configPath, uid, 16 * 1024))
  if (config.repairDataRoot === undefined) {
    assert.equal(dataRoot, path.join(run, 'data/imagegen-studio'))
  } else {
    // The historical venv embeds absolute paths. Its canonical AppData path
    // is mounted over the owned state for this one private fixture.
    assert.match(path.basename(run), /^protocol-repair(?:-r(?:[2-9]|[1-9]\d+))?$/)
    assert.equal(dataRoot, config.repairDataRoot)
    assertChild(path.join(artifacts, 'runs/packaged-installed-engine'), dataRoot)
    assert.equal(path.basename(dataRoot), 'imagegen-studio')
    const state = path.join(path.dirname(run), `${path.basename(run)}-state`)
    assert.equal(await realpath(state), state)
    const [owned, mounted] = await Promise.all(
      [state, dataRoot].map((directory) => lstat(directory, { bigint: true })),
    )
    assert.ok(owned.isDirectory() && owned.uid === BigInt(uid))
    assert.deepEqual([mounted.dev, mounted.ino], [owned.dev, owned.ino])
  }
  const repairFault = config.postActivationCudaFault
    ? createPostActivationCudaFault(roots, uid)
    : undefined

  const readPin = async (pin: BytePin, maxBytes: number) => {
    assertChild(artifacts, pin.path)
    return await pinnedBytes(pin.path, uid, maxBytes, pin.sha256)
  }
  const [runtimeEnvelope, transportEnvelope, keyBytes] = await Promise.all([
    readPin(config.runtimeEnvelope, 1024 ** 2),
    readPin(config.transportEnvelope, 1024 ** 2),
    readPin(config.trustedKeys, 16 * 1024),
  ])
  const trustedKeys = readKeys(keyBytes)
  const download = new ModelDownloader({
    resolveAddresses: (hostname) => {
      assert.ok(allowedHosts.has(hostname), 'Unrecognized qualification artifact host.')
      // This value exercises public-destination validation without external DNS or a network route.
      return Promise.resolve(['93.184.216.34'])
    },
    transport: async (request, options) => {
      const url = request instanceof URL ? request.href : String(request)
      const route = routes.get(url)
      assert.ok(route, 'Unrecognized qualification artifact URL.')
      // The injected provider translates these two routes only. Redirects never follow on loopback.
      return await fetch(`http://127.0.0.1:${config.port}${route}`, {
        ...options,
        redirect: 'manual',
      })
    },
  })
  const resourcesDirectory = path.join(dataRoot, 'inference-resources')
  const resources = new InferenceAuxiliaryResources(resourcesDirectory)
  const selection = {
    appVersion,
    cacheDirectory: path.join(roots.downloadsDir, 'qualification-runtime-transport'),
    runtimeEnvelope,
    source: { redirectOrigins: [], url: runtimeUrl },
    transportEnvelope,
    trustedKeys,
  }
  const backend: RuntimeInstallationBackend = {
    assemble: async (input) => {
      const availableBytesBefore = await availableBytes(roots.runtimeDir)
      try {
        const prepared = await assembleOfflineRuntime(input)
        await repairFault?.captureCandidate(prepared)
        return prepared
      } catch (error) {
        recordFailure('assembly', error, {
          availableBytesAfter: await availableBytes(roots.runtimeDir),
          availableBytesBefore,
          requiredFreeBytes: input.release.manifest.requiredFreeBytes,
        })
        throw error
      }
    },
    ensureAuxiliaryReady: async () => {
      await resources.resolveVerifiedOutpaintInfill()
    },
    metadata: {
      auxiliaryInstaller: createLamaAuxiliaryInstaller(resourcesDirectory, download),
      downloader: {
        downloadRuntimeArtifact: async (input) => {
          try {
            return await download.downloadRuntimeArtifact(input)
          } catch (error) {
            recordFailure('download', error)
            throw error
          }
        },
      },
      loadMetadata: () => Promise.resolve(selection),
    },
  }
  if (config.unsupportedDriverProbe) {
    backend.ensureHostCompatible = async (host, signal) => {
      try {
        await preflightRuntimeHost(host, {
          commandRunner: async (command) =>
            await runOfflineRuntimeCommand({
              ...command,
              args: ['1.0, 8.9\n'],
              executable: '/usr/bin/printf',
            }),
          logDirectory: roots.workerLogsDir,
          signal,
        })
      } catch (error) {
        recordFailure('preflight', error)
        throw error
      }
    }
  }
  return new RuntimeManager(roots, undefined, repairFault?.start, backend, advisory)
}

/** Reuse the actual client; mask CUDA solely for the published candidate on its second check. */
function createPostActivationCudaFault(roots: RuntimeRoots, uid: number) {
  const journalPath = path.join(roots.runtimeDir, 'runtime-installation.json')
  let candidate: RepairCandidate | undefined
  let injected = false

  const readJournal = async () => {
    const value: unknown = JSON.parse((await pinnedBytes(journalPath, uid, 16 * 1024)).toString())
    assertRecord(value)
    assert.equal(value.schemaVersion, 1)
    return value
  }
  const start: StartClient = async (location, environment) => {
    const current = candidate
    if (!current || location.pythonExecutable !== current.pythonExecutable) {
      return await GenerationWorkerClient.start(location, { environment })
    }
    assert.equal(location.runtimeRoot, roots.runtimeDir)
    assert.equal(location.scratchBasePath, path.join(roots.appDataDir, 'scratch'))
    const journal = await readJournal()
    assert.equal(journal.mode, 'repair')
    assert.equal(journal.attemptId, current.attemptId)
    assert.equal(journal.previousPointer, current.previousPointer.toString('base64'))
    assertRecord(journal.prepared)
    assert.equal(journal.prepared.runtimeId, current.runtimeId)
    assert.equal(journal.prepared.pythonExecutable, current.pythonExecutable)
    const target = readPointerBytes(journal.candidatePointer)
    assert.deepEqual(JSON.parse(target.toString()), {
      pythonExecutable: current.pythonExecutable,
      runtimeId: current.runtimeId,
      schemaVersion: 1,
    })
    assert.ok(!target.equals(current.previousPointer))
    const active = await pinnedBytes(roots.pointerFile, uid, 16 * 1024)

    if (journal.phase === 'qualifying') {
      assert.deepEqual(active, current.previousPointer)
      const client = await GenerationWorkerClient.start(location, { environment })
      return {
        close: async () => {
          await client.close()
          current.preActivationReady = true
        },
        ready: client.ready,
      }
    }

    assert.equal(journal.phase, 'post-qualifying')
    assert.deepEqual(active, target)
    assert.ok(current.preActivationReady && !injected)
    assert.notEqual(environment.CUDA_VISIBLE_DEVICES, '')
    injected = true
    let unexpectedlyReady
    try {
      unexpectedlyReady = await GenerationWorkerClient.start(location, {
        environment: { ...environment, CUDA_VISIBLE_DEVICES: '' },
      })
    } catch (error) {
      if (
        error instanceof GenerationWorkerError &&
        error.code === 'WORKER_EXITED' &&
        !GenerationWorkerClient.hasUnconfirmedStartExit()
      ) {
        console.error(
          `IGS_SETUP_QUALIFICATION_REPAIR_FAULT ${JSON.stringify({
            activePointerSha256: createHash('sha256').update(active).digest('hex'),
            attemptId: current.attemptId,
            errorCode: error.code,
            exitConfirmed: true,
            preActivationReady: true,
            previousPointerSha256: createHash('sha256')
              .update(current.previousPointer)
              .digest('hex'),
            runtimeId: current.runtimeId,
          })}`,
        )
      }
      throw error
    }
    await unexpectedlyReady.close()
    throw new Error('The CUDA-hidden candidate unexpectedly started.')
  }

  return {
    async captureCandidate(prepared: Awaited<ReturnType<typeof assembleOfflineRuntime>>) {
      const journal = await readJournal()
      if (journal.mode !== 'repair') {
        return
      }
      assert.equal(journal.phase, 'preparing')
      assert.equal(journal.prepared, null)
      assert.equal(journal.candidatePointer, null)
      assert.ok(typeof journal.attemptId === 'string' && uuid.test(journal.attemptId))
      candidate = {
        attemptId: journal.attemptId,
        preActivationReady: false,
        previousPointer: readPointerBytes(journal.previousPointer),
        pythonExecutable: prepared.pythonExecutable,
        runtimeId: prepared.runtimeId,
      }
    },
    start,
  }
}

function readPointerBytes(value: unknown): Buffer {
  assert.ok(typeof value === 'string' && value.length > 0)
  const bytes = Buffer.from(value, 'base64')
  assert.ok(bytes.length > 0 && bytes.toString('base64') === value)
  return bytes
}

async function availableBytes(directory: string): Promise<string | null> {
  const volume = await statfs(directory, { bigint: true }).catch(() => null)
  return volume ? (volume.bavail * volume.bsize).toString() : null
}

function recordFailure(
  stage: 'assembly' | 'download' | 'preflight',
  error: unknown,
  details = {},
): void {
  const code = error instanceof Error && 'code' in error ? error.code : null
  const message = error instanceof Error ? error.message : String(error)
  console.error(
    `IGS_SETUP_QUALIFICATION_FAILURE ${JSON.stringify({ code, message, stage, ...details })}`,
  )
}

function assertChild(parent: string, child: string): void {
  assert.ok(
    path.isAbsolute(child) && path.resolve(child) === child && child.startsWith(`${parent}/`),
    'Qualification path must be a canonical child of the artifact root.',
  )
}

async function pinnedBytes(
  filename: string,
  uid: number,
  maxBytes: number,
  digest?: string,
): Promise<Buffer> {
  assert.equal(await realpath(filename), filename)
  const file = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await file.stat({ bigint: true })
    assert.ok(
      before.isFile() &&
        before.uid === BigInt(uid) &&
        before.size > 0n &&
        before.size <= BigInt(maxBytes),
    )
    const contents = Buffer.alloc(Number(before.size))
    const { bytesRead } = await file.read(contents, 0, contents.length, 0)
    assert.equal(bytesRead, contents.length)
    const after = await lstat(filename, { bigint: true })
    assert.ok(
      after.isFile() &&
        before.dev === after.dev &&
        before.ino === after.ino &&
        before.size === after.size &&
        before.ctimeNs === after.ctimeNs &&
        before.mtimeNs === after.mtimeNs &&
        (await realpath(filename)) === filename,
    )
    if (digest !== undefined) {
      assert.equal(createHash('sha256').update(contents).digest('hex'), digest)
    }
    return contents
  } finally {
    await file.close()
  }
}

function readConfig(bytes: Buffer): SetupConfig {
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  assertRecord(value)
  assert.ok(
    Object.keys(value).every((key) =>
      [
        'appVersion',
        'port',
        'postActivationCudaFault',
        'repairDataRoot',
        'runtimeEnvelope',
        'schemaVersion',
        'transportEnvelope',
        'trustedKeys',
        'unsupportedDriverProbe',
      ].includes(key),
    ),
  )
  assert.equal(value.schemaVersion, 1)
  assert.equal(value.appVersion, appVersion)
  const { port } = value
  assert.ok(typeof port === 'number' && Number.isInteger(port) && port > 0 && port <= 65_535)
  assert.ok(
    value.unsupportedDriverProbe === undefined || typeof value.unsupportedDriverProbe === 'boolean',
  )
  assert.ok(
    value.postActivationCudaFault === undefined ||
      typeof value.postActivationCudaFault === 'boolean',
  )
  assert.ok(!(value.unsupportedDriverProbe === true && value.postActivationCudaFault === true))
  assert.ok(
    value.repairDataRoot === undefined ||
      (typeof value.repairDataRoot === 'string' &&
        value.unsupportedDriverProbe !== true &&
        value.postActivationCudaFault !== true),
  )
  return {
    appVersion,
    port,
    postActivationCudaFault: value.postActivationCudaFault === true,
    repairDataRoot: value.repairDataRoot,
    runtimeEnvelope: readPin(value.runtimeEnvelope),
    schemaVersion: 1,
    transportEnvelope: readPin(value.transportEnvelope),
    trustedKeys: readPin(value.trustedKeys),
    unsupportedDriverProbe: value.unsupportedDriverProbe === true,
  }
}

function readPin(value: unknown): BytePin {
  assertRecord(value)
  assert.equal(Object.keys(value).length, 2)
  assert.ok(
    typeof value.path === 'string' && typeof value.sha256 === 'string' && sha256.test(value.sha256),
  )
  return { path: value.path, sha256: value.sha256 }
}

function readKeys(bytes: Buffer): Readonly<Record<string, string>> {
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  assertRecord(value)
  const entries = Object.entries(value).map(([id, pem]) => {
    assert.ok(
      /^[a-z0-9][\w.-]{0,127}$/i.test(id) &&
        typeof pem === 'string' &&
        /^-----BEGIN PUBLIC KEY-----\r?\n/.test(pem) &&
        createPublicKey(pem).asymmetricKeyType === 'ed25519',
    )
    return [id, pem] as const
  })
  assert.ok(entries.length > 0)
  return Object.freeze(Object.fromEntries(entries))
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value))
}
