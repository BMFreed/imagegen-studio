/**
 * Invoke launcher c267bdb4 updater.ts16–48 and main-process-manager.ts167; exact
 * electron-updater6.6.2 AppImageUpdater/DownloadedUpdateHelper own transfer and cache. Recheck
 * returned files because its same-process cache bypasses hashing.
 */
import type { AppUpdater } from 'electron-updater'
import type { DownloadedUpdateHelper } from 'electron-updater/out/DownloadedUpdateHelper.js'

import electronUpdater from 'electron-updater'
import { findFile } from 'electron-updater/out/providers/Provider.js'
import { createHash } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'

import type { ApplicationUpdateChecker } from './application-update-service.js'

type Progress = { downloadedBytes: number; totalBytes: number }
const fileFlags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const identity = (s: BigIntStats) => [s.dev, s.ino, s.mode, s.size, s.mtimeNs, s.ctimeNs].join(':')

/** Native transfer is unchanged. No download completion grants installer authority. */
export class VerifiedAppImageUpdater extends electronUpdater.AppImageUpdater {
  async downloadVerified(onProgress: (progress: Progress) => void): Promise<{ sizeBytes: number }> {
    const source = this.updateInfoAndProvider
    need(source, 'No current application update is available.')
    const files = source.provider.resolveFiles(source.info)
    const selected = findFile(files, 'AppImage', ['rpm', 'deb', 'pacman'])
    const candidates = files.filter((file) => file.url.pathname.endsWith('.AppImage'))
    need(
      selected && candidates.length === 1 && candidates[0] === selected,
      'A single AppImage descriptor is required.',
    )
    const name = path.basename(decodeURIComponent(selected.url.pathname))
    const sha512 = selected.info.sha512
    const sizeBytes = selected.info.size
    need(
      name.endsWith('.AppImage') &&
        !name.includes('\\') &&
        !name.includes('\0') &&
        typeof sha512 === 'string' &&
        Buffer.from(sha512, 'base64').length === 64 &&
        Buffer.from(sha512, 'base64').toString('base64') === sha512 &&
        typeof sizeBytes === 'number' &&
        Number.isSafeInteger(sizeBytes) &&
        sizeBytes > 0,
      'Invalid AppImage integrity descriptor.',
    )
    // Capture values, rather than retaining mutable provider metadata across transfer.
    const expected = Object.freeze({ name, sha512, sizeBytes })
    // Native cache validation can clear pending before returning a file. Admit
    // its directory before the first native filesystem consumer, not only after
    // transfer. Reuse the pinned library's own helper creation/configuration.
    const helper = await this.prepareDownloadCache()
    const listener = (progress: { total: number; transferred: number }) => {
      onProgress({ downloadedBytes: progress.transferred, totalBytes: progress.total })
    }
    this.on('download-progress', listener)
    try {
      const returned = await this.downloadUpdate()
      const pending = helper.cacheDirForPendingUpdate
      try {
        need(returned.length === 1, 'Unexpected application download result.')
        const filename = path.join(pending, expected.name)
        need(returned[0] === filename, 'Unexpected application download path.')
        await verifyDownloadedFile(filename, pending, expected)
        return { sizeBytes: expected.sizeBytes }
      } catch (error) {
        // Reuse native pending-cache invalidation so a later explicit retry can
        // download fresh bytes after the same-process cache returned corruption.
        // Unsafe/symlink cache roots are refused and preserved for recovery.
        try {
          await canonicalDirectory(pending)
          await helper.clear()
        } catch {
          // Integrity rejection still wins; no unsafe fallback cleanup.
        }
        throw error
      }
    } finally {
      this.removeListener('download-progress', listener)
    }
  }

  private async prepareDownloadCache(): Promise<DownloadedUpdateHelper> {
    let helper = this.downloadedUpdateHelper
    if (!helper) {
      // electron-updater6.6.2 declares this method private in types, while its
      // compiled method is the actual owner used by executeDownload. Keep this
      // single version-pinned bridge rather than duplicating cache selection.
      const create: unknown = Reflect.get(this, 'getOrCreateDownloadHelper')
      need(typeof create === 'function', 'Application download cache is unavailable.')
      helper = await (create as () => Promise<DownloadedUpdateHelper>).call(this)
      need(helper === this.downloadedUpdateHelper, 'Application cache owner changed.')
    }
    await createCanonicalDirectory(helper.cacheDir)
    await createCanonicalDirectory(helper.cacheDirForPendingUpdate)
    return helper
  }
}

/** Only explicit check/download capabilities escape; installer stays private. */
export function createElectronUpdateChecker(updater: AppUpdater): ApplicationUpdateChecker {
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.autoRunAppAfterInstall = false
  updater.allowPrerelease = false
  updater.allowDowngrade = false
  updater.logger = null
  // AppUpdater emits error as well as rejecting check. The service projects
  // that rejection visibly; EventEmitter must not turn it into process death.
  updater.on('error', () => {})
  return {
    checkForUpdates: () => updater.checkForUpdates(),
    downloadUpdate: async (onProgress: (progress: Progress) => void) => {
      need(updater instanceof VerifiedAppImageUpdater, 'Application download is unavailable.')
      return updater.downloadVerified(onProgress)
    },
  }
}

/** Adapt DownloadedUpdateHelper.hashFile and Studio's existing runtime fd checks. */
async function verifyDownloadedFile(
  filename: string,
  directory: string,
  expected: { sha512: string; sizeBytes: number },
): Promise<void> {
  const root = await canonicalDirectory(directory)
  const before = await fs.lstat(filename, { bigint: true })
  need(
    before.isFile() && !before.isSymbolicLink() && before.size === BigInt(expected.sizeBytes),
    'Application download has an invalid type or size.',
  )
  const handle = await fs.open(filename, fileFlags)
  try {
    need(identity(await handle.stat({ bigint: true })) === identity(before), 'Download changed.')
    const hash = createHash('sha512')
    const chunk = Buffer.allocUnsafe(1024 * 1024)
    let size = 0
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
      if (!bytesRead) {
        break
      }
      size += bytesRead
      need(size <= expected.sizeBytes, 'Application download grew during verification.')
      hash.update(chunk.subarray(0, bytesRead))
    }
    need(
      size === expected.sizeBytes &&
        hash.digest('base64') === expected.sha512 &&
        identity(await handle.stat({ bigint: true })) === identity(before) &&
        identity(await fs.lstat(filename, { bigint: true })) === identity(before) &&
        identity(await canonicalDirectory(directory)) === identity(root),
      'Application download integrity verification failed.',
    )
  } finally {
    await handle.close()
  }
}

async function canonicalDirectory(directory: string): Promise<BigIntStats> {
  need(path.isAbsolute(directory) && path.resolve(directory) === directory, 'Invalid cache path.')
  const info = await fs.lstat(directory, { bigint: true })
  need(
    info.isDirectory() && !info.isSymbolicLink() && (await fs.realpath(directory)) === directory,
    'Invalid application download cache.',
  )
  return info
}

async function createCanonicalDirectory(directory: string): Promise<void> {
  need(path.isAbsolute(directory) && path.resolve(directory) === directory, 'Invalid cache path.')
  let current = path.parse(directory).root
  for (const component of directory.slice(current.length).split(path.sep)) {
    current = path.join(current, component)
    try {
      await fs.mkdir(current, { mode: 0o700 })
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
        throw error
      }
    }
    await canonicalDirectory(current)
  }
}

function need(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}
