/**
 * Invoke launcher c267bdb4 updater.ts7/16 -> main-process-manager.ts167; electron-updater6.6.2
 * AppUpdater.checkForUpdates/downloadUpdate own provider/semver/transfer/cache. The native adapter
 * verifies returned cache bytes; this owner binds an explicit Download to the latest available
 * check. Native AppUpdater retains old metadata after no-update/errors, so that internal state
 * alone must never authorize a download. No close/installer authority escapes.
 */
import {
  APPLICATION_UPDATE_NOTES_MAX_LENGTH,
  type ApplicationUpdateSnapshot,
  isApplicationUpdateSnapshot,
  isApplicationUpdateVersion,
} from '../../shared/application-updates.js'

import type { VerifiedApplicationArtifact } from './electron-update-checker.js'

export interface ApplicationUpdateCheckResult {
  isUpdateAvailable: boolean
  updateInfo: {
    releaseNotes?: string | { note: string | null; version: string }[] | null
    version: string
  }
  verification?: 'metadata-only' | 'signed-release'
}

export interface ApplicationUpdateChecker {
  checkForUpdates: () => Promise<ApplicationUpdateCheckResult | null>
  downloadUpdate?: (
    onProgress: (progress: { downloadedBytes: number; totalBytes: number }) => void,
  ) => Promise<{ sizeBytes: number; verifiedArtifact?: VerifiedApplicationArtifact }>
}

export class ApplicationUpdateService {
  private checker: ApplicationUpdateChecker | null = null
  private pendingCheck: Promise<ApplicationUpdateSnapshot> | null = null
  private pendingDownload: {
    epoch: object
    promise: Promise<ApplicationUpdateSnapshot>
    version: string
  } | null = null
  private snapshot: ApplicationUpdateSnapshot
  private verifiedArtifact: VerifiedApplicationArtifact | null = null

  constructor(
    private readonly currentVersion: string,
    private readonly configured: boolean,
    private readonly createChecker: () =>
      ApplicationUpdateChecker | Promise<ApplicationUpdateChecker>,
  ) {
    if (!isApplicationUpdateVersion(currentVersion)) {
      throw new Error('Invalid application version.')
    }
    this.snapshot = this.empty(configured ? 'idle' : 'unavailable')
  }

  async check(): Promise<ApplicationUpdateSnapshot> {
    if (!this.configured) {
      return this.getStatus()
    }
    if (this.pendingDownload) {
      return this.getStatus()
    }
    if (this.pendingCheck) {
      return structuredClone(await this.pendingCheck)
    }
    this.snapshot = this.empty('checking')
    this.verifiedArtifact = null
    // Store the complete projection promise before a synchronous factory/check
    // failure can settle. Native AppUpdater retains its own check coalescing.
    const operation = Promise.resolve()
      .then(async () => {
        this.checker ??= await this.createChecker()
        const result = await this.checker.checkForUpdates()
        if (
          !result ||
          typeof result.isUpdateAvailable !== 'boolean' ||
          !isApplicationUpdateVersion(result.updateInfo.version)
        ) {
          throw new Error('Invalid application update result.')
        }
        if (!result.isUpdateAvailable) {
          return this.empty('up-to-date')
        }
        const notes = projectNotes(result.updateInfo.releaseNotes)
        const snapshot: ApplicationUpdateSnapshot = {
          availableVersion: result.updateInfo.version,
          currentVersion: this.currentVersion,
          downloadedBytes: null,
          ...notes,
          status: 'available',
          totalBytes: null,
          verification: result.verification ?? 'metadata-only',
        }
        if (!isApplicationUpdateSnapshot(snapshot)) {
          throw new Error('Invalid application update projection.')
        }
        return snapshot
      })
      .catch(() => this.empty('error'))
      .then((snapshot) => {
        this.snapshot = snapshot
        return this.getStatus()
      })
      .finally(() => {
        this.pendingCheck = null
      })
    this.pendingCheck = operation
    return structuredClone(await operation)
  }

  async download(expectedVersion: string): Promise<ApplicationUpdateSnapshot> {
    if (!this.configured || this.pendingCheck) {
      return this.getStatus()
    }
    if (this.pendingDownload) {
      return expectedVersion === this.pendingDownload.version
        ? structuredClone(await this.pendingDownload.promise)
        : this.getStatus()
    }
    if (
      !isApplicationUpdateVersion(expectedVersion) ||
      expectedVersion !== this.snapshot.availableVersion ||
      !['available', 'download-error', 'downloaded'].includes(this.snapshot.status)
    ) {
      return this.getStatus()
    }

    const selected = this.getStatus()
    this.verifiedArtifact = null
    const epoch = {}
    this.snapshot = {
      ...selected,
      downloadedBytes: null,
      status: 'downloading',
      totalBytes: null,
    }
    // Store the complete operation before entering even a synchronous native
    // failure. Status reads and repeated checks never initiate transfer.
    const operation = Promise.resolve()
      .then(async (): Promise<ApplicationUpdateSnapshot> => {
        if (!this.checker?.downloadUpdate) {
          throw new Error('Application download is unavailable.')
        }
        const result = await this.checker.downloadUpdate((progress) => {
          if (
            this.pendingDownload?.epoch !== epoch ||
            this.snapshot.status !== 'downloading' ||
            !progress ||
            !Number.isSafeInteger(progress.downloadedBytes) ||
            !Number.isSafeInteger(progress.totalBytes) ||
            progress.totalBytes <= 0 ||
            progress.downloadedBytes < 0 ||
            progress.downloadedBytes > progress.totalBytes
          ) {
            return
          }
          this.snapshot = {
            ...this.snapshot,
            downloadedBytes: progress.downloadedBytes,
            totalBytes: progress.totalBytes,
          }
        })
        if (!result || !Number.isSafeInteger(result.sizeBytes) || result.sizeBytes <= 0) {
          throw new Error('Invalid application download result.')
        }
        if (selected.verification === 'signed-release') {
          const artifact = result.verifiedArtifact
          if (
            !artifact ||
            artifact.manifest.version !== selected.availableVersion ||
            artifact.manifest.artifact.sizeBytes !== result.sizeBytes
          ) {
            throw new Error('The application release artifact is not verified.')
          }
          await artifact.verifyCompleteSnapshot()
          this.verifiedArtifact = artifact
        }
        return {
          ...selected,
          downloadedBytes: result.sizeBytes,
          status: 'downloaded',
          totalBytes: result.sizeBytes,
        }
      })
      .catch((): ApplicationUpdateSnapshot => ({
        ...selected,
        downloadedBytes: null,
        status: 'download-error',
        totalBytes: null,
      }))
      .then((snapshot) => {
        this.snapshot = snapshot
        return this.getStatus()
      })
      .finally(() => {
        this.pendingDownload = null
      })
    this.pendingDownload = { epoch, promise: operation, version: expectedVersion }
    return structuredClone(await operation)
  }

  getStatus(): ApplicationUpdateSnapshot {
    return structuredClone(this.snapshot)
  }

  /** Main-private gate; public downloaded snapshots never grant installer authority. */
  async prepareVerifiedArtifact(expectedVersion: string): Promise<VerifiedApplicationArtifact> {
    const artifact = this.verifiedArtifact
    const current = () =>
      artifact !== null &&
      artifact === this.verifiedArtifact &&
      !this.pendingCheck &&
      !this.pendingDownload &&
      this.snapshot.status === 'downloaded' &&
      this.snapshot.verification === 'signed-release' &&
      this.snapshot.availableVersion === expectedVersion &&
      artifact.manifest.version === expectedVersion
    if (!current() || !artifact) {
      throw new Error('Download and verify the application release again before installation.')
    }
    try {
      await artifact.verifyCompleteSnapshot()
      if (!current()) {
        throw new Error('The application release selection changed.')
      }
      return artifact
    } catch {
      if (this.verifiedArtifact === artifact) {
        this.verifiedArtifact = null
        this.snapshot = {
          ...this.snapshot,
          downloadedBytes: null,
          status: 'download-error',
          totalBytes: null,
        }
      }
      throw new Error('The application release must be downloaded and verified again.')
    }
  }

  private empty(status: ApplicationUpdateSnapshot['status']): ApplicationUpdateSnapshot {
    return {
      availableVersion: null,
      currentVersion: this.currentVersion,
      downloadedBytes: null,
      notesTruncated: false,
      releaseNotes: null,
      status,
      totalBytes: null,
      verification: null,
    }
  }
}

function projectNotes(
  notes: ApplicationUpdateCheckResult['updateInfo']['releaseNotes'],
): Pick<ApplicationUpdateSnapshot, 'notesTruncated' | 'releaseNotes'> {
  let text: string
  if (notes === null || notes === undefined) {
    return { notesTruncated: false, releaseNotes: null }
  }
  if (typeof notes === 'string') {
    text = notes
  } else if (Array.isArray(notes)) {
    text = notes
      .map((entry) => {
        if (
          !entry ||
          !isApplicationUpdateVersion(entry.version) ||
          (entry.note !== null && typeof entry.note !== 'string')
        ) {
          throw new Error('Invalid release notes.')
        }
        return entry.note === null ? entry.version : `${entry.version}\n${entry.note}`
      })
      .join('\n\n')
  } else {
    throw new TypeError('Invalid release notes.')
  }
  if (text.length === 0) {
    return { notesTruncated: false, releaseNotes: null }
  }
  if (text.length <= APPLICATION_UPDATE_NOTES_MAX_LENGTH) {
    return { notesTruncated: false, releaseNotes: text }
  }
  let end = APPLICATION_UPDATE_NOTES_MAX_LENGTH
  const last = text.charCodeAt(end - 1)
  if (last >= 0xd8_00 && last <= 0xdb_ff) {
    end -= 1
  }
  return { notesTruncated: true, releaseNotes: text.slice(0, end) }
}
