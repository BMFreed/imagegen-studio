/**
 * Invoke4875 useInstallActions.ts (AddModelsView/ModelsNotice callers) scopes explicit install
 * intent to its current owner; model_manager.py:946 starts heuristic_import immediately. Invoke has
 * no signed aggregate review token. This path-free Studio DTO adapts the existing Main
 * review/capture boundary; it is neither a release provider nor installation authorization.
 */
export type RuntimeSetupMode = 'install' | 'repair'

export interface RuntimeSetupReview {
  additionalInstalledBytes: number | null
  downloadBytes: number
  installedBytes: number | null
  mode: RuntimeSetupMode
  outpaintInfillReused: boolean
  releaseId: string
  /** Aggregate installation peak remains unknown; the runtime floor is separate. */
  requiredFreeBytes: null
  runtimeRequiredFreeBytes: number
  /** Cached source does not mean the new runtime slot is installed or reusable. */
  runtimeSourceCached: true
  scope: 'engine'
  source: 'verified-local-cache'
  token: string
}

const REVIEW_FIELDS = [
  'additionalInstalledBytes',
  'downloadBytes',
  'installedBytes',
  'mode',
  'outpaintInfillReused',
  'releaseId',
  'requiredFreeBytes',
  'runtimeRequiredFreeBytes',
  'runtimeSourceCached',
  'scope',
  'source',
  'token',
] as const
const REVIEW_FIELD_SET: ReadonlySet<string> = new Set(REVIEW_FIELDS)

export function isRuntimeSetupMode(value: unknown): value is RuntimeSetupMode {
  return value === 'install' || value === 'repair'
}

/** Shape only: Main must match this opaque token to its own current captured review and caller. */
export function isRuntimeSetupToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === 36 &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
  )
}

/** Accept only the public engine projection, never a Main collaborator, plan, path or keyring. */
export function isRuntimeSetupReview(value: unknown): value is RuntimeSetupReview {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false
    }
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      return false
    }
    const keys = Reflect.ownKeys(value)
    if (
      keys.length !== REVIEW_FIELDS.length ||
      keys.some((key) => typeof key !== 'string' || !REVIEW_FIELD_SET.has(key))
    ) {
      return false
    }
    // Snapshot enumerable data fields without executing accessors. Exotic records cannot stand
    // in for a structured-clone DTO, and nonenumerable capabilities must not hide from key checks.
    const review: Record<string, unknown> = {}
    for (const field of REVIEW_FIELDS) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field)
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        return false
      }
      review[field] = descriptor.value
    }
    const installedBytes = review['installedBytes']
    const additionalInstalledBytes = review['additionalInstalledBytes']
    if (
      review['scope'] !== 'engine' ||
      review['source'] !== 'verified-local-cache' ||
      !isRuntimeSetupMode(review['mode']) ||
      !isRuntimeSetupToken(review['token']) ||
      !safeReleaseId(review['releaseId']) ||
      !nonnegativeSafeInteger(review['downloadBytes']) ||
      (installedBytes !== null && !positiveSafeInteger(installedBytes)) ||
      (additionalInstalledBytes !== null && !nonnegativeSafeInteger(additionalInstalledBytes)) ||
      review['requiredFreeBytes'] !== null ||
      !positiveSafeInteger(review['runtimeRequiredFreeBytes']) ||
      review['runtimeSourceCached'] !== true ||
      typeof review['outpaintInfillReused'] !== 'boolean'
    ) {
      return false
    }
    return (
      installedBytes === null ||
      additionalInstalledBytes === null ||
      additionalInstalledBytes <= installedBytes
    )
  } catch {
    return false
  }
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0
}

/** Same identifier domain as the signed manifest, with a full match even at line terminators. */
function safeReleaseId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9][\w.+-]{0,127}$/i.exec(value)?.[0] === value
}
