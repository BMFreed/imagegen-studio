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
  /** Separate non-Euler regional support; ordinary flow and regional Euler never imply it. */
  animaRegionalImg2ImgSupported?: boolean
  /** Global enabled LoRAs, including zero weight, need the separate regional adapter scope. */
  animaRegionalLoraSupported?: boolean
  /** Nonempty local or inherited regional negatives need their own signed attention scope. */
  animaRegionalNegativeSupported?: boolean
  animaRegionalOutpaintSupported?: boolean
  animaRegionalSamplingSupported?: boolean
  /** Separate finite regional Anima execution support; ordinary Anima never grants it. */
  animaRegionalSupported?: boolean
  animaSmartPatchRegionalImg2ImgSupported?: boolean
  animaSmartPatchRegionalLoraImg2ImgSupported?: boolean
  animaSmartPatchRegionalLoraOutpaintSupported?: boolean
  /** Enabled global LoRA stacks require an exact qualified Smart/regional mode. */
  animaSmartPatchRegionalLoraSupported?: boolean
  animaSmartPatchRegionalLoraTxt2ImgSupported?: boolean
  animaSmartPatchRegionalOutpaintSupported?: boolean
  animaSmartPatchRegionalSupported?: boolean
  animaSmartPatchRegionalTxt2ImgSupported?: boolean
  animaSupported?: boolean
  /** Advisory only; Main rechecks the actual worker at admission and dispatch. */
  cfgRescaleSupported: boolean
  documentId: string
  embeddingsSupported: boolean
  error: { code: string; message: string } | null
  externalVaeSupported: boolean
  illustriousSmartPatchRegionalImg2ImgSupported?: boolean
  illustriousSmartPatchRegionalLoraImg2ImgSupported?: boolean
  illustriousSmartPatchRegionalLoraOutpaintSupported?: boolean
  illustriousSmartPatchRegionalLoraSupported?: boolean
  illustriousSmartPatchRegionalLoraTxt2ImgSupported?: boolean
  illustriousSmartPatchRegionalOutpaintSupported?: boolean
  /** Absent in older responses; never treat absence as native Anima support. */
  illustriousSmartPatchRegionalSupported?: boolean
  illustriousSmartPatchRegionalTxt2ImgSupported?: boolean
  illustriousSmartPatchRegionalVPredictionImg2ImgSupported?: boolean
  illustriousSmartPatchRegionalVPredictionLoraImg2ImgSupported?: boolean
  illustriousSmartPatchRegionalVPredictionLoraOutpaintSupported?: boolean
  illustriousSmartPatchRegionalVPredictionLoraSupported?: boolean
  illustriousSmartPatchRegionalVPredictionLoraTxt2ImgSupported?: boolean
  illustriousSmartPatchRegionalVPredictionOutpaintSupported?: boolean
  /** Objective-specific grants; EPS, Canvas V and ordinary Smart never imply these. */
  illustriousSmartPatchRegionalVPredictionSupported?: boolean
  illustriousSmartPatchRegionalVPredictionTxt2ImgSupported?: boolean
  img2imgSupported: boolean
  jobs: ProjectGenerationQueueJob[]
  /** Worker capability only. Main verifies the exact local LaMa resource on admission. */
  outpaintSupported?: boolean
  /** Engine admission/dispatch is app-wide; jobs and current cancellation are document-scoped. */
  phase: 'blocked' | 'closed' | 'idle' | 'preparing' | 'processing'
  /** Separate nonneutral regional rescale support; ordinary support does not imply it. */
  regionalCfgRescaleSupported?: boolean
  /** Explicit DPM++ 2M/public Invoke initialization support; absence never grants it. */
  regionalDpmSupported?: boolean
  /** Separate nonzero image rescale support; independent TXT/image flags never imply it. */
  regionalImg2ImgCfgRescaleSupported?: boolean
  /** Separate image DPM++ 2M support; no TXT initialization is selected for source latents. */
  regionalImg2ImgDpmpp2mSupported?: boolean
  /** Separate image Euler a support; TXT initialization and image support alone never imply it. */
  regionalImg2ImgEulerASupported?: boolean
  /** Separate opaque regional image support; absence keeps old workers unavailable. */
  regionalImg2ImgSupported?: boolean
  /** Selected VAE/precision on opaque IMG requires a separate encoder/decode qualification. */
  regionalImg2ImgVaeSupported?: boolean
  /** Separate opt-in initialization capability; absence never enables regional Euler a. */
  regionalInvokeInitializationSupported?: boolean
  /** Explicit public regional LoRA support; absence never enables an active global stack. */
  regionalLoraSupported?: boolean
  regionalOutpaintSupported?: boolean
  /** Source-bound mixed-alpha regional execution, independently qualified from opaque IMG. */
  /** Separate exact original-image attention consumer; regional text support never grants it. */
  regionalReferenceImagesSupported?: boolean
  /** Explicit finite Regional Guidance support; older responses must remain unavailable. */
  regionalSupported?: boolean
  /** Explicit selected-VAE/precision support; legacy Embedded/FP16 needs no new opt-in. */
  regionalVaeSupported?: boolean
  /** Separate source-conditioned V Euler support; TXT and image support never imply it. */
  regionalVPredictionImageSupported?: boolean
  /** Separate non-Euler V support; individual EPS samplers and V Euler never imply it. */
  regionalVPredictionSamplingSupported?: boolean
  /** Explicit objective-aware TXT Euler support; epsilon peers do not imply it. */
  regionalVPredictionSupported?: boolean
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
        'illustriousSmartPatchRegionalLoraSupported',
        'illustriousSmartPatchRegionalLoraOutpaintSupported',
        'illustriousSmartPatchRegionalLoraTxt2ImgSupported',
        'illustriousSmartPatchRegionalLoraImg2ImgSupported',
        'illustriousSmartPatchRegionalVPredictionLoraSupported',
        'illustriousSmartPatchRegionalVPredictionLoraOutpaintSupported',
        'illustriousSmartPatchRegionalVPredictionLoraTxt2ImgSupported',
        'illustriousSmartPatchRegionalVPredictionLoraImg2ImgSupported',
        'illustriousSmartPatchRegionalVPredictionSupported',
        'illustriousSmartPatchRegionalVPredictionOutpaintSupported',
        'illustriousSmartPatchRegionalVPredictionTxt2ImgSupported',
        'illustriousSmartPatchRegionalVPredictionImg2ImgSupported',
        'illustriousSmartPatchRegionalSupported',
        'illustriousSmartPatchRegionalOutpaintSupported',
        'illustriousSmartPatchRegionalTxt2ImgSupported',
        'illustriousSmartPatchRegionalImg2ImgSupported',
        'animaSupported',
        'animaSmartPatchRegionalLoraSupported',
        'animaSmartPatchRegionalLoraOutpaintSupported',
        'animaSmartPatchRegionalLoraTxt2ImgSupported',
        'animaSmartPatchRegionalLoraImg2ImgSupported',
        'animaSmartPatchRegionalTxt2ImgSupported',
        'animaSmartPatchRegionalImg2ImgSupported',
        'animaSmartPatchRegionalOutpaintSupported',
        'animaSmartPatchRegionalSupported',
        'animaRegionalSupported',
        'animaRegionalImg2ImgSupported',
        'animaRegionalLoraSupported',
        'animaRegionalNegativeSupported',
        'animaRegionalOutpaintSupported',
        'animaRegionalSamplingSupported',
        'animaOutpaintSupported',
        'outpaintSupported',
        'regionalSupported',
        'regionalCfgRescaleSupported',
        'regionalDpmSupported',
        'regionalImg2ImgSupported',
        'regionalImg2ImgVaeSupported',
        'regionalOutpaintSupported',
        'regionalReferenceImagesSupported',
        'regionalImg2ImgCfgRescaleSupported',
        'regionalImg2ImgEulerASupported',
        'regionalImg2ImgDpmpp2mSupported',
        'regionalInvokeInitializationSupported',
        'regionalLoraSupported',
        'regionalVaeSupported',
        'regionalVPredictionImageSupported',
        'regionalVPredictionSamplingSupported',
        'regionalVPredictionSupported',
        'smartPatchSupported',
      ],
    ) ||
    (value['illustriousSmartPatchRegionalLoraSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalLoraSupported'] !== 'boolean') ||
    (value['illustriousSmartPatchRegionalLoraOutpaintSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalLoraOutpaintSupported'] !== 'boolean') ||
    (value['illustriousSmartPatchRegionalLoraTxt2ImgSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalLoraTxt2ImgSupported'] !== 'boolean') ||
    (value['illustriousSmartPatchRegionalLoraImg2ImgSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalLoraImg2ImgSupported'] !== 'boolean') ||
    (value['illustriousSmartPatchRegionalVPredictionLoraSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalVPredictionLoraSupported'] !== 'boolean') ||
    (value['illustriousSmartPatchRegionalVPredictionLoraOutpaintSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalVPredictionLoraOutpaintSupported'] !==
        'boolean') ||
    (value['illustriousSmartPatchRegionalVPredictionLoraTxt2ImgSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalVPredictionLoraTxt2ImgSupported'] !== 'boolean') ||
    (value['illustriousSmartPatchRegionalVPredictionLoraImg2ImgSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalVPredictionLoraImg2ImgSupported'] !== 'boolean') ||
    (value['illustriousSmartPatchRegionalVPredictionSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalVPredictionSupported'] !== 'boolean') ||
    (value['illustriousSmartPatchRegionalVPredictionOutpaintSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalVPredictionOutpaintSupported'] !== 'boolean') ||
    (value['illustriousSmartPatchRegionalVPredictionTxt2ImgSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalVPredictionTxt2ImgSupported'] !== 'boolean') ||
    (value['illustriousSmartPatchRegionalVPredictionImg2ImgSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalVPredictionImg2ImgSupported'] !== 'boolean') ||
    (value['illustriousSmartPatchRegionalSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalSupported'] !== 'boolean') ||
    (value['illustriousSmartPatchRegionalOutpaintSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalOutpaintSupported'] !== 'boolean') ||
    (value['illustriousSmartPatchRegionalTxt2ImgSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalTxt2ImgSupported'] !== 'boolean') ||
    (value['illustriousSmartPatchRegionalImg2ImgSupported'] !== undefined &&
      typeof value['illustriousSmartPatchRegionalImg2ImgSupported'] !== 'boolean') ||
    (value['animaSupported'] !== undefined && typeof value['animaSupported'] !== 'boolean') ||
    (value['animaSmartPatchRegionalLoraSupported'] !== undefined &&
      typeof value['animaSmartPatchRegionalLoraSupported'] !== 'boolean') ||
    (value['animaSmartPatchRegionalLoraOutpaintSupported'] !== undefined &&
      typeof value['animaSmartPatchRegionalLoraOutpaintSupported'] !== 'boolean') ||
    (value['animaSmartPatchRegionalLoraTxt2ImgSupported'] !== undefined &&
      typeof value['animaSmartPatchRegionalLoraTxt2ImgSupported'] !== 'boolean') ||
    (value['animaSmartPatchRegionalLoraImg2ImgSupported'] !== undefined &&
      typeof value['animaSmartPatchRegionalLoraImg2ImgSupported'] !== 'boolean') ||
    (value['animaSmartPatchRegionalTxt2ImgSupported'] !== undefined &&
      typeof value['animaSmartPatchRegionalTxt2ImgSupported'] !== 'boolean') ||
    (value['animaSmartPatchRegionalImg2ImgSupported'] !== undefined &&
      typeof value['animaSmartPatchRegionalImg2ImgSupported'] !== 'boolean') ||
    (value['animaSmartPatchRegionalOutpaintSupported'] !== undefined &&
      typeof value['animaSmartPatchRegionalOutpaintSupported'] !== 'boolean') ||
    (value['animaSmartPatchRegionalSupported'] !== undefined &&
      typeof value['animaSmartPatchRegionalSupported'] !== 'boolean') ||
    (value['animaRegionalSupported'] !== undefined &&
      typeof value['animaRegionalSupported'] !== 'boolean') ||
    (value['animaRegionalImg2ImgSupported'] !== undefined &&
      typeof value['animaRegionalImg2ImgSupported'] !== 'boolean') ||
    (value['animaRegionalLoraSupported'] !== undefined &&
      typeof value['animaRegionalLoraSupported'] !== 'boolean') ||
    (value['animaRegionalNegativeSupported'] !== undefined &&
      typeof value['animaRegionalNegativeSupported'] !== 'boolean') ||
    (value['animaRegionalOutpaintSupported'] !== undefined &&
      typeof value['animaRegionalOutpaintSupported'] !== 'boolean') ||
    (value['animaRegionalSamplingSupported'] !== undefined &&
      typeof value['animaRegionalSamplingSupported'] !== 'boolean') ||
    (value['animaOutpaintSupported'] !== undefined &&
      typeof value['animaOutpaintSupported'] !== 'boolean') ||
    (value['outpaintSupported'] !== undefined && typeof value['outpaintSupported'] !== 'boolean') ||
    (value['regionalCfgRescaleSupported'] !== undefined &&
      typeof value['regionalCfgRescaleSupported'] !== 'boolean') ||
    (value['regionalDpmSupported'] !== undefined &&
      typeof value['regionalDpmSupported'] !== 'boolean') ||
    (value['regionalImg2ImgCfgRescaleSupported'] !== undefined &&
      typeof value['regionalImg2ImgCfgRescaleSupported'] !== 'boolean') ||
    (value['regionalImg2ImgDpmpp2mSupported'] !== undefined &&
      typeof value['regionalImg2ImgDpmpp2mSupported'] !== 'boolean') ||
    (value['regionalImg2ImgEulerASupported'] !== undefined &&
      typeof value['regionalImg2ImgEulerASupported'] !== 'boolean') ||
    (value['regionalImg2ImgSupported'] !== undefined &&
      typeof value['regionalImg2ImgSupported'] !== 'boolean') ||
    (value['regionalImg2ImgVaeSupported'] !== undefined &&
      typeof value['regionalImg2ImgVaeSupported'] !== 'boolean') ||
    (value['regionalReferenceImagesSupported'] !== undefined &&
      typeof value['regionalReferenceImagesSupported'] !== 'boolean') ||
    (value['regionalOutpaintSupported'] !== undefined &&
      typeof value['regionalOutpaintSupported'] !== 'boolean') ||
    (value['regionalVPredictionImageSupported'] !== undefined &&
      typeof value['regionalVPredictionImageSupported'] !== 'boolean') ||
    (value['regionalVPredictionSamplingSupported'] !== undefined &&
      typeof value['regionalVPredictionSamplingSupported'] !== 'boolean') ||
    (value['regionalVPredictionSupported'] !== undefined &&
      typeof value['regionalVPredictionSupported'] !== 'boolean') ||
    (value['regionalVaeSupported'] !== undefined &&
      typeof value['regionalVaeSupported'] !== 'boolean') ||
    (value['regionalSupported'] !== undefined && typeof value['regionalSupported'] !== 'boolean') ||
    (value['regionalInvokeInitializationSupported'] !== undefined &&
      typeof value['regionalInvokeInitializationSupported'] !== 'boolean') ||
    (value['regionalLoraSupported'] !== undefined &&
      typeof value['regionalLoraSupported'] !== 'boolean') ||
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
