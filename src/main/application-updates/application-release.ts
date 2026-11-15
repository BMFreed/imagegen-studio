import { isApplicationUpdateVersion } from '../../shared/application-updates.js'

/**
 * Fresh source: InvokeAI4875d965 installation.mdx delegates app updates to launcher c267bdb4
 * updater.ts -> main-process-manager.ts167. Neither supplies Linux publisher trust/Studio
 * compatibility. Adapt the existing canonical Ed25519 runtime-envelope gate and its
 * runtime-release-transport caller; no new crypto or network protocol.
 */
import { createHash, createPublicKey } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'

import {
  canonicalRuntimeReleaseJson,
  verifyCanonicalRuntimeEnvelope,
} from '../runtime/runtime-release.js'

const MAX_BYTES = 1024 * 1024
const IDENTIFIER = /^[A-Z0-9][\w.+-]{0,127}$/i
const HASH = /^[a-f0-9]{64}$/
const MIGRATION = /^\d{4}_[a-z0-9_]+\.sql$/
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const identity = (s: BigIntStats) => [s.dev, s.ino, s.mode, s.size, s.mtimeNs, s.ctimeNs].join(':')

export interface ApplicationReleaseCompatibility {
  readonly cpuWorkerProtocolVersion: string
  readonly databaseMigrations: readonly Readonly<{ name: string; sha256: string }>[]
  readonly inferenceWorkerProtocolVersion: string
  readonly projectSchemaVersion: number
}

export interface ApplicationReleaseTrust {
  readonly compatibility: ApplicationReleaseCompatibility
  readonly trustedKeys: Readonly<Record<string, string>>
}

export interface ApplicationReleaseSelectedArtifact {
  readonly filename: string
  readonly sha512: string
  readonly sizeBytes: number
  readonly version: string
}

export interface ApplicationReleaseManifest {
  readonly appId: 'studio.imagegen.desktop'
  readonly artifact: Readonly<{ filename: string; sha512: string; sizeBytes: number }>
  readonly compatibility: ApplicationReleaseCompatibility &
    Readonly<{ runtimeValidation: 'after-restart' }>
  readonly releaseId: string
  readonly releaseNotesSha256: string
  readonly schemaVersion: 1
  readonly scope: 'application-release'
  readonly target: Readonly<{ arch: 'x64'; format: 'AppImage'; os: 'linux' }>
  readonly version: string
}

/** Fixed diagnostics never contain remote URLs, key material or native paths. */
export class AppReleaseError extends Error {
  readonly code = 'APPLICATION_RELEASE_INVALID'

  constructor() {
    super('The signed application release could not be verified.')
    this.name = 'AppReleaseError'
  }
}

/** Authenticates a declaration, not installed runtime readiness or migration execution. */
export function verifyApplicationRelease(
  envelope: Buffer,
  trust: ApplicationReleaseTrust,
  selected: ApplicationReleaseSelectedArtifact,
  releaseNotes: unknown,
): Readonly<ApplicationReleaseManifest> {
  try {
    const captured = copyTrust(trust)
    const descriptor = plain(selected, ['version', 'filename', 'sha512', 'sizeBytes'])
    need(isApplicationUpdateVersion(descriptor['version']))
    const selectedArtifact = artifact({
      filename: descriptor['filename'],
      sha512: descriptor['sha512'],
      sizeBytes: descriptor['sizeBytes'],
    })
    const raw = plain(verifyCanonicalRuntimeEnvelope(envelope, captured.trustedKeys), [
      'schemaVersion',
      'scope',
      'appId',
      'version',
      'releaseId',
      'target',
      'artifact',
      'compatibility',
      'releaseNotesSha256',
    ])
    need(
      raw['schemaVersion'] === 1 &&
        raw['scope'] === 'application-release' &&
        raw['appId'] === 'studio.imagegen.desktop',
    )
    need(isApplicationUpdateVersion(raw['version']) && raw['version'] === descriptor['version'])
    need(typeof raw['releaseId'] === 'string' && IDENTIFIER.test(raw['releaseId']))
    const target = plain(raw['target'], ['os', 'arch', 'format'])
    need(target['os'] === 'linux' && target['arch'] === 'x64' && target['format'] === 'AppImage')
    const releaseArtifact = artifact(raw['artifact'])
    need(
      releaseArtifact.filename === selectedArtifact.filename &&
        releaseArtifact.sha512 === selectedArtifact.sha512 &&
        releaseArtifact.sizeBytes === selectedArtifact.sizeBytes,
    )
    const compatibility = readCompatibility(raw['compatibility'], true)
    need(compatibility.projectSchemaVersion === captured.compatibility.projectSchemaVersion)
    need(compatibility.cpuWorkerProtocolVersion === captured.compatibility.cpuWorkerProtocolVersion)
    need(
      compatibility.inferenceWorkerProtocolVersion ===
        captured.compatibility.inferenceWorkerProtocolVersion,
    )
    const migrations = new Map(
      compatibility.databaseMigrations.map((item) => [item.name, item.sha256]),
    )
    // Preserve the existing database owner's exact installed name/hash membership;
    // a scalar migration count or protocol1 alone is not upgrade compatibility.
    for (const installed of captured.compatibility.databaseMigrations) {
      need(migrations.get(installed.name) === installed.sha256)
    }
    const notesHash = raw['releaseNotesSha256']
    need(typeof notesHash === 'string' && HASH.test(notesHash))
    need(
      createHash('sha256')
        .update(canonicalRuntimeReleaseJson(releaseNotes ?? null))
        .digest('hex') === notesHash,
    )
    return Object.freeze({
      appId: 'studio.imagegen.desktop',
      artifact: releaseArtifact,
      compatibility: Object.freeze({ ...compatibility, runtimeValidation: 'after-restart' }),
      releaseId: raw['releaseId'],
      releaseNotesSha256: notesHash,
      schemaVersion: 1,
      scope: 'application-release',
      target: Object.freeze({ arch: 'x64', format: 'AppImage', os: 'linux' }),
      version: raw['version'],
    })
  } catch {
    throw new AppReleaseError()
  }
}

/** Missing configuration alone retains metadata-only authority. Invalid existing trust fails closed. */
export async function loadApplicationReleaseTrust(
  resourcesDirectory: string,
  compatibility: ApplicationReleaseCompatibility,
): Promise<ApplicationReleaseTrust | null> {
  try {
    const capturedCompatibility = readCompatibility(compatibility)
    const directory = await canonicalDirectory(resourcesDirectory)
    const filename = path.join(resourcesDirectory, 'app-update-trust.json')
    let before: BigIntStats
    try {
      before = await fs.lstat(filename, { bigint: true })
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        need(identity(await canonicalDirectory(resourcesDirectory)) === identity(directory))
        return null
      }
      throw error
    }
    need(
      before.isFile() &&
        !before.isSymbolicLink() &&
        before.size > 0n &&
        before.size <= BigInt(MAX_BYTES),
    )
    const handle = await fs.open(filename, FILE_FLAGS)
    try {
      need(identity(await handle.stat({ bigint: true })) === identity(before))
      // Bounded reads also refuse a file growing after the initial lstat.
      const bytes = Buffer.allocUnsafe(MAX_BYTES + 1)
      let length = 0
      for (;;) {
        const read = await handle.read(bytes, length, bytes.length - length, null)
        length += read.bytesRead
        need(length <= MAX_BYTES)
        if (read.bytesRead === 0) {
          break
        }
      }
      need(length > 0 && BigInt(length) === before.size)
      need(identity(await handle.stat({ bigint: true })) === identity(before))
      need(identity(await fs.lstat(filename, { bigint: true })) === identity(before))
      need(identity(await canonicalDirectory(resourcesDirectory)) === identity(directory))
      const raw = plain(JSON.parse(bytes.subarray(0, length).toString('utf8')), [
        'schemaVersion',
        'appId',
        'keys',
      ])
      need(raw['schemaVersion'] === 1 && raw['appId'] === 'studio.imagegen.desktop')
      return Object.freeze({
        compatibility: capturedCompatibility,
        trustedKeys: readTrustedKeys(raw['keys']),
      })
    } finally {
      await handle.close()
    }
  } catch {
    throw new AppReleaseError()
  }
}

function copyTrust(value: ApplicationReleaseTrust): ApplicationReleaseTrust {
  const raw = plain(value, ['trustedKeys', 'compatibility'])
  return Object.freeze({
    compatibility: readCompatibility(raw['compatibility']),
    trustedKeys: readTrustedKeys(raw['trustedKeys']),
  })
}

function readTrustedKeys(value: unknown): Readonly<Record<string, string>> {
  const raw = plain(value)
  const keys = Object.keys(raw)
  need(keys.length > 0)
  const entries = keys.map((keyId) => {
    const pem = raw[keyId]
    need(IDENTIFIER.test(keyId) && typeof pem === 'string' && pem.length <= 16 * 1024)
    // A bundled public keyring must not accidentally carry a private signing key.
    need(
      pem.trim().startsWith('-----BEGIN PUBLIC KEY-----') &&
        pem.trim().endsWith('-----END PUBLIC KEY-----'),
    )
    need(
      pem.split('-----BEGIN PUBLIC KEY-----').length === 2 &&
        pem.split('-----END PUBLIC KEY-----').length === 2,
    )
    need(createPublicKey(pem).asymmetricKeyType === 'ed25519')
    return [keyId, pem] as const
  })
  const captured = Object.fromEntries(entries)
  canonicalRuntimeReleaseJson(captured)
  return Object.freeze(captured)
}

function readCompatibility(value: unknown, signed = false): ApplicationReleaseCompatibility {
  const raw = plain(value, [
    'projectSchemaVersion',
    'cpuWorkerProtocolVersion',
    'inferenceWorkerProtocolVersion',
    'databaseMigrations',
    ...(signed ? ['runtimeValidation'] : []),
  ])
  need(
    typeof raw['projectSchemaVersion'] === 'number' &&
      Number.isSafeInteger(raw['projectSchemaVersion']) &&
      raw['projectSchemaVersion'] > 0,
  )
  const cpu = protocol(raw['cpuWorkerProtocolVersion'])
  const inference = protocol(raw['inferenceWorkerProtocolVersion'])
  if (signed) {
    need(raw['runtimeValidation'] === 'after-restart')
  }
  const inventory = raw['databaseMigrations']
  need(Array.isArray(inventory) && Object.keys(inventory).length === inventory.length)
  need(Reflect.ownKeys(inventory).length === inventory.length + 1)
  let previous = ''
  const migrations = Array.from({ length: inventory.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(inventory, String(index))
    need(descriptor && Object.hasOwn(descriptor, 'value'))
    const item = plain(descriptor.value, ['name', 'sha256'])
    need(
      typeof item['name'] === 'string' && MIGRATION.test(item['name']) && item['name'] > previous,
    )
    need(typeof item['sha256'] === 'string' && HASH.test(item['sha256']))
    previous = item['name']
    return Object.freeze({ name: item['name'], sha256: item['sha256'] })
  })
  return Object.freeze({
    cpuWorkerProtocolVersion: cpu,
    databaseMigrations: Object.freeze(migrations),
    inferenceWorkerProtocolVersion: inference,
    projectSchemaVersion: raw['projectSchemaVersion'],
  })
}

function protocol(value: unknown): string {
  need(typeof value === 'string' && value.length <= 128 && /^(?:0|[1-9]\d*)$/.test(value))
  return value
}

function artifact(value: unknown): ApplicationReleaseManifest['artifact'] {
  const raw = plain(value, ['filename', 'sha512', 'sizeBytes'])
  const filename = raw['filename']
  const sha512 = raw['sha512']
  const sizeBytes = raw['sizeBytes']
  need(
    typeof filename === 'string' &&
      filename.endsWith('.AppImage') &&
      !/[\\/\u0000-\u001F\u007F]/.test(filename) &&
      path.basename(filename) === filename &&
      path.normalize(filename) === filename,
  )
  need(
    typeof sha512 === 'string' &&
      Buffer.from(sha512, 'base64').length === 64 &&
      Buffer.from(sha512, 'base64').toString('base64') === sha512,
  )
  need(typeof sizeBytes === 'number' && Number.isSafeInteger(sizeBytes) && sizeBytes > 0)
  return Object.freeze({ filename, sha512, sizeBytes })
}

/** Read only enumerable own data; no accessors, symbol/private extras or exotic prototypes. */
function plain(value: unknown, fields?: readonly string[]): Record<string, unknown> {
  need(value !== null && typeof value === 'object' && !Array.isArray(value))
  need([null, Object.prototype].includes(Object.getPrototypeOf(value)))
  const keys = Reflect.ownKeys(value)
  need(keys.every((key) => typeof key === 'string'))
  if (fields) {
    need([...keys].sort().join('\0') === [...fields].sort().join('\0'))
  }
  return Object.fromEntries(
    keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      need(typeof key === 'string' && descriptor?.enumerable && Object.hasOwn(descriptor, 'value'))
      return [key, descriptor.value]
    }),
  )
}

async function canonicalDirectory(directory: string): Promise<BigIntStats> {
  need(
    typeof directory === 'string' &&
      path.isAbsolute(directory) &&
      path.resolve(directory) === directory,
  )
  const info = await fs.lstat(directory, { bigint: true })
  need(info.isDirectory() && !info.isSymbolicLink() && (await fs.realpath(directory)) === directory)
  return info
}

function need(condition: unknown): asserts condition {
  if (!condition) {
    throw new AppReleaseError()
  }
}
