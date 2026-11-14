/**
 * Invoke4875 download_default.py:_do_download and model_install_default.py:
 * download_and_cache_model (invocation_context.py callers). Reuse the existing HTTPS stream owner
 * and serialize/recheck complete entries. Signed runtime admission and fd publication adapt
 * Studio's existing transport contract; upstream has no signed managed-runtime catalog.
 */
import { type BigIntStats, constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'

import { ModelDownloader, validateRuntimeArtifactSource } from '../models/model-downloader.js'
import {
  RuntimeTransportError,
  transportNotCanceled,
  type VerifiedRuntimeTransport,
  verifyRuntimeTransport,
  verifyRuntimeTransportMetadata,
  withRuntimeTransportOutput,
} from './runtime-release-transport.js'

const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const pending = new Map<string, Promise<void>>()
const inode = (info: BigIntStats) => [info.dev, info.ino].join(':')
const identity = (info: BigIntStats) =>
  [info.dev, info.ino, info.mode, info.size, info.mtimeNs, info.ctimeNs].join(':')

export interface RuntimeTransportCacheInput {
  readonly appVersion: string
  /** Main-owned exact entry container. Its parent already exists; no catalog or eviction. */
  readonly cacheDirectory: string
  /** Internal qualification seam. Production uses the existing DNS-pinned HTTPS owner. */
  readonly downloader?: Pick<ModelDownloader, 'downloadRuntimeArtifact'>
  readonly onProgress?: (progress: { downloadedBytes: number; totalBytes: number | null }) => void
  readonly runtimeEnvelope: Buffer
  readonly signal?: AbortSignal
  /** Explicit trusted Main selection; URLs are not authenticated by the signed envelopes. */
  readonly source: Readonly<{ redirectOrigins: readonly string[]; url: string }>
  readonly transportEnvelope: Buffer
  readonly trustedKeys: Readonly<Record<string, string>>
}

/**
 * One explicit attempt or freshly verified complete-cache reuse. Failure preserves incomplete owned
 * output for inspection; it never deletes/replaces an entry or resumes partial bytes.
 */
export async function cacheRuntimeTransport(
  input: RuntimeTransportCacheInput,
): Promise<VerifiedRuntimeTransport> {
  const { appVersion, cacheDirectory, onProgress, signal } = input
  storage(
    typeof cacheDirectory === 'string' &&
      path.isAbsolute(cacheDirectory) &&
      path.resolve(cacheDirectory) === cacheDirectory,
    'A canonical absolute cache entry is required.',
  )
  storage(
    Buffer.isBuffer(input.runtimeEnvelope) &&
      input.runtimeEnvelope.length <= 1024 ** 2 &&
      Buffer.isBuffer(input.transportEnvelope) &&
      input.transportEnvelope.length <= 1024 ** 2,
    'Runtime envelopes must be bounded buffers.',
  )
  const runtimeEnvelope = Buffer.from(input.runtimeEnvelope)
  const transportEnvelope = Buffer.from(input.transportEnvelope)
  const trustedKeys = Object.freeze({ ...input.trustedKeys })
  // Complete trust/source admission is synchronous and precedes both storage and DNS.
  const metadata = verifyRuntimeTransportMetadata({
    appVersion,
    runtimeEnvelope,
    transportEnvelope,
    trustedKeys,
  })
  const source = validateRuntimeArtifactSource(input.source)
  transportNotCanceled(signal)
  const downloader = input.downloader ?? new ModelDownloader()

  // Invoke's per-source lock becomes a per-entry promise chain. Waiters recheck real bytes.
  const previous = pending.get(cacheDirectory) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  pending.set(cacheDirectory, current)
  let entered = false
  const done = () => {
    release()
    if (pending.get(cacheDirectory) === current) {
      pending.delete(cacheDirectory)
    }
  }
  try {
    await waitForTurn(previous, signal)
    entered = true
    transportNotCanceled(signal)
    const verifySelected = async () => {
      const result = await verifyRuntimeTransport({
        appVersion,
        directory: path.join(cacheDirectory, 'transport'),
        signal,
        trustedKeys,
      })
      storage(
        result.transportEnvelopeSha256 === metadata.transportEnvelopeSha256 &&
          result.manifest.runtimeEnvelopeSha256 === metadata.manifest.runtimeEnvelopeSha256,
        'Cached transport differs from the selected signed envelopes.',
      )
      return result
    }
    const before = await fs.lstat(cacheDirectory, { bigint: true }).catch((error: unknown) => {
      if (isMissing(error)) {
        return null
      }
      throw error
    })
    if (before) {
      storage(
        before.isDirectory() &&
          !before.isSymbolicLink() &&
          (await fs.realpath(cacheDirectory)) === cacheDirectory &&
          (await fs.readdir(cacheDirectory)).join('\0') === 'transport',
        'Cache entry is incomplete or is not an owned complete container.',
      )
      const result = await verifySelected()
      storage(
        identity(await fs.lstat(cacheDirectory, { bigint: true })) === identity(before) &&
          (await fs.realpath(cacheDirectory)) === cacheDirectory,
        'Cache entry changed during verification.',
      )
      return result
    }

    return await withRuntimeTransportOutput(cacheDirectory, null, async (owned) => {
      await fs.mkdir(path.join(owned.anchor, 'transport'), { mode: 0o700 })
      const child = await fs.open(path.join(owned.anchor, 'transport'), DIRECTORY_FLAGS)
      try {
        const initial = await child.stat({ bigint: true })
        const childAnchor = `/proc/self/fd/${child.fd}`
        const sameChild = async () => {
          await owned.sameOutput()
          storage(
            inode(await fs.lstat(path.join(owned.anchor, 'transport'), { bigint: true })) ===
              inode(initial),
            'The cache transport directory changed.',
          )
        }
        const staged = await downloader.downloadRuntimeArtifact({
          ...source,
          expectedBytes: metadata.manifest.artifact.sizeBytes,
          expectedSha256: metadata.manifest.artifact.sha256,
          onProgress,
          signal,
          stagingDirectory: `${owned.anchor}/.`,
        })
        transportNotCanceled(signal)
        await sameChild()
        const name = path.basename(staged.stagingPath)
        storage(
          /^[a-f0-9-]{36}\.part$/.test(name) &&
            staged.stagingPath === path.join(owned.anchor, name),
          'The downloader returned an unowned staging path.',
        )
        const sourceInfo = await fs.lstat(staged.stagingPath, { bigint: true })
        storage(
          sourceInfo.isFile() &&
            !sourceInfo.isSymbolicLink() &&
            sourceInfo.nlink === 1n &&
            sourceInfo.size === BigInt(metadata.manifest.artifact.sizeBytes),
          'The downloaded archive is not a private exact-sized regular file.',
        )
        const sourceHandle = await fs.open(staged.stagingPath, FILE_FLAGS)
        try {
          storage(
            identity(await sourceHandle.stat({ bigint: true })) === identity(sourceInfo),
            'The downloaded archive changed.',
          )
          await sourceHandle.sync()
          await sameChild()
          await fs.link(staged.stagingPath, path.join(childAnchor, 'runtime-payload.zip'))
          storage(
            inode(
              await fs.lstat(path.join(childAnchor, 'runtime-payload.zip'), { bigint: true }),
            ) === inode(sourceInfo),
            'The downloaded archive changed during publication.',
          )
          await fs.unlink(staged.stagingPath)
        } finally {
          await sourceHandle.close()
        }
        for (const [filename, bytes] of [
          ['runtime-release.json', runtimeEnvelope],
          ['runtime-transport.json', transportEnvelope],
        ] as const) {
          await sameChild()
          const file = await fs.open(path.join(childAnchor, filename), 'wx', 0o600)
          try {
            await file.writeFile(bytes)
            await file.sync()
          } finally {
            await file.close()
          }
        }
        await child.sync()
        await sameChild()
        // Do not trust the downloader's receipt. Existing verifier rehashes actual archive bytes.
        const verified = await verifySelected()
        await sameChild()
        transportNotCanceled(signal)
        storage(
          (await fs.readdir(owned.anchor)).sort().join('\0') === '.incomplete\0transport',
          'Unexpected cache work files remain.',
        )
        await owned.complete()
        return verified
      } finally {
        await child.close()
      }
    })
  } finally {
    // A canceled waiter returns promptly but its gate must not let later callers overtake A.
    if (entered) {
      done()
    } else {
      void previous.then(done)
    }
  }
}

async function waitForTurn(previous: Promise<void>, signal?: AbortSignal): Promise<void> {
  transportNotCanceled(signal)
  if (!signal) {
    return await previous
  }
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(
        new RuntimeTransportError('RUNTIME_TRANSPORT_CANCELED', 'Runtime download was canceled.'),
      )
    }
    signal.addEventListener('abort', abort, { once: true })
    void previous.then(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    })
    if (signal.aborted) {
      abort()
    }
  })
}

function storage(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new RuntimeTransportError('RUNTIME_TRANSPORT_STORAGE', message)
  }
}
function isMissing(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
