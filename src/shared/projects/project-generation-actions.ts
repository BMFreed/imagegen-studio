import * as v from 'valibot'

import { GENERATION_BATCH_JOB_LIMIT } from './generation-batch-policy.js'
import { IGS_SAFETY_CEILINGS } from './project-schema.js'

export interface ProjectGenerationQueueJob {
  batchId: string
  createdAt: string
  id: string
  prompt: string
  seed: number
  status: 'pending' | 'running'
  statusSequence: number
}

export interface ProjectGenerationActionState {
  /** Explicit worker 0.12+ support; absence must not enable mixed-alpha generation. */
  animaOutpaintSupported?: boolean
  /** Absent in older responses; never treat absence as native Anima support. */
  animaSupported?: boolean
  /** Advisory only; Main rechecks the actual worker at admission and dispatch. */
  cfgRescaleSupported: boolean
  documentId: string
  embeddingsSupported: boolean
  error: { code: string; message: string } | null
  externalVaeSupported: boolean
  img2imgSupported: boolean
  jobs: ProjectGenerationQueueJob[]
  /** Worker capability only. Main verifies the exact local LaMa resource on admission. */
  outpaintSupported?: boolean
  /** Engine admission/dispatch is app-wide; jobs and current cancellation are document-scoped. */
  phase: 'blocked' | 'closed' | 'idle' | 'preparing' | 'processing'
  /** Explicit finite Regional Guidance support; older responses must remain unavailable. */
  regionalSupported?: boolean
  runningJobId: string | null
  smartPatchSupported?: boolean
  vaePrecisionSupported: boolean
}

export interface ProjectGenerateOptions {
  confirmation?: { candidateIds: string[]; unfinishedJobIds: string[] }
  documentId: string
  iterations: number
}

export type ProjectGenerateResult =
  | {
      batchId: string
      documentId: string
      jobIds: string[]
      kind: 'queued'
      truncated: boolean
    }
  | {
      candidateIds: string[]
      documentId: string
      kind: 'confirmation-required'
      unfinishedJobIds: string[]
    }

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const documentIdSchema = v.pipe(v.string(), v.uuid())
const phases = new Set<ProjectGenerationActionState['phase']>([
  'blocked',
  'closed',
  'idle',
  'preparing',
  'processing',
])

/** Validate untrusted renderer commands and preload responses without filesystem access. */
export function isProjectDocumentId(value: unknown): value is string {
  // Imported documents keep the same UUID domain as the portable .igs schema.
  return v.is(documentIdSchema, value)
}

export function isProjectGenerateOptions(value: unknown): value is ProjectGenerateOptions {
  return (
    isRecord(value) &&
    exactKeys(value, ['documentId', 'iterations'], ['confirmation']) &&
    isProjectDocumentId(value['documentId']) &&
    typeof value['iterations'] === 'number' &&
    Number.isSafeInteger(value['iterations']) &&
    value['iterations'] >= 1 &&
    value['iterations'] <= 100 &&
    (value['confirmation'] === undefined ||
      (isRecord(value['confirmation']) &&
        exactKeys(value['confirmation'], ['candidateIds', 'unfinishedJobIds']) &&
        isIds(value['confirmation']['candidateIds']) &&
        isIds(value['confirmation']['unfinishedJobIds'])))
  )
}

export function isProjectGenerationActionState(
  value: unknown,
): value is ProjectGenerationActionState {
  if (
    !isRecord(value) ||
    !exactKeys(
      value,
      [
        'cfgRescaleSupported',
        'documentId',
        'embeddingsSupported',
        'error',
        'externalVaeSupported',
        'img2imgSupported',
        'jobs',
        'phase',
        'runningJobId',
        'vaePrecisionSupported',
      ],
      [
        'animaSupported',
        'animaOutpaintSupported',
        'outpaintSupported',
        'regionalSupported',
        'smartPatchSupported',
      ],
    ) ||
    (value['animaSupported'] !== undefined && typeof value['animaSupported'] !== 'boolean') ||
    (value['animaOutpaintSupported'] !== undefined &&
      typeof value['animaOutpaintSupported'] !== 'boolean') ||
    (value['outpaintSupported'] !== undefined && typeof value['outpaintSupported'] !== 'boolean') ||
    (value['regionalSupported'] !== undefined && typeof value['regionalSupported'] !== 'boolean') ||
    (value['smartPatchSupported'] !== undefined &&
      typeof value['smartPatchSupported'] !== 'boolean') ||
    typeof value['cfgRescaleSupported'] !== 'boolean' ||
    typeof value['embeddingsSupported'] !== 'boolean' ||
    typeof value['externalVaeSupported'] !== 'boolean' ||
    typeof value['img2imgSupported'] !== 'boolean' ||
    typeof value['vaePrecisionSupported'] !== 'boolean' ||
    !isProjectDocumentId(value['documentId']) ||
    !phases.has(value['phase'] as ProjectGenerationActionState['phase']) ||
    (value['error'] !== null && !isSafeError(value['error'])) ||
    !Array.isArray(value['jobs']) ||
    value['jobs'].length > IGS_SAFETY_CEILINGS.archiveEntries ||
    !value['jobs'].every(isJob) ||
    new Set(value['jobs'].map((job) => job.id)).size !== value['jobs'].length
  ) {
    return false
  }
  const running = value['jobs'].filter((job) => job.status === 'running')
  return (
    running.length <= 1 &&
    (value['runningJobId'] === null
      ? running.length === 0
      : isUuid(value['runningJobId']) &&
        running.length === 1 &&
        running[0]?.id === value['runningJobId'])
  )
}

export function isProjectGenerateResult(value: unknown): value is ProjectGenerateResult {
  if (!isRecord(value) || !isProjectDocumentId(value['documentId'])) {
    return false
  }
  if (value['kind'] === 'confirmation-required') {
    return (
      exactKeys(value, ['candidateIds', 'documentId', 'kind', 'unfinishedJobIds']) &&
      isIds(value['candidateIds']) &&
      isIds(value['unfinishedJobIds']) &&
      value['candidateIds'].length + value['unfinishedJobIds'].length > 0
    )
  }
  return (
    value['kind'] === 'queued' &&
    exactKeys(value, ['batchId', 'documentId', 'jobIds', 'kind', 'truncated']) &&
    isUuid(value['batchId']) &&
    isIds(value['jobIds']) &&
    value['jobIds'].length >= 1 &&
    value['jobIds'].length <= GENERATION_BATCH_JOB_LIMIT &&
    typeof value['truncated'] === 'boolean'
  )
}

function isJob(value: unknown): value is ProjectGenerationQueueJob {
  return (
    isRecord(value) &&
    exactKeys(value, [
      'batchId',
      'createdAt',
      'id',
      'prompt',
      'seed',
      'status',
      'statusSequence',
    ]) &&
    isUuid(value['id']) &&
    isUuid(value['batchId']) &&
    typeof value['createdAt'] === 'string' &&
    Number.isFinite(Date.parse(value['createdAt'])) &&
    typeof value['prompt'] === 'string' &&
    new TextEncoder().encode(value['prompt']).byteLength <= 16 * 1024 &&
    typeof value['seed'] === 'number' &&
    Number.isSafeInteger(value['seed']) &&
    value['seed'] >= 0 &&
    value['seed'] <= 0xff_ff_ff_ff &&
    (value['status'] === 'pending' || value['status'] === 'running') &&
    typeof value['statusSequence'] === 'number' &&
    Number.isSafeInteger(value['statusSequence']) &&
    value['statusSequence'] >= 0
  )
}

function isIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= IGS_SAFETY_CEILINGS.archiveEntries &&
    value.every(isUuid) &&
    new Set(value).size === value.length
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeError(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactKeys(value, ['code', 'message']) &&
    typeof value['code'] === 'string' &&
    /^[A-Z][A-Z0-9_]{0,127}$/.test(value['code']) &&
    typeof value['message'] === 'string' &&
    value['message'].length <= 512
  )
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value)
}

function exactKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
): boolean {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
  )
}
