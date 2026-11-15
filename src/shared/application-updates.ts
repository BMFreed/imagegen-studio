/**
 * Invoke launcher c267bdb439519216b277a7a8c6ad408b9d79efce, updater.ts7/16 and
 * main-process-manager.ts167: adapt explicit check/download to a bounded Studio DTO. This
 * projection exposes no feed, downloaded file, installer or restart authority.
 */
export const APPLICATION_UPDATE_STATUSES = [
  'idle',
  'checking',
  'unavailable',
  'up-to-date',
  'available',
  'downloading',
  'downloaded',
  'download-error',
  'error',
] as const

export const APPLICATION_UPDATE_VERSION_MAX_LENGTH = 128
export const APPLICATION_UPDATE_NOTES_MAX_LENGTH = 16_000

export type ApplicationUpdateStatus = (typeof APPLICATION_UPDATE_STATUSES)[number]

export interface ApplicationUpdateSnapshot {
  availableVersion: string | null
  currentVersion: string
  downloadedBytes: number | null
  notesTruncated: boolean
  releaseNotes: string | null
  status: ApplicationUpdateStatus
  totalBytes: number | null
}

const STATUS_VALUES: ReadonlySet<string> = new Set(APPLICATION_UPDATE_STATUSES)
const FIELDS = [
  'availableVersion',
  'currentVersion',
  'downloadedBytes',
  'notesTruncated',
  'releaseNotes',
  'status',
  'totalBytes',
] as const
const numeric = String.raw`(?:0|[1-9]\d*)`
const prerelease = String.raw`(?:0|[1-9]\d*|\d*[a-z-][\da-z-]*)`
const versionPattern = new RegExp(
  String.raw`^${numeric}\.${numeric}\.${numeric}(?:-${prerelease}(?:\.${prerelease})*)?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$`,
  'i',
)

/** SemVer labels only, never source URLs or local paths. No comparison/admission is inferred. */
export function isApplicationUpdateVersion(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= APPLICATION_UPDATE_VERSION_MAX_LENGTH &&
    versionPattern.exec(value)?.[0] === value
  )
}

/** Exact plain data boundary; reflection failures and accessors are refused without reading them. */
export function isApplicationUpdateSnapshot(value: unknown): value is ApplicationUpdateSnapshot {
  try {
    const snapshot = dataRecord(value)
    if (
      !snapshot ||
      !isApplicationUpdateVersion(snapshot['currentVersion']) ||
      typeof snapshot['status'] !== 'string' ||
      !STATUS_VALUES.has(snapshot['status']) ||
      typeof snapshot['notesTruncated'] !== 'boolean'
    ) {
      return false
    }
    const status = snapshot['status']
    const downloaded = snapshot['downloadedBytes']
    const total = snapshot['totalBytes']
    if (status === 'downloading') {
      if (
        !(downloaded === null && total === null) &&
        !(
          typeof downloaded === 'number' &&
          Number.isSafeInteger(downloaded) &&
          downloaded >= 0 &&
          typeof total === 'number' &&
          Number.isSafeInteger(total) &&
          total > 0 &&
          downloaded <= total
        )
      ) {
        return false
      }
    } else if (status === 'downloaded') {
      if (
        typeof total !== 'number' ||
        !Number.isSafeInteger(total) ||
        total <= 0 ||
        downloaded !== total
      ) {
        return false
      }
    } else if (downloaded !== null || total !== null) {
      return false
    }
    if (!['available', 'download-error', 'downloaded', 'downloading'].includes(status)) {
      return (
        snapshot['availableVersion'] === null &&
        snapshot['releaseNotes'] === null &&
        snapshot['notesTruncated'] === false
      )
    }
    if (
      !isApplicationUpdateVersion(snapshot['availableVersion']) ||
      snapshot['availableVersion'] === snapshot['currentVersion']
    ) {
      return false
    }
    if (snapshot['releaseNotes'] === null) {
      return snapshot['notesTruncated'] === false
    }
    return (
      typeof snapshot['releaseNotes'] === 'string' &&
      snapshot['releaseNotes'].length <= APPLICATION_UPDATE_NOTES_MAX_LENGTH
    )
  } catch {
    return false
  }
}

function dataRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    return null
  }
  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== FIELDS.length ||
    keys.some((key) => typeof key !== 'string' || !FIELDS.includes(key as (typeof FIELDS)[number]))
  ) {
    return null
  }
  const record: Record<string, unknown> = {}
  for (const key of FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      return null
    }
    record[key] = descriptor.value
  }
  return record
}
