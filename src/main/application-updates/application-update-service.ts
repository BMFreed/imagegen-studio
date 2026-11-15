/**
 * Invoke launcher c267bdb4 updater.ts7/16 -> main-process-manager.ts167; electron-updater6.6.2
 * AppUpdater.checkForUpdates owns provider/semver/coalescing. Adapt only its result to Studio's
 * current-frame public snapshot. No download, resource/Project mutation or close/installer
 * authority belongs to this owner.
 */
import {
  APPLICATION_UPDATE_NOTES_MAX_LENGTH,
  type ApplicationUpdateSnapshot,
  isApplicationUpdateSnapshot,
  isApplicationUpdateVersion,
} from '../../shared/application-updates.js'

export interface ApplicationUpdateCheckResult {
  isUpdateAvailable: boolean
  updateInfo: {
    releaseNotes?: string | { note: string | null; version: string }[] | null
    version: string
  }
}

export interface ApplicationUpdateChecker {
  checkForUpdates: () => Promise<ApplicationUpdateCheckResult | null>
}

export class ApplicationUpdateService {
  private checker: ApplicationUpdateChecker | null = null
  private pending: Promise<ApplicationUpdateSnapshot> | null = null
  private snapshot: ApplicationUpdateSnapshot

  constructor(
    private readonly currentVersion: string,
    private readonly configured: boolean,
    private readonly createChecker: () => ApplicationUpdateChecker,
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
    if (this.pending) {
      return structuredClone(await this.pending)
    }
    this.snapshot = this.empty('checking')
    // Store the complete projection promise before a synchronous factory/check
    // failure can settle. Native AppUpdater retains its own check coalescing.
    const operation = Promise.resolve()
      .then(async () => {
        this.checker ??= this.createChecker()
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
          ...notes,
          status: 'available',
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
        this.pending = null
      })
    this.pending = operation
    return structuredClone(await operation)
  }

  getStatus(): ApplicationUpdateSnapshot {
    return structuredClone(this.snapshot)
  }

  private empty(status: ApplicationUpdateSnapshot['status']): ApplicationUpdateSnapshot {
    return {
      availableVersion: null,
      currentVersion: this.currentVersion,
      notesTruncated: false,
      releaseNotes: null,
      status,
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
