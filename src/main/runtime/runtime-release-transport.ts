/**
 * Invoke4875 `family_e2e/bundle.py:_write_zip` + `family_e2e/__main__.py:cmd_bundle`: complete
 * temporary archive before publication. Streaming and create-only fd ownership adapt existing
 * Studio runtime/wheelhouse owners. Signed managed-Python transport is absent upstream (see
 * research).
 */
import { createHash, createPublicKey, KeyObject, sign } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform, Writable } from 'node:stream'
import { finished, pipeline } from 'node:stream/promises'
import * as yazl from 'yazl'

import {
  canonicalRuntimeReleaseJson,
  RuntimeReleaseError,
  type RuntimeReleaseManifest,
  type RuntimeReleaseSelection,
  verifyCanonicalRuntimeEnvelope,
  verifyRuntimeRelease,
  verifyRuntimeReleaseManifest,
} from './runtime-release.js'

const ARCHIVE = 'runtime-payload.zip'
const INNER = 'runtime-release.json'
const OUTER = 'runtime-transport.json'
const MARKER = '.incomplete'
const MAX_ARCHIVE_BYTES = 65 * 1024 ** 3
const MAX_ENVELOPE_BYTES = 1024 ** 2
const DATE = new Date('2000-01-01T00:00:00.000Z')
const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const identity = (s: BigIntStats) => [s.dev, s.ino, s.mode, s.size, s.mtimeNs, s.ctimeNs].join(':')

export interface RuntimeTransportManifest {
  readonly appVersion: string
  readonly artifact: Readonly<{
    filename: 'runtime-payload.zip'
    format: 'zip-v1'
    sha256: string
    sizeBytes: number
  }>
  readonly entryCount: number
  readonly expandedRegularBytes: number
  readonly profile: 'linux-nvidia'
  readonly releaseId: string
  readonly runtimeEnvelopeSha256: string
  readonly runtimeManifestSha256: string
  readonly schemaVersion: 1
  readonly scope: 'runtime-transport'
}

export interface VerifiedRuntimeTransport {
  readonly directory: string
  readonly manifest: RuntimeTransportManifest
  readonly runtimeManifest: RuntimeReleaseManifest
  readonly transportEnvelopeSha256: string
  verifyCompleteTransportSnapshot: () => Promise<void>
}

export class RuntimeTransportError extends Error {
  constructor(
    readonly code:
      | 'RUNTIME_TRANSPORT_CANCELED'
      | 'RUNTIME_TRANSPORT_CHANGED'
      | 'RUNTIME_TRANSPORT_INVALID'
      | 'RUNTIME_TRANSPORT_STORAGE',
    message: string,
  ) {
    super(message)
    this.name = 'RuntimeTransportError'
  }
}

/** Pure admission shared by local verification and Main's explicitly selected remote source. */
export function verifyRuntimeTransportMetadata(input: {
  readonly appVersion: string
  readonly runtimeEnvelope: Buffer
  readonly transportEnvelope: Buffer
  readonly trustedKeys: Readonly<Record<string, string>>
}): Pick<VerifiedRuntimeTransport, 'manifest' | 'runtimeManifest' | 'transportEnvelopeSha256'> {
  const raw = verifyCanonicalRuntimeEnvelope(input.transportEnvelope, input.trustedKeys)
  const runtimeManifest = verifyRuntimeReleaseManifest(
    input.runtimeEnvelope,
    input.trustedKeys,
    input.appVersion,
  )
  return Object.freeze({
    manifest: validateDescriptor(raw, runtimeManifest, input.runtimeEnvelope),
    runtimeManifest,
    transportEnvelopeSha256: digest(input.transportEnvelope),
  })
}

/** Verifies transport trust/bytes, never extracts ZIP members or advertises installed readiness. */
export async function verifyRuntimeTransport(input: {
  readonly appVersion: string
  readonly directory: string
  readonly signal?: AbortSignal
  readonly trustedKeys: Readonly<Record<string, string>>
}): Promise<VerifiedRuntimeTransport> {
  const { appVersion, directory, signal } = input
  transportNotCanceled(signal)
  const trustedKeys = Object.freeze({ ...input.trustedKeys })
  const inspect = async () => {
    const root = await canonicalDirectory(directory)
    storage(
      (await fs.readdir(directory)).sort().join('\0') === [ARCHIVE, INNER, OUTER].sort().join('\0'),
      'Transport must contain exactly the completed archive and two envelopes.',
    )
    const outer = await inspectFile(path.join(directory, OUTER), MAX_ENVELOPE_BYTES, true, signal)
    const inner = await inspectFile(path.join(directory, INNER), MAX_ENVELOPE_BYTES, true, signal)
    const metadata = verifyRuntimeTransportMetadata({
      appVersion,
      runtimeEnvelope: inner.bytes!,
      transportEnvelope: outer.bytes!,
      trustedKeys,
    })
    const { manifest, runtimeManifest: runtime } = metadata
    const archive = await inspectFile(
      path.join(directory, ARCHIVE),
      MAX_ARCHIVE_BYTES,
      false,
      signal,
    )
    unchanged(
      archive.sha256 === manifest.artifact.sha256 &&
        archive.sizeBytes === manifest.artifact.sizeBytes,
    )
    unchanged(identity(await canonicalDirectory(directory)) === identity(root))
    return {
      manifest,
      runtime,
      snapshot: [
        identity(root),
        outer.identity,
        outer.sha256,
        inner.identity,
        inner.sha256,
        archive.identity,
        archive.sha256,
      ].join('\0'),
      transportEnvelopeSha256: metadata.transportEnvelopeSha256,
    }
  }
  const initial = await inspect()
  return Object.freeze({
    directory,
    manifest: initial.manifest,
    runtimeManifest: initial.runtime,
    transportEnvelopeSha256: initial.transportEnvelopeSha256,
    verifyCompleteTransportSnapshot: async () => {
      try {
        unchanged((await inspect()).snapshot === initial.snapshot)
      } catch (error) {
        if (error instanceof RuntimeTransportError && error.code === 'RUNTIME_TRANSPORT_CANCELED') {
          throw error
        }
        throw new RuntimeTransportError(
          'RUNTIME_TRANSPORT_CHANGED',
          'Runtime transport snapshot changed.',
        )
      }
    },
  })
}
/** Explicit externally trusted publisher key only: no shipping-key generation or fallback. */
export async function produceRuntimeTransport(input: {
  /** Internal qualification seam after signed source verification; never exposed by CLI/IPC. */
  readonly beforeArchive?: () => Promise<void>
  readonly outputDirectory: string
  readonly publisherKeyId: string
  readonly publisherPrivateKey: KeyObject
  readonly release: RuntimeReleaseSelection
}): Promise<VerifiedRuntimeTransport> {
  const { outputDirectory, publisherKeyId, publisherPrivateKey } = input
  const release = {
    ...input.release,
    envelope: Buffer.from(input.release.envelope),
    trustedKeys: Object.freeze({ ...input.release.trustedKeys }),
  }
  publisherTrusted(
    typeof publisherKeyId === 'string' &&
      /^[A-Z0-9][\w.+-]{0,127}$/i.test(publisherKeyId) &&
      Object.hasOwn(release.trustedKeys, publisherKeyId),
    'An explicitly trusted publisher identity is required.',
  )
  publisherTrusted(
    publisherPrivateKey instanceof KeyObject &&
      publisherPrivateKey.type === 'private' &&
      publisherPrivateKey.asymmetricKeyType === 'ed25519',
    'An explicit Ed25519 publisher private key is required.',
  )
  let matchingKey = false
  try {
    const expected = createPublicKey(release.trustedKeys[publisherKeyId])
    matchingKey =
      expected.asymmetricKeyType === 'ed25519' &&
      expected.export({ format: 'der', type: 'spki' }).equals(
        createPublicKey(
          publisherPrivateKey as unknown as Parameters<typeof createPublicKey>[0],
        ).export({
          format: 'der',
          type: 'spki',
        }),
      )
  } catch {
    /* Never serialize key parser details or input key material. */
  }
  publisherTrusted(
    matchingKey,
    'Publisher signing key does not match the external trusted keyring.',
  )
  const verified = await verifyRuntimeRelease(release)
  return await withRuntimeTransportOutput(outputDirectory, verified.directory, async (owned) => {
    const { anchor, sameOutput, write } = owned
    const temporary = '.runtime-payload.zip.tmp'
    const file = await fs.open(path.join(anchor, temporary), 'wx', 0o600)
    try {
      await input.beforeArchive?.()
      await writeZip(verified, file)
      await file.sync()
    } finally {
      await file.close()
    }
    await sameOutput()
    const archive = await inspectFile(path.join(anchor, temporary), MAX_ARCHIVE_BYTES)
    await verified.verifyCompletePayloadSnapshot()
    const manifest: RuntimeTransportManifest = {
      appVersion: verified.manifest.appVersion,
      artifact: {
        filename: ARCHIVE,
        format: 'zip-v1',
        sha256: archive.sha256,
        sizeBytes: archive.sizeBytes,
      },
      entryCount: verified.manifest.files.length,
      expandedRegularBytes: verified.manifest.files.reduce(
        (n, entry) => n + (entry.kind === 'file' ? entry.sizeBytes : 0),
        0,
      ),
      profile: verified.manifest.profile,
      releaseId: verified.manifest.releaseId,
      runtimeEnvelopeSha256: digest(release.envelope),
      runtimeManifestSha256: digest(canonicalRuntimeReleaseJson(verified.manifest)),
      schemaVersion: 1,
      scope: 'runtime-transport',
    }
    const payload = canonicalRuntimeReleaseJson(manifest)
    const outer = Buffer.from(
      JSON.stringify({
        keyId: publisherKeyId,
        payload: payload.toString('base64'),
        schemaVersion: 1,
        signature: sign(null, payload, publisherPrivateKey).toString('base64'),
      }),
    )
    await write(INNER, release.envelope)
    await write(OUTER, outer)
    await sameOutput()
    await fs.link(path.join(anchor, temporary), path.join(anchor, ARCHIVE))
    await fs.unlink(path.join(anchor, temporary))
    await owned.sync()
    await verified.verifyCompletePayloadSnapshot()
    await sameOutput()
    await owned.complete()
    return await verifyRuntimeTransport({
      appVersion: release.appVersion,
      directory: outputDirectory,
      trustedKeys: release.trustedKeys,
    })
  })
}

/** Existing producer's create-only, fd-anchored output owner, shared with extraction. */
export async function withRuntimeTransportOutput<T>(
  outputDirectory: string,
  excludedDirectory: string | null,
  operation: (owned: {
    anchor: string
    complete: () => Promise<void>
    sameOutput: () => Promise<void>
    sync: () => Promise<void>
    write: (name: string, bytes: Buffer) => Promise<void>
  }) => Promise<T>,
): Promise<T> {
  storage(
    path.isAbsolute(outputDirectory) &&
      path.resolve(outputDirectory) === outputDirectory &&
      (excludedDirectory === null ||
        (outputDirectory !== excludedDirectory &&
          !outputDirectory.startsWith(excludedDirectory + path.sep))),
    'Output must be a new canonical directory outside the input payload.',
  )
  const parent = path.dirname(outputDirectory)
  const parentInfo = await canonicalDirectory(parent)
  const parentHandle = await fs.open(parent, DIRECTORY_FLAGS)
  let output: fs.FileHandle | undefined
  try {
    unchanged(identity(await parentHandle.stat({ bigint: true })) === identity(parentInfo))
    const ownedPath = path.join(`/proc/self/fd/${parentHandle.fd}`, path.basename(outputDirectory))
    try {
      await fs.mkdir(ownedPath, { mode: 0o700 })
    } catch {
      throw new RuntimeTransportError(
        'RUNTIME_TRANSPORT_STORAGE',
        'Transport output must be a new directory.',
      )
    }
    output = await fs.open(ownedPath, DIRECTORY_FLAGS)
    const owned = await output.stat({ bigint: true })
    const anchor = `/proc/self/fd/${output.fd}`
    storage((await fs.readdir(anchor)).length === 0, 'The new transport directory was replaced.')
    const sameOutput = async () => {
      const visible = await canonicalDirectory(outputDirectory)
      const held = await output!.stat({ bigint: true })
      const visibleParent = await fs.lstat(parent, { bigint: true })
      unchanged(
        visible.dev === owned.dev &&
          visible.ino === owned.ino &&
          held.dev === owned.dev &&
          held.ino === owned.ino &&
          visibleParent.dev === parentInfo.dev &&
          visibleParent.ino === parentInfo.ino &&
          (await fs.realpath(parent)) === parent,
      )
    }
    const write = async (name: string, bytes: Buffer) => {
      await sameOutput()
      const file = await fs.open(path.join(anchor, name), 'wx', 0o600)
      try {
        await file.writeFile(bytes)
        await file.sync()
      } finally {
        await file.close()
      }
    }
    await write(MARKER, Buffer.from('Runtime transport operation is incomplete.\n'))
    await output.sync()
    await parentHandle.sync()
    return await operation({
      anchor,
      complete: async () => {
        await sameOutput()
        await fs.unlink(path.join(anchor, MARKER))
        await output!.sync()
        await parentHandle.sync()
      },
      sameOutput,
      sync: async () => {
        await sameOutput()
        await output!.sync()
      },
      write,
    })
  } finally {
    await output?.close()
    await parentHandle.close()
  }
}

export function transportNotCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new RuntimeTransportError(
      'RUNTIME_TRANSPORT_CANCELED',
      'Runtime extraction was canceled.',
    )
  }
}

function need(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new RuntimeTransportError('RUNTIME_TRANSPORT_INVALID', message)
  }
}
function storage(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new RuntimeTransportError('RUNTIME_TRANSPORT_STORAGE', message)
  }
}
function unchanged(condition: unknown): asserts condition {
  if (!condition) {
    throw new RuntimeTransportError(
      'RUNTIME_TRANSPORT_CHANGED',
      'Runtime transport inputs changed.',
    )
  }
}

function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  need(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Invalid transport object.',
  )
  need(
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
    'Invalid transport fields.',
  )
}

async function canonicalDirectory(directory: string) {
  storage(
    typeof directory === 'string' &&
      path.isAbsolute(directory) &&
      path.resolve(directory) === directory,
    'A canonical absolute directory is required.',
  )
  const info = await fs.lstat(directory, { bigint: true })
  storage(
    info.isDirectory() && !info.isSymbolicLink() && (await fs.realpath(directory)) === directory,
    'A plain directory without symlink ancestors is required.',
  )
  return info
}

/** Bounded/stable ordinary-file stream. Hash/copy never buffers a wheel or archive. */
async function inspectFile(filename: string, maximum: number, bytes = false, signal?: AbortSignal) {
  transportNotCanceled(signal)
  const before = await fs.lstat(filename, { bigint: true })
  storage(
    before.isFile() && !before.isSymbolicLink() && before.size <= BigInt(maximum),
    'Invalid transport file type or size.',
  )
  const handle = await fs.open(filename, FILE_FLAGS)
  try {
    unchanged(identity(await handle.stat({ bigint: true })) === identity(before))
    const hash = createHash('sha256')
    const chunks: Buffer[] = []
    const chunk = Buffer.allocUnsafe(1024 * 1024)
    let size = 0
    for (;;) {
      transportNotCanceled(signal)
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
      if (!bytesRead) {
        break
      }
      size += bytesRead
      unchanged(BigInt(size) <= before.size)
      hash.update(chunk.subarray(0, bytesRead))
      if (bytes) {
        chunks.push(Buffer.from(chunk.subarray(0, bytesRead)))
      }
    }
    unchanged(
      BigInt(size) === before.size &&
        identity(await handle.stat({ bigint: true })) === identity(before) &&
        identity(await fs.lstat(filename, { bigint: true })) === identity(before),
    )
    return {
      bytes: bytes ? Buffer.concat(chunks) : null,
      identity: identity(before),
      sha256: hash.digest('hex'),
      sizeBytes: size,
    }
  } finally {
    await handle.close()
  }
}

function validateDescriptor(
  raw: unknown,
  runtime: RuntimeReleaseManifest,
  inner: Buffer,
): RuntimeTransportManifest {
  exact(raw, [
    'schemaVersion',
    'scope',
    'appVersion',
    'releaseId',
    'profile',
    'runtimeEnvelopeSha256',
    'runtimeManifestSha256',
    'entryCount',
    'expandedRegularBytes',
    'artifact',
  ])
  exact(raw['artifact'], ['filename', 'format', 'sizeBytes', 'sha256'])
  const artifact = raw['artifact']
  need(
    raw['schemaVersion'] === 1 &&
      raw['scope'] === 'runtime-transport' &&
      raw['profile'] === runtime.profile &&
      raw['appVersion'] === runtime.appVersion &&
      raw['releaseId'] === runtime.releaseId,
    'Transport release identity differs.',
  )
  unchanged(
    raw['runtimeEnvelopeSha256'] === digest(inner) &&
      raw['runtimeManifestSha256'] === digest(canonicalRuntimeReleaseJson(runtime)),
  )
  need(
    raw['entryCount'] === runtime.files.length &&
      raw['expandedRegularBytes'] ===
        runtime.files.reduce((n, file) => n + (file.kind === 'file' ? file.sizeBytes : 0), 0),
    'Transport expanded inventory differs.',
  )
  need(
    artifact['filename'] === ARCHIVE &&
      artifact['format'] === 'zip-v1' &&
      typeof artifact['sha256'] === 'string' &&
      /^[a-f0-9]{64}$/.test(artifact['sha256']) &&
      typeof artifact['sizeBytes'] === 'number' &&
      Number.isSafeInteger(artifact['sizeBytes']) &&
      artifact['sizeBytes'] > 0 &&
      artifact['sizeBytes'] <= MAX_ARCHIVE_BYTES,
    'Transport archive identity is invalid.',
  )
  return Object.freeze({
    ...raw,
    artifact: Object.freeze({ ...artifact }),
  }) as unknown as RuntimeTransportManifest
}

function publisherTrusted(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new RuntimeReleaseError('RUNTIME_RELEASE_UNTRUSTED', message)
  }
}

async function writeZip(
  verified: Awaited<ReturnType<typeof verifyRuntimeRelease>>,
  destination: fs.FileHandle,
) {
  const zip = new yazl.ZipFile()
  const archiveStream = zip.outputStream as Readable
  const members: Readable[] = []
  const settled: Promise<void>[] = []
  zip.on('error', (error: Error) => archiveStream.destroy(error))
  let total = 0
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length
      callback(
        total > MAX_ARCHIVE_BYTES
          ? new RuntimeTransportError(
              'RUNTIME_TRANSPORT_INVALID',
              'Archive exceeds its finite transport byte limit.',
            )
          : null,
        chunk,
      )
    },
  })
  // This stream never owns/closes the descriptor. The producer owns its one FileHandle.
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      void (async () => {
        let offset = 0
        while (offset < chunk.length) {
          const { bytesWritten } = await destination.write(chunk, offset, chunk.length - offset)
          storage(bytesWritten > 0, 'Archive writer stopped making progress.')
          offset += bytesWritten
        }
      })().then(
        () => callback(),
        (error: Error) => callback(error),
      )
    },
  })
  const saving = pipeline(archiveStream, limit, output)
  saving.catch(() => undefined)
  try {
    for (const entry of [...verified.manifest.files].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    )) {
      const options = {
        compress: entry.kind === 'file' && !entry.path.endsWith('.whl'),
        forceDosTimestamp: true,
        mode: entry.kind === 'symlink' ? 0o12_0777 : entry.executable ? 0o10_0700 : 0o10_0600,
        mtime: DATE,
      }
      if (entry.kind === 'symlink') {
        zip.addBuffer(Buffer.from(entry.target), entry.path, { ...options, compress: false })
        continue
      }
      const signedFile = entry
      zip.addReadStreamLazy(entry.path, { ...options, size: entry.sizeBytes }, (callback) => {
        // Invoke's fixed-buffer read/hash loop adapted as one owned async iterator. Destroying
        // Readable.from() awaits iterator finally; no fs stream independently closes this fd.
        async function* chunks() {
          const filename = path.join(verified.directory, signedFile.path)
          const before = await fs.lstat(filename, { bigint: true })
          unchanged(
            before.isFile() &&
              !before.isSymbolicLink() &&
              before.size === BigInt(signedFile.sizeBytes),
          )
          const file = await fs.open(filename, FILE_FLAGS)
          try {
            unchanged(identity(await file.stat({ bigint: true })) === identity(before))
            const hash = createHash('sha256')
            const chunk = Buffer.allocUnsafe(1024 * 1024)
            let size = 0
            for (;;) {
              const { bytesRead } = await file.read(chunk, 0, chunk.length, null)
              if (!bytesRead) {
                break
              }
              size += bytesRead
              unchanged(size <= signedFile.sizeBytes)
              hash.update(chunk.subarray(0, bytesRead))
              yield Buffer.from(chunk.subarray(0, bytesRead))
            }
            unchanged(
              size === signedFile.sizeBytes &&
                hash.digest('hex') === signedFile.sha256 &&
                identity(await file.stat({ bigint: true })) === identity(before) &&
                identity(await fs.lstat(filename, { bigint: true })) === identity(before),
            )
          } finally {
            await file.close()
          }
        }
        const source = Readable.from(chunks(), { highWaterMark: 64 * 1024, objectMode: false })
        source.on('error', (error: Error) => archiveStream.destroy(error))
        members.push(source)
        const closed = finished(source, { cleanup: true })
        closed.catch(() => undefined)
        settled.push(closed)
        callback(null, source)
      })
    }
    zip.end({ comment: '', forceZip64Format: true })
    await saving
  } catch (error) {
    archiveStream.destroy(error instanceof Error ? error : new Error('Archive production failed.'))
    await saving.catch(() => undefined)
    throw error
  } finally {
    for (const source of members) {
      source.destroy()
    }
    await Promise.allSettled(settled)
  }
}
