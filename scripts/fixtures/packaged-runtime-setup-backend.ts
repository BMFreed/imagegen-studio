import assert from 'node:assert/strict'
import { createHash, createPublicKey } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath, statfs } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { RuntimeInstallationBackend, RuntimeRoots } from '../../src/main/runtime/index.js'

import { ModelDownloader } from '../../src/main/models/model-downloader.js'
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

interface BytePin {
  path: string
  sha256: string
}

interface SetupConfig {
  appVersion: typeof appVersion
  port: number
  runtimeEnvelope: BytePin
  schemaVersion: 1
  transportEnvelope: BytePin
  trustedKeys: BytePin
  unsupportedDriverProbe?: boolean
}

/** Only the separate qualification package imports this Main collaborator. */
export async function createPackagedRuntimeSetupBackend(
  roots: RuntimeRoots,
  dataRoot: string,
): Promise<RuntimeInstallationBackend> {
  const artifacts = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
  const qualificationRuns = path.join(artifacts, 'runs/packaged-runtime-setup')
  const configPath = process.env.IMAGEGEN_PACKAGED_RUNTIME_SETUP_CONFIG
  const uid = process.getuid?.()
  assert.ok(uid !== undefined && configPath && path.basename(configPath) === 'setup-config.json')
  assertChild(qualificationRuns, configPath)
  const run = path.dirname(configPath)
  assert.notEqual(run, qualificationRuns)
  assert.equal(dataRoot, path.join(run, 'data/imagegen-studio'))
  assert.equal(dataRoot, roots.appDataDir)
  for (const directory of [run, dataRoot]) {
    assert.equal(await realpath(directory), directory)
    const info = await lstat(directory)
    assert.ok(info.isDirectory() && info.uid === uid)
  }
  const config = readConfig(await pinnedBytes(configPath, uid, 16 * 1024))

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
        return await assembleOfflineRuntime(input)
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
  return backend
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
  return {
    appVersion,
    port,
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
