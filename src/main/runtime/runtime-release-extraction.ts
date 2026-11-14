/**
 * Invoke4875 invk/archive.ts expansion budget + importProject callers; see extraction research.
 * Studio's existing lazy IGS ZIP reader and transport output owner are adapted for signed runtime
 * files. No generic unzip, execution, dependency resolution, installation or activation occurs.
 */
import { createHash } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { finished } from 'node:stream/promises'
import { crc32 } from 'node:zlib'
import * as yauzl from 'yauzl'

import {
  RuntimeTransportError,
  transportNotCanceled,
  verifyRuntimeTransport,
  withRuntimeTransportOutput,
} from './runtime-release-transport.js'
import {
  RuntimeReleaseError,
  type RuntimeReleaseManifest,
  type RuntimeReleaseSelection,
  verifyRuntimeRelease,
} from './runtime-release.js'

const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const MAX_ENTRIES = 100_000
const MAX_METADATA_BYTES = 128 * 1024 ** 2
const fingerprint = (s: BigIntStats) =>
  [s.dev, s.ino, s.mode, s.size, s.mtimeNs, s.ctimeNs].join(':')
export async function extractRuntimeTransport(input: {
  readonly appVersion: string
  readonly beforeDirectories?: () => Promise<void>
  /** Qualification-only fault seam after trust/budget preflight; not exposed by IPC. */
  readonly beforeExtract?: () => Promise<void>
  readonly beforeFileWrite?: (member: string) => Promise<void>
  readonly outputDirectory: string
  readonly signal?: AbortSignal
  readonly transportDirectory: string
  readonly trustedKeys: Readonly<Record<string, string>>
}): Promise<RuntimeReleaseSelection> {
  const { appVersion, outputDirectory, signal, transportDirectory } = input
  const trustedKeys = Object.freeze({ ...input.trustedKeys })
  transportNotCanceled(signal)
  const transport = await verifyRuntimeTransport({
    appVersion,
    directory: transportDirectory,
    signal,
    trustedKeys,
  })
  const manifest = transport.runtimeManifest
  const directories = parentDirectories(manifest)
  valid(
    directories.size + manifest.files.length <= MAX_ENTRIES,
    'Expanded runtime tree exceeds its entry ceiling.',
  )
  const archivePath = path.join(transport.directory, transport.manifest.artifact.filename)
  const initial = await fs.lstat(archivePath, { bigint: true })
  const archive = await fs.open(archivePath, FILE_FLAGS)
  let zip: yauzl.ZipFile | undefined
  let zipClosed: Promise<void> | undefined
  try {
    same(fingerprint(await archive.stat({ bigint: true })) === fingerprint(initial))
    await transport.verifyCompleteTransportSnapshot()
    // yauzl owns a separate fd opened through this anchor; zip.close() must never close ours.
    zip = await yauzl.openPromise(`/proc/self/fd/${archive.fd}`, {
      autoClose: false,
      decodeStrings: true,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    })
    zipClosed = new Promise((resolve) => zip!.once('close', resolve))
    zip.on('error', () => undefined) // eachEntry/openReadStream report failures; never leave an unhandled event.
    valid(
      Number.isSafeInteger(zip.entryCount) && zip.entryCount === manifest.files.length,
      'ZIP entry count differs from the signed runtime inventory.',
    )
    const expected = new Map(manifest.files.map((entry) => [entry.path, entry]))
    const entries: yauzl.Entry[] = []
    const seen = new Set<string>()
    let metadataBytes = 0
    let expandedBytes = 0
    for await (const entry of zip.eachEntry()) {
      transportNotCanceled(signal)
      metadataBytes += 46 + entry.fileNameLength + entry.extraFieldLength + entry.fileCommentLength
      valid(
        metadataBytes <= MAX_METADATA_BYTES && entries.length < MAX_ENTRIES,
        'ZIP metadata exceeds its finite budget.',
      )
      const file = expected.get(entry.fileName)
      valid(
        file && !seen.has(entry.fileName),
        'ZIP contains an unexpected or duplicate runtime member.',
      )
      seen.add(entry.fileName)
      const mode = entry.externalFileAttributes >>> 16
      const expectedMode =
        file.kind === 'symlink' ? 0o12_0777 : file.executable ? 0o10_0700 : 0o10_0600
      const size = file.kind === 'symlink' ? Buffer.byteLength(file.target) : file.sizeBytes
      valid(
        mode === expectedMode &&
          !entry.fileName.endsWith('/') &&
          !entry.isEncrypted() &&
          entry.canDecodeFileData() &&
          (entry.compressionMethod === 0 || entry.compressionMethod === 8) &&
          (entry.generalPurposeBitFlag & ~0x8_08) === 0,
        'ZIP runtime member type, permissions or compression is unsupported.',
      )
      valid(
        Number.isSafeInteger(entry.uncompressedSize) &&
          entry.uncompressedSize === size &&
          Number.isSafeInteger(entry.compressedSize) &&
          entry.compressedSize >= 0 &&
          entry.compressedSize <= transport.manifest.artifact.sizeBytes,
        'ZIP declared member size differs from the signed runtime size.',
      )
      valid(
        entry.compressionMethod !== 0 || entry.compressedSize === entry.uncompressedSize,
        'Stored ZIP member has inconsistent sizes.',
      )
      if (file.kind === 'file') {
        expandedBytes += size
      }
      valid(
        expandedBytes <= transport.manifest.expandedRegularBytes,
        'ZIP exceeds its signed expansion budget.',
      )
      entries.push(entry)
    }
    valid(
      seen.size === expected.size &&
        entries.length === zip.entryCount &&
        expandedBytes === transport.manifest.expandedRegularBytes,
      'ZIP runtime membership is incomplete.',
    )
    for (const entry of entries) {
      const file = expected.get(entry.fileName)!
      if (file.kind !== 'symlink') {
        continue
      }
      const stream = await zip.openReadStreamPromise(entry)
      const settled = finished(stream, { cleanup: true })
      settled.catch(() => undefined)
      const parts: Buffer[] = []
      let size = 0
      let crc = 0
      const cancel = () =>
        stream.destroy(
          new RuntimeTransportError(
            'RUNTIME_TRANSPORT_CANCELED',
            'Runtime extraction was canceled.',
          ),
        )
      signal?.addEventListener('abort', cancel, { once: true })
      try {
        for await (const raw of stream) {
          transportNotCanceled(signal)
          const bytes = Buffer.from(raw)
          size += bytes.length
          valid(size <= Buffer.byteLength(file.target), 'ZIP link target exceeds its signed size.')
          crc = crc32(bytes, crc)
          parts.push(bytes)
        }
        valid(
          size === entry.uncompressedSize &&
            crc === entry.crc32 &&
            Buffer.concat(parts).equals(Buffer.from(file.target)),
          'ZIP link target differs from its signed target.',
        )
      } finally {
        signal?.removeEventListener('abort', cancel)
        stream.destroy()
        await settled.catch(() => undefined)
      }
    }
    const innerPath = path.join(transport.directory, 'runtime-release.json')
    const inner = await readEnvelope(innerPath)
    same(
      createHash('sha256').update(inner).digest('hex') === transport.manifest.runtimeEnvelopeSha256,
    )
    transportNotCanceled(signal)
    return await withRuntimeTransportOutput(outputDirectory, transport.directory, async (owned) => {
      await input.beforeExtract?.()
      transportNotCanceled(signal)
      const payload = path.join(owned.anchor, 'payload')
      await fs.mkdir(payload, { mode: 0o700 })
      const parents = new Map<string, { dev: bigint; handle: fs.FileHandle; ino: bigint }>()
      const dirAnchor = (name: string) => `/proc/self/fd/${parents.get(name)!.handle.fd}`
      const hold = async (name: string, at: string) => {
        const handle = await fs.open(at, DIRECTORY_FLAGS)
        let info
        try {
          info = await handle.stat({ bigint: true })
        } catch (error) {
          await handle.close()
          throw error
        }
        parents.set(name, { dev: info.dev, handle, ino: info.ino })
        same(info.isDirectory() && (await fs.readdir(`/proc/self/fd/${handle.fd}`)).length === 0)
      }
      const checkParents = async (name: string) => {
        await owned.sameOutput()
        const parts = name.split('/')
        parts.pop()
        for (let i = 0; i <= parts.length; i++) {
          const key = parts.slice(0, i).join('/')
          const parentKey = parts.slice(0, Math.max(0, i - 1)).join('/')
          const at = await fs.lstat(
            i === 0
              ? path.join(owned.anchor, 'payload')
              : path.join(dirAnchor(parentKey), parts[i - 1]),
            { bigint: true },
          )
          const held = parents.get(key)!
          same(
            at.isDirectory() && !at.isSymbolicLink() && at.dev === held.dev && at.ino === held.ino,
          )
        }
      }
      try {
        await hold('', payload)
        await input.beforeDirectories?.()
        // Every write uses a held no-follow parent fd. Visible paths only detect substitution.
        for (const name of [...directories].sort(
          (a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1),
        )) {
          transportNotCanceled(signal)
          await checkParents(name)
          const parts = name.split('/')
          const leaf = parts.pop()!
          const at = path.join(dirAnchor(parts.join('/')), leaf)
          await fs.mkdir(at, { mode: 0o700 })
          await hold(name, at)
        }
        const links: { name: string; target: string }[] = []
        for (const entry of entries) {
          transportNotCanceled(signal)
          await checkParents(entry.fileName)
          const file = expected.get(entry.fileName)!
          const stream = await zip!.openReadStreamPromise(entry)
          const settled = finished(stream, { cleanup: true })
          settled.catch(() => undefined)
          const cancel = () =>
            stream.destroy(
              new RuntimeTransportError(
                'RUNTIME_TRANSPORT_CANCELED',
                'Runtime extraction was canceled.',
              ),
            )
          signal?.addEventListener('abort', cancel, { once: true })
          let output: fs.FileHandle | undefined
          const targetParts: Buffer[] = []
          let count = 0
          let crc = 0
          const hash = createHash('sha256')
          const size = file.kind === 'file' ? file.sizeBytes : Buffer.byteLength(file.target)
          try {
            if (file.kind === 'file') {
              await input.beforeFileWrite?.(file.path)
              const parts = file.path.split('/')
              const leaf = parts.pop()!
              output = await fs.open(path.join(dirAnchor(parts.join('/')), leaf), 'wx', 0o600)
            }
            for await (const raw of stream) {
              transportNotCanceled(signal)
              const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
              count += chunk.length
              valid(count <= size, 'Runtime ZIP member exceeds its signed size during extraction.')
              crc = crc32(chunk, crc)
              hash.update(chunk)
              if (output) {
                let offset = 0
                while (offset < chunk.length) {
                  const { bytesWritten } = await output.write(chunk, offset, chunk.length - offset)
                  valid(bytesWritten > 0, 'Runtime extraction writer stopped making progress.')
                  offset += bytesWritten
                }
              } else {
                targetParts.push(chunk)
              }
            }
            same(count === size && crc === entry.crc32)
            if (file.kind === 'file') {
              same(hash.digest('hex') === file.sha256)
              await output!.chmod(file.executable ? 0o700 : 0o600)
              await output!.sync()
            } else {
              same(Buffer.concat(targetParts).equals(Buffer.from(file.target)))
              links.push({ name: file.path, target: file.target })
            }
          } finally {
            signal?.removeEventListener('abort', cancel)
            stream.destroy()
            await settled.catch(() => undefined)
            await output?.close()
          }
          await checkParents(entry.fileName)
        }
        for (const link of links) {
          transportNotCanceled(signal)
          await checkParents(link.name)
          const parts = link.name.split('/')
          const leaf = parts.pop()!
          await fs.symlink(link.target, path.join(dirAnchor(parts.join('/')), leaf))
        }
        for (const [name, held] of [...parents.entries()].reverse()) {
          await checkParents(name ? `${name}/__check__` : '__check__')
          await held.handle.sync()
        }
        const selection = Object.freeze({
          appVersion,
          directory: path.join(outputDirectory, 'payload'),
          envelope: Buffer.from(inner),
          trustedKeys,
        })
        const verified = await verifyRuntimeRelease(selection)
        await owned.write('runtime-release.json', inner)
        await verified.verifyCompletePayloadSnapshot()
        await transport.verifyCompleteTransportSnapshot()
        same(
          fingerprint(await archive.stat({ bigint: true })) === fingerprint(initial) &&
            fingerprint(await fs.lstat(archivePath, { bigint: true })) === fingerprint(initial),
        )
        transportNotCanceled(signal)
        await owned.complete()
        return selection
      } finally {
        await Promise.all([...parents.values()].map(({ handle }) => handle.close()))
      }
    })
  } catch (error) {
    if (error instanceof RuntimeTransportError || error instanceof RuntimeReleaseError) {
      throw error
    }
    const code =
      error instanceof Error &&
      'code' in error &&
      ['EACCES', 'EEXIST', 'ELOOP', 'EMFILE', 'ENFILE', 'ENOENT', 'ENOSPC', 'ENOTDIR'].includes(
        String(error.code),
      )
        ? 'RUNTIME_TRANSPORT_STORAGE'
        : 'RUNTIME_TRANSPORT_INVALID'
    throw new RuntimeTransportError(code, 'Runtime ZIP extraction could not complete.')
  } finally {
    if (zip) {
      zip.close()
      await zipClosed
    }
    await archive.close()
  }
}
function valid(value: unknown, message: string): asserts value {
  if (!value) {
    throw new RuntimeTransportError('RUNTIME_TRANSPORT_INVALID', message)
  }
}

function same(value: unknown): asserts value {
  if (!value) {
    throw new RuntimeTransportError(
      'RUNTIME_TRANSPORT_CHANGED',
      'Runtime extraction input or output changed.',
    )
  }
}

function parentDirectories(manifest: RuntimeReleaseManifest): Set<string> {
  const directories = new Set<string>()
  for (const file of manifest.files) {
    const parts = file.path.split('/')
    parts.pop()
    for (let i = 1; i <= parts.length; i++) {
      directories.add(parts.slice(0, i).join('/'))
      valid(
        directories.size + manifest.files.length <= MAX_ENTRIES,
        'Expanded runtime tree exceeds its entry ceiling.',
      )
    }
  }
  return directories
}

async function readEnvelope(filename: string): Promise<Buffer> {
  const info = await fs.lstat(filename, { bigint: true })
  same(info.isFile() && !info.isSymbolicLink() && info.size <= 1024n * 1024n)
  const file = await fs.open(filename, FILE_FLAGS)
  try {
    same(fingerprint(await file.stat({ bigint: true })) === fingerprint(info))
    const bytes = Buffer.alloc(Number(info.size))
    let count = 0
    while (count < bytes.length) {
      const result = await file.read(bytes, count, bytes.length - count, null)
      same(result.bytesRead > 0)
      count += result.bytesRead
    }
    same(
      fingerprint(await file.stat({ bigint: true })) === fingerprint(info) &&
        fingerprint(await fs.lstat(filename, { bigint: true })) === fingerprint(info),
    )
    return bytes
  } finally {
    await file.close()
  }
}
