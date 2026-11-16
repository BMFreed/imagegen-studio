/**
 * Invoke launcher c267bdb4 updater.ts7/16 -> main-process-manager.ts167; electron-updater6.6.2
 * AppUpdater.checkForUpdates/downloadUpdate own provider/semver/transfer/cache. The native adapter
 * verifies returned cache bytes; this owner binds an explicit Download to the latest available
 * check. Native AppUpdater retains old metadata after no-update/errors, so that internal state
 * alone must never authorize a download. No public close/installer authority escapes.
 */
import {
  APPLICATION_UPDATE_NOTES_MAX_LENGTH,
  type ApplicationUpdateInstallPreview,
  type ApplicationUpdateSnapshot,
  isApplicationUpdateInstallPreview,
  isApplicationUpdateSnapshot,
  isApplicationUpdateVersion,
} from '../../shared/application-updates.js'

import type { VerifiedApplicationArtifact } from './electron-update-checker.js'

import {
  type ActivatedApplicationUpdate,
  type ApplicationUpdateCurrentSource,
  type ApplicationUpdateStartupInspection,
  type BackedUpApplicationUpdate,
  inspectRetainedApplicationUpdate,
  type StagedApplicationUpdate,
  stageVerifiedApplicationArtifact,
} from './application-update-staging.js'

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

type ServiceBackedUpUpdate = Omit<BackedUpApplicationUpdate, 'activate'> & {
  activate: () => Promise<ActivatedApplicationUpdate>
}

type ServiceStagedUpdate = Omit<StagedApplicationUpdate, 'prepareBackup'> & {
  prepareBackup: () => Promise<ServiceBackedUpUpdate>
}

/** Fixed public refusal: retaining update recovery data never requires closing Projects. */
export class ApplicationUpdateRecoveryRequiredError extends Error {
  readonly code = 'APPLICATION_UPDATE_RECOVERY_REQUIRED'

  constructor() {
    super('Application update recovery is required before installation. Your Projects remain open.')
    this.name = 'ApplicationUpdateRecoveryRequiredError'
  }
}

/** Pre-close refusal only; no update failure may implicitly close an open Project. */
export class ApplicationUpdateCurrentSourceError extends Error {
  readonly code = 'APPLICATION_UPDATE_CURRENT_SOURCE_UNAVAILABLE'

  constructor() {
    super(
      'The application changed or could not be checked. Restart ImageGen Studio before installing an update. Your Projects remain open.',
    )
    this.name = 'ApplicationUpdateCurrentSourceError'
  }
}

export class ApplicationUpdateService {
  private checker: ApplicationUpdateChecker | null = null
  private pendingCheck: Promise<ApplicationUpdateSnapshot> | null = null
  private pendingDownload: {
    epoch: object
    promise: Promise<ApplicationUpdateSnapshot>
    version: string
  } | null = null
  private readonly retainedAtStartup: boolean
  private snapshot: ApplicationUpdateSnapshot
  private verifiedArtifact: VerifiedApplicationArtifact | null = null

  constructor(
    private readonly currentVersion: string,
    private readonly configured: boolean,
    private readonly createChecker: () =>
      ApplicationUpdateChecker | Promise<ApplicationUpdateChecker>,
    private readonly currentAppImage: string | null = null,
    private readonly assertApplicationClosed: (() => void) | null = null,
    private readonly readInstallImpact:
      | (() => Promise<
          Omit<ApplicationUpdateInstallPreview, 'availableVersion' | 'installationAvailable'>
        >)
      | null = null,
    private readonly scheduleApplicationRelaunch:
      ((currentAppImage: string) => unknown) | null = null,
    startupInspection: ApplicationUpdateStartupInspection = { status: 'none' },
    private readonly currentSource: ApplicationUpdateCurrentSource | null = null,
  ) {
    if (!isApplicationUpdateVersion(currentVersion)) {
      throw new Error('Invalid application version.')
    }
    this.retainedAtStartup = startupInspection.status === 'retained'
    this.snapshot = this.empty(configured ? 'idle' : 'unavailable')
  }

  /** Main calls this after its final document/close checks, with no await before normal close. */
  assertCurrentSourceSnapshot(): void {
    try {
      if (!this.currentSource || this.currentSource.currentAppImage !== this.currentAppImage) {
        throw new Error('Current application sources are unavailable.')
      }
      const result: unknown = this.currentSource.assertCurrentSnapshot()
      if (result !== undefined) {
        if (result instanceof Promise) {
          void result.catch(() => undefined)
        }
        throw new Error('The current-source assertion must be synchronous.')
      }
    } catch {
      throw new ApplicationUpdateCurrentSourceError()
    }
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

  /** Main-private consumer after irreversible close; caller must seal the normal exit path. */
  async installAfterClose(
    expectedVersion: string,
    expectedArtifact?: VerifiedApplicationArtifact,
  ): Promise<void> {
    if (!this.assertApplicationClosed || !this.scheduleApplicationRelaunch) {
      throw new Error('Application update restart is unavailable.')
    }
    this.assertClosedForInstallation()
    const staged = await this.stageForInstallation(expectedVersion, expectedArtifact)
    const backed = await staged.prepareBackup()
    const active = await backed.activate()
    await active.handoffRelaunch((currentAppImage) => {
      this.assertClosedForInstallation()
      return this.scheduleApplicationRelaunch!(currentAppImage)
    })
  }

  /** Read-only pre-close eligibility. The exact capability must be rebound after normal close. */
  async prepareInstallation(expectedVersion: string): Promise<VerifiedApplicationArtifact> {
    await this.assertNoRetainedInstallation()
    await this.verifyCurrentSource()
    if (
      !this.currentAppImage ||
      !this.assertApplicationClosed ||
      !this.scheduleApplicationRelaunch
    ) {
      throw new Error('Application update installation is unavailable.')
    }
    const artifact = await this.prepareVerifiedArtifact(expectedVersion)
    await this.verifyCurrentSource()
    return artifact
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

  /** Advisory inspection only: never prepares a binary, starts close or grants install authority. */
  async reviewInstallation(expectedVersion: string): Promise<ApplicationUpdateInstallPreview> {
    await this.assertNoRetainedInstallation()
    await this.verifyCurrentSource()
    if (!this.readInstallImpact) {
      throw new Error('Application update preview is unavailable.')
    }
    const artifact = await this.prepareVerifiedArtifact(expectedVersion)
    await this.verifyCurrentSource()
    const impact = await this.readInstallImpact()
    await this.verifyCurrentSource()
    if ((await this.prepareVerifiedArtifact(expectedVersion)) !== artifact) {
      throw new Error('The application release selection changed.')
    }
    await this.verifyCurrentSource()
    const preview = {
      ...impact,
      availableVersion: expectedVersion,
      installationAvailable: !!(
        this.currentAppImage &&
        this.assertApplicationClosed &&
        this.scheduleApplicationRelaunch
      ),
    }
    if (!isApplicationUpdateInstallPreview(preview)) {
      throw new Error('Invalid application update preview.')
    }
    return Object.freeze(preview)
  }

  /** Main-private explicit preparation; Download/status never stage or replace the app. */
  async stageForInstallation(
    expectedVersion: string,
    expectedArtifact?: VerifiedApplicationArtifact,
  ): Promise<ServiceStagedUpdate> {
    if (this.currentAppImage === null) {
      throw new Error('Application update staging is unavailable.')
    }
    let currentSource: ApplicationUpdateCurrentSource
    try {
      currentSource = await this.verifyCurrentSource()
    } catch {
      // This private path is also reached after irreversible close. Its diagnostic must never
      // claim that Projects remain open or invite a return to disposed editing state.
      throw new Error('The current application sources are unavailable for update staging.')
    }
    const artifact = await this.prepareVerifiedArtifact(expectedVersion)
    if (expectedArtifact && artifact !== expectedArtifact) {
      throw new Error('The application release selection changed after close was requested.')
    }
    const staged = await stageVerifiedApplicationArtifact({
      artifact,
      currentAppImage: this.currentAppImage,
      currentSource,
    })
    await this.prepareVerifiedArtifact(expectedVersion)
    const assertSelection = () => {
      if (
        this.verifiedArtifact !== artifact ||
        this.pendingCheck ||
        this.pendingDownload ||
        this.snapshot.status !== 'downloaded' ||
        this.snapshot.availableVersion !== expectedVersion ||
        this.snapshot.verification !== 'signed-release'
      ) {
        throw new Error('The application release selection changed.')
      }
    }
    const verifyAuthority = async () => {
      if ((await this.prepareVerifiedArtifact(expectedVersion)) !== artifact) {
        throw new Error('The application release selection changed.')
      }
    }
    const plan: ServiceStagedUpdate = Object.freeze({
      ...staged,
      prepareBackup: async () => {
        await verifyAuthority()
        const backup = await staged.prepareBackup()
        assertSelection()
        return Object.freeze({
          ...backup,
          activate: async () => {
            if (this.assertApplicationClosed === null) {
              throw new Error('Application update activation is unavailable.')
            }
            await verifyAuthority()
            // Main supplies this guard; no caller-provided assertion can bypass it.
            // Rollback after publication belongs to the returned filesystem capability.
            return await backup.activate(() => {
              assertSelection()
              this.assertClosedForInstallation()
            })
          },
          verifyCompleteSnapshot: async () => {
            await verifyAuthority()
            await backup.verifyCompleteSnapshot()
            assertSelection()
          },
        })
      },
      verifyCompleteSnapshot: async () => {
        await verifyAuthority()
        await staged.verifyCompleteSnapshot()
        assertSelection()
      },
    })
    await plan.verifyCompleteSnapshot()
    return plan
  }

  private assertClosedForInstallation(): void {
    if (!this.assertApplicationClosed) {
      throw new Error('The application close barrier is unavailable.')
    }
    const result: unknown = this.assertApplicationClosed()
    if (result !== undefined) {
      if (result instanceof Promise) {
        void result.catch(() => undefined)
      }
      throw new Error('The application close assertion must be synchronous.')
    }
  }

  private async assertNoRetainedInstallation(): Promise<void> {
    if (this.retainedAtStartup) {
      throw new ApplicationUpdateRecoveryRequiredError()
    }
    if (!this.currentAppImage) {
      return
    }
    // Reuse the staging owner's read-only admission check to catch claims appearing after
    // startup. No trust is needed to preserve any retained stage; this does not hash the target.
    let inspection: ApplicationUpdateStartupInspection
    try {
      inspection = await inspectRetainedApplicationUpdate({
        currentAppImage: this.currentAppImage,
        currentVersion: this.currentVersion,
        readTrust: async () => null,
      })
    } catch {
      throw new ApplicationUpdateRecoveryRequiredError()
    }
    if (inspection.status === 'retained') {
      throw new ApplicationUpdateRecoveryRequiredError()
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

  private async verifyCurrentSource(): Promise<ApplicationUpdateCurrentSource> {
    try {
      this.assertCurrentSourceSnapshot()
      const source = this.currentSource!
      await source.verifyCompleteSnapshot()
      this.assertCurrentSourceSnapshot()
      return source
    } catch {
      throw new ApplicationUpdateCurrentSourceError()
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
