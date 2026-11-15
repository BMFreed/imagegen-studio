/**
 * Invoke4875 download_default.py598/783/822 separates byte telemetry from terminal settlement;
 * model_install_default.py1267 and useInstallJobActions.ts81 cancel only the current owned job.
 * This path-free projection adapts those events to Studio's existing runtime operation owner. Its
 * operation identity is the consumed review token, not another source of authority.
 */
import { isRuntimeSetupMode, isRuntimeSetupToken, type RuntimeSetupMode } from './runtime-setup.js'

export const RUNTIME_SETUP_PROGRESS_STAGES = [
  'preparing',
  'preparing-runtime',
  'downloading-runtime',
  'extracting-runtime',
  'installing-outpaint',
  'copying-runtime',
  'assembling-runtime',
  'verifying-runtime',
  'checking-runtime',
  'checking-activation',
  'finalizing',
] as const

export const RUNTIME_SETUP_PROGRESS_STATES = [
  'running',
  'cancelling',
  'succeeded',
  'canceled',
  'failed',
  'recovery-required',
] as const

export type RuntimeSetupProgressStage = (typeof RUNTIME_SETUP_PROGRESS_STAGES)[number]
export type RuntimeSetupProgressState = (typeof RUNTIME_SETUP_PROGRESS_STATES)[number]

export interface RuntimeSetupProgress {
  bytesDownloaded: number | null
  bytesTotal: number | null
  mode: RuntimeSetupMode
  operationId: string
  stage: RuntimeSetupProgressStage
  state: RuntimeSetupProgressState
}

/** Transient Main snapshot, not a durable receipt, installation result or aggregate percentage. */
export interface RuntimeSetupProgressSnapshot {
  operation: RuntimeSetupProgress | null
  revision: number
}

const STAGES: ReadonlySet<string> = new Set(RUNTIME_SETUP_PROGRESS_STAGES)
const STATES: ReadonlySet<string> = new Set(RUNTIME_SETUP_PROGRESS_STATES)
const SNAPSHOT_FIELDS = ['operation', 'revision'] as const
const OPERATION_FIELDS = [
  'bytesDownloaded',
  'bytesTotal',
  'mode',
  'operationId',
  'stage',
  'state',
] as const

/** Strict public telemetry shape. It never validates install/cancel authority or runtime readiness. */
export function isRuntimeSetupProgressSnapshot(
  value: unknown,
): value is RuntimeSetupProgressSnapshot {
  try {
    const snapshot = dataRecord(value, SNAPSHOT_FIELDS)
    if (!snapshot || !nonnegativeSafeInteger(snapshot['revision'])) {
      return false
    }
    if (snapshot['operation'] === null) {
      return true
    }
    const operation = dataRecord(snapshot['operation'], OPERATION_FIELDS)
    if (
      !operation ||
      !isRuntimeSetupMode(operation['mode']) ||
      !isRuntimeSetupToken(operation['operationId']) ||
      typeof operation['stage'] !== 'string' ||
      !STAGES.has(operation['stage']) ||
      typeof operation['state'] !== 'string' ||
      !STATES.has(operation['state'])
    ) {
      return false
    }
    const downloaded = operation['bytesDownloaded']
    const total = operation['bytesTotal']
    if (downloaded === null && total === null) {
      return true
    }
    return (
      (operation['state'] === 'running' || operation['state'] === 'cancelling') &&
      (operation['stage'] === 'downloading-runtime' ||
        operation['stage'] === 'installing-outpaint') &&
      nonnegativeSafeInteger(downloaded) &&
      nonnegativeSafeInteger(total) &&
      total > 0 &&
      downloaded <= total
    )
  } catch {
    return false
  }
}

function dataRecord(value: unknown, fields: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    return null
  }
  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== 'string' || !fields.includes(key))
  ) {
    return null
  }
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field)
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      return null
    }
    result[field] = descriptor.value
  }
  return result
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
