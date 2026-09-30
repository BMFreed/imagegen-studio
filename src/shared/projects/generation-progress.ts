import * as v from 'valibot'

/** Two scheduler evaluations per requested step at most; sampling itself is bounded to 200. */
export const MAX_DENOISING_STEPS = 400

export interface GenerationDenoisingProgress {
  step: number
  totalSteps: number
}

export interface GenerationProgressCurrent extends GenerationDenoisingProgress {
  documentId: string
  jobId: string
  projectKey: string
  statusSequence: number
}

/** App-lifetime transient revision, independent of durable queue statusSequence. */
export interface GenerationProgressSnapshot {
  current: GenerationProgressCurrent | null
  revision: number
}

const sequence = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const step = v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(MAX_DENOISING_STEPS))
const uuid = v.pipe(
  v.string(),
  v.regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/),
)
const ProgressSchema = v.pipe(
  v.strictObject({ step, totalSteps: step }),
  v.check((value) => value.step <= value.totalSteps),
)
const CurrentSchema = v.pipe(
  v.strictObject({
    documentId: uuid,
    jobId: uuid,
    projectKey: v.pipe(v.string(), v.regex(/^project-v1-[a-f0-9]{64}$/)),
    statusSequence: sequence,
    step,
    totalSteps: step,
  }),
  v.check((value) => value.step <= value.totalSteps),
)
const SnapshotSchema = v.strictObject({ current: v.nullable(CurrentSchema), revision: sequence })

export function isGenerationDenoisingProgress(
  value: unknown,
): value is GenerationDenoisingProgress {
  return v.safeParse(ProgressSchema, value).success
}

export function isGenerationProgressSnapshot(value: unknown): value is GenerationProgressSnapshot {
  return v.safeParse(SnapshotSchema, value).success
}

/** Match durable running ownership before projecting an ephemeral observation. */
export function progressForJob(
  snapshot: GenerationProgressSnapshot,
  job: {
    cancelRequested: boolean
    documentId: string
    id: string
    projectKey: string
    status: string
    statusSequence: number
  },
): GenerationProgressCurrent | null {
  const current = snapshot.current
  return current &&
    job.status === 'running' &&
    !job.cancelRequested &&
    current.jobId === job.id &&
    current.statusSequence === job.statusSequence &&
    current.projectKey === job.projectKey &&
    current.documentId === job.documentId
    ? current
    : null
}
