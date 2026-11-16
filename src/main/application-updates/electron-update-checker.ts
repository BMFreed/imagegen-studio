/**
 * Invoke launcher c267bdb4 updater.ts16–48 and main-process-manager.ts167; exact
 * electron-updater6.6.2 AppImageUpdater/DownloadedUpdateHelper own transfer and cache. Recheck
 * returned files because its same-process cache bypasses hashing.
 */
import type { AppUpdater } from 'electron-updater'
import type { UpdateInfoAndProvider } from 'electron-updater/out/AppUpdater.js'
import type { DownloadedUpdateHelper } from 'electron-updater/out/DownloadedUpdateHelper.js'

import electronUpdater from 'electron-updater'
import { findFile } from 'electron-updater/out/providers/Provider.js'
import { createHash } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'

import type { ApplicationUpdateChecker } from './application-update-service.js'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'
import {
  type ApplicationReleaseAuthority,
  type ApplicationReleaseTrust,
  copyApplicationReleaseAuthority,
  verifyApplicationRelease,
} from './application-release.js'

type Progress = { downloadedBytes: number; totalBytes: number }
const fileFlags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const identity = (s: BigIntStats) => [s.dev, s.ino, s.mode, s.size, s.mtimeNs, s.ctimeNs].join(':')
const maxEnvelopeBytes = 1024 * 1024
/** Main-private capability. Never serialize this file/closure into the renderer snapshot. */
export interface VerifiedApplicationArtifact {
  readonly authority: ApplicationReleaseAuthority
  readonly manifest: Manifest
  readonly path: string
  verifyCompleteSnapshot: () => Promise<void>
}
type Manifest = ReturnType<typeof verifyApplicationRelease>
type FileSnapshot = Readonly<{ file: string; root: string }>
type Descriptor = Readonly<{
  filename: string
  href: string
  sha512: string
  sizeBytes: number
  version: string
}>

type SignedSelection = Readonly<{
  authority: Readonly<ApplicationReleaseAuthority>
  descriptor: Descriptor
  manifest: Manifest
  source: UpdateInfoAndProvider
}>

type VerifiedDownload = {
  sizeBytes: number
  verifiedArtifact?: VerifiedApplicationArtifact
}

/** Native transfer is unchanged. No download completion grants installer authority. */
export class VerifiedAppImageUpdater extends electronUpdater.AppImageUpdater {
  private artifactEpoch = {}
  private authenticatedCheck = false
  private checkOperation: ReturnType<AppUpdater['checkForUpdates']> | null = null
  private downloadOperation: Promise<VerifiedDownload> | null = null
  private readonly releaseTrust: ApplicationReleaseTrust | null
  private signedSelection: SignedSelection | null = null

  constructor(
    options?: ConstructorParameters<typeof electronUpdater.AppImageUpdater>[0],
    app?: ConstructorParameters<typeof electronUpdater.AppImageUpdater>[1],
    trust: ApplicationReleaseTrust | null = null,
  ) {
    super(options, app)
    this.releaseTrust =
      trust === null
        ? null
        : Object.freeze({
            compatibility: Object.freeze({
              ...trust.compatibility,
              databaseMigrations: Object.freeze(
                trust.compatibility.databaseMigrations.map((entry) => Object.freeze({ ...entry })),
              ),
            }),
            trustedKeys: Object.freeze({ ...trust.trustedKeys }),
          })
  }

  override checkForUpdates(): ReturnType<AppUpdater['checkForUpdates']> {
    if (this.checkOperation) {
      return this.checkOperation
    }
    this.artifactEpoch = {}
    this.authenticatedCheck = false
    this.signedSelection = null
    const operation = Promise.resolve()
      .then(() => super.checkForUpdates())
      .then((result) => {
        if (!result?.isUpdateAvailable) {
          this.signedSelection = null
        }
        return result
      })
      .catch((error: unknown) => {
        this.authenticatedCheck = false
        this.signedSelection = null
        throw error
      })
      .finally(() => {
        this.checkOperation = null
      })
    this.checkOperation = operation
    return operation
  }

  downloadVerified(onProgress: (progress: Progress) => void): Promise<VerifiedDownload> {
    if (this.downloadOperation) {
      return this.downloadOperation
    }
    this.artifactEpoch = {}
    const epoch = this.artifactEpoch
    const operation = Promise.resolve()
      .then(() => this.downloadVerifiedOne(onProgress, epoch))
      .finally(() => {
        this.downloadOperation = null
      })
    this.downloadOperation = operation
    return operation
  }

  getVerification(): 'metadata-only' | 'signed-release' {
    return this.authenticatedCheck ? 'signed-release' : 'metadata-only'
  }

  /** Authenticate the actual provider result before native availability/staging evaluation. */
  protected override async getUpdateInfoAndProvider(): Promise<UpdateInfoAndProvider> {
    const source = await super.getUpdateInfoAndProvider()
    this.signedSelection = this.releaseTrust ? this.authenticateSelection(source) : null
    this.authenticatedCheck = this.releaseTrust !== null
    return source
  }

  private assertCurrentSelection(signed: SignedSelection): void {
    need(
      this.signedSelection === signed && this.updateInfoAndProvider === signed.source,
      'Application release selection was retired.',
    )
    const current = this.authenticateSelection(signed.source)
    need(
      current.authority.envelope === signed.authority.envelope &&
        current.authority.releaseNotesJson === signed.authority.releaseNotesJson &&
        Object.keys(signed.descriptor).every(
          (key) =>
            current.descriptor[key as keyof Descriptor] ===
            signed.descriptor[key as keyof Descriptor],
        ),
      'Application release selection changed.',
    )
  }

  private authenticateSelection(source: UpdateInfoAndProvider): SignedSelection {
    need(this.releaseTrust, 'Application release trust is unavailable.')
    const info = source.info as unknown as Record<string, unknown>
    // These native selection policies are not part of the finite signed contract.
    need(
      !['stagingPercentage', 'minimumSystemVersion', 'packages'].some((key) =>
        Object.hasOwn(info, key),
      ),
      'Unsupported signed application release policy.',
    )
    const envelope = info['imagegenStudioRelease']
    need(
      typeof envelope === 'string' &&
        Buffer.byteLength(envelope, 'utf8') > 0 &&
        Buffer.byteLength(envelope, 'utf8') <= maxEnvelopeBytes,
      'A signed application release is required.',
    )
    const descriptor = selectDescriptor(source, true)
    const authority = copyApplicationReleaseAuthority({
      envelope,
      releaseNotesJson: canonicalRuntimeReleaseJson(source.info.releaseNotes ?? null).toString(
        'utf8',
      ),
    })
    const manifest = verifyApplicationRelease(
      Buffer.from(authority.envelope, 'utf8'),
      this.releaseTrust,
      {
        filename: descriptor.filename,
        sha512: descriptor.sha512,
        sizeBytes: descriptor.sizeBytes,
        version: descriptor.version,
      },
      JSON.parse(authority.releaseNotesJson),
    )
    return Object.freeze({ authority, descriptor, manifest, source })
  }

  private async downloadVerifiedOne(
    onProgress: (progress: Progress) => void,
    epoch: object,
  ): Promise<VerifiedDownload> {
    const source = this.updateInfoAndProvider
    need(source, 'No current application update is available.')
    const selected = selectDescriptor(source)
    const { filename: name, sha512, sizeBytes } = selected
    const signed = this.signedSelection
    if (this.releaseTrust) {
      need(signed, 'A signed application release check is required.')
      this.assertCurrentSelection(signed)
    }
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
        const snapshot = await verifyDownloadedFile(filename, pending, expected)
        need(this.artifactEpoch === epoch, 'Application download was retired.')
        if (!signed) {
          return { sizeBytes: expected.sizeBytes }
        }
        this.assertCurrentSelection(signed)
        const artifact: VerifiedApplicationArtifact = Object.freeze({
          authority: signed.authority,
          manifest: signed.manifest,
          path: filename,
          verifyCompleteSnapshot: async () => {
            try {
              need(this.artifactEpoch === epoch, 'Application artifact was retired.')
              need(
                artifact.authority === signed.authority && Object.isFrozen(artifact.authority),
                'Application release authority changed.',
              )
              this.assertCurrentSelection(signed)
              await verifyDownloadedFile(filename, pending, expected, snapshot)
              need(this.artifactEpoch === epoch, 'Application artifact was retired.')
              need(
                artifact.authority === signed.authority && Object.isFrozen(artifact.authority),
                'Application release authority changed.',
              )
              this.assertCurrentSelection(signed)
            } catch (error) {
              if (this.artifactEpoch === epoch) {
                this.artifactEpoch = {}
              }
              throw error
            }
          },
        })
        return { sizeBytes: expected.sizeBytes, verifiedArtifact: artifact }
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
    checkForUpdates: async () => {
      const result = await updater.checkForUpdates()
      return result === null
        ? null
        : {
            ...result,
            verification:
              updater instanceof VerifiedAppImageUpdater
                ? updater.getVerification()
                : 'metadata-only',
          }
    },
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
  original?: FileSnapshot,
): Promise<FileSnapshot> {
  const root = await canonicalDirectory(directory)
  const before = await fs.lstat(filename, { bigint: true })
  need(
    before.isFile() && !before.isSymbolicLink() && before.size === BigInt(expected.sizeBytes),
    'Application download has an invalid type or size.',
  )
  need(
    !original || (identity(before) === original.file && identity(root) === original.root),
    'Application download snapshot changed.',
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
    return Object.freeze({ file: identity(before), root: identity(root) })
  } finally {
    await handle.close()
  }
}

function selectDescriptor(source: UpdateInfoAndProvider, signedPolicy = false): Descriptor {
  const files = source.provider.resolveFiles(source.info)
  const selected = findFile(files, 'AppImage', ['rpm', 'deb', 'pacman'])
  const candidates = files.filter((file) => file.url.pathname.endsWith('.AppImage'))
  need(
    selected && candidates.length === 1 && candidates[0] === selected,
    'A single AppImage descriptor is required.',
  )
  // This auxiliary range/buffer input is not signed by the finite release profile.
  // Keep legacy native differential behavior and its disable flag unchanged.
  need(
    !signedPolicy || !Object.hasOwn(selected.info, 'blockMapSize'),
    'Unsupported signed application release policy.',
  )
  const filename = path.basename(decodeURIComponent(selected.url.pathname))
  const sha512 = selected.info.sha512
  const sizeBytes = selected.info.size
  need(
    filename.endsWith('.AppImage') &&
      !filename.includes('\\') &&
      !filename.includes('\0') &&
      typeof sha512 === 'string' &&
      Buffer.from(sha512, 'base64').length === 64 &&
      Buffer.from(sha512, 'base64').toString('base64') === sha512 &&
      typeof sizeBytes === 'number' &&
      Number.isSafeInteger(sizeBytes) &&
      sizeBytes > 0,
    'Invalid AppImage integrity descriptor.',
  )
  return Object.freeze({
    filename,
    href: selected.url.href,
    sha512,
    sizeBytes,
    version: source.info.version,
  })
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
