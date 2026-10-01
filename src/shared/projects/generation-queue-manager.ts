import * as v from 'valibot'

import { isProjectDocumentId } from './project-generation-actions.js'

/** Display page size, not queue retention or an inference capacity limit. */
export const GENERATION_QUEUE_PAGE_SIZE = 50
export const generationQueueStatuses = [
  'pending',
  'running',
  'completed',
  'failed',
  'canceled',
] as const
export type GenerationQueueStatus = (typeof generationQueueStatuses)[number]
export type GenerationQueueTerminalStatus = Exclude<GenerationQueueStatus, 'pending' | 'running'>

export interface GenerationQueueReview {
  id: string
  statusSequence: number
}

export interface GenerationQueueCursor {
  createdAt: string
  id: string
}

export interface GenerationQueueEntry extends GenerationQueueReview {
  batchId: string
  cancelRequested: boolean
  createdAt: string
  details: {
    modelName: string
    modelVersion: string
    negativePrompt: string
    prompt: string
    sampling: {
      cfgScale: number
      predictionType: 'epsilon' | 'sample' | 'v_prediction'
      sampler: string
      scheduler: string
      seed: number
      steps: number
    }
    size: { height: number; width: number }
  } | null
  documentId: string
  error: { code: string; message: string } | null
  finishedAt: string | null
  operation: 'illustrious-txt2img'
  projectKey: string
  projectName: string
  publicationPending: boolean
  stagingSessionId: string
  startedAt: string | null
  status: GenerationQueueStatus
}

export interface GenerationQueuePage {
  counts: Record<GenerationQueueStatus, number>
  items: GenerationQueueEntry[]
  nextCursor: GenerationQueueCursor | null
}

const uuid = v.pipe(
  v.string(),
  v.regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/),
)
const sequence = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(0),
  v.maxValue(Number.MAX_SAFE_INTEGER - 1),
)
const timestamp = v.pipe(v.string(), v.isoTimestamp())
const text = v.pipe(v.string(), v.maxLength(128 * 1024))
const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const ReviewSchema = v.strictObject({ id: uuid, statusSequence: sequence })
const CursorSchema = v.strictObject({ createdAt: timestamp, id: uuid })
const EntrySchema = v.strictObject({
  batchId: uuid,
  cancelRequested: v.boolean(),
  createdAt: timestamp,
  details: v.nullable(
    v.strictObject({
      modelName: text,
      modelVersion: text,
      negativePrompt: text,
      prompt: text,
      sampling: v.strictObject({
        cfgScale: v.pipe(v.number(), v.finite()),
        predictionType: v.picklist(['epsilon', 'sample', 'v_prediction']),
        sampler: text,
        scheduler: text,
        seed: v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(0xff_ff_ff_ff)),
        steps: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
      }),
      size: v.strictObject({
        height: v.pipe(v.number(), v.safeInteger(), v.minValue(8)),
        width: v.pipe(v.number(), v.safeInteger(), v.minValue(8)),
      }),
    }),
  ),
  documentId: v.pipe(
    v.string(),
    v.check((value) => isProjectDocumentId(value)),
  ),
  error: v.nullable(
    v.strictObject({
      code: v.pipe(v.string(), v.regex(/^[A-Z][A-Z0-9_]{0,127}$/)),
      message: v.pipe(v.string(), v.maxLength(512)),
    }),
  ),
  finishedAt: v.nullable(timestamp),
  id: uuid,
  operation: v.literal('illustrious-txt2img'),
  projectKey: v.pipe(v.string(), v.regex(/^project-v1-[a-f0-9]{64}$/)),
  projectName: text,
  publicationPending: v.boolean(),
  stagingSessionId: uuid,
  startedAt: v.nullable(timestamp),
  status: v.picklist(generationQueueStatuses),
  statusSequence: sequence,
})
const PageSchema = v.strictObject({
  counts: v.strictObject({
    canceled: count,
    completed: count,
    failed: count,
    pending: count,
    running: count,
  }),
  items: v.pipe(
    v.array(EntrySchema),
    v.maxLength(GENERATION_QUEUE_PAGE_SIZE),
    v.check((items) => new Set(items.map((item) => item.id)).size === items.length),
  ),
  nextCursor: v.nullable(CursorSchema),
})

export function isGenerationQueueReview(value: unknown): value is GenerationQueueReview {
  return v.is(ReviewSchema, value)
}
export function isGenerationQueueCursor(value: unknown): value is GenerationQueueCursor {
  return v.is(CursorSchema, value)
}
export function isGenerationQueuePage(value: unknown): value is GenerationQueuePage {
  return v.is(PageSchema, value)
}
export function isGenerationQueueTerminalStatuses(
  value: unknown,
): value is GenerationQueueTerminalStatus[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 3 &&
    new Set(value).size === value.length &&
    value.every((status) => status === 'completed' || status === 'failed' || status === 'canceled')
  )
}
