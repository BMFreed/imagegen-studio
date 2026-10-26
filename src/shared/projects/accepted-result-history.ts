import * as v from 'valibot'

import { IGS_SAFETY_CEILINGS } from './project-schema.js'

/** UI transport bound, consistent with Queue Manager; it does not limit saved history retention. */
export const ACCEPTED_RESULT_HISTORY_PAGE_SIZE = 50

export interface AcceptedResultHistoryCursor {
  acceptedAt: string
  layerId: string
  projectKey: string
}

export interface AcceptedResultHistoryReference {
  assetSha256: string
  documentId: string
  documentRevision: string
  /** Accepted Raster Layer or nested Smart Patch variant UUID, never a parent display proxy. */
  layerId: string
  projectKey: string
}

export interface AcceptedResultHistoryEntry extends AcceptedResultHistoryReference {
  acceptedAt: string
  height: number
  imageUrl: string | null
  layerName: string
  modelFileSha256: string
  modelName: string
  modelVersionName: string
  projectName: string
  seed: number
  width: number
}

export interface AcceptedResultHistoryPage {
  items: AcceptedResultHistoryEntry[]
  nextCursor: AcceptedResultHistoryCursor | null
  totalCount: number
}

const uuid = v.pipe(v.string(), v.uuid())
const projectKey = v.pipe(v.string(), v.regex(/^project-v1-[a-f0-9]{64}$/))
const sha256 = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))
const timestamp = v.pipe(
  v.string(),
  v.check(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
  ),
)
const text = v.pipe(
  v.string(),
  v.nonEmpty(),
  v.maxBytes(IGS_SAFETY_CEILINGS.titleBytes),
  v.check((value) => value.trim().length > 0),
)
const outputDimension = v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(2048))
const CursorSchema = v.strictObject({ acceptedAt: timestamp, layerId: uuid, projectKey })
const ReferenceSchema = v.strictObject({
  assetSha256: sha256,
  documentId: uuid,
  documentRevision: uuid,
  layerId: uuid,
  projectKey,
})
const EntrySchema = v.pipe(
  v.strictObject({
    ...ReferenceSchema.entries,
    acceptedAt: timestamp,
    height: outputDimension,
    imageUrl: v.nullable(v.string()),
    layerName: text,
    modelFileSha256: sha256,
    modelName: text,
    modelVersionName: text,
    projectName: text,
    seed: v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(0xff_ff_ff_ff)),
    width: outputDimension,
  }),
  v.check((entry) => entry.imageUrl === null || isScopedHistoryImageUrl(entry.imageUrl, entry)),
)
const PageSchema = v.pipe(
  v.strictObject({
    items: v.pipe(
      v.array(EntrySchema),
      v.maxLength(ACCEPTED_RESULT_HISTORY_PAGE_SIZE),
      v.check(
        (items) =>
          new Set(items.map((entry) => `${entry.projectKey}:${entry.layerId}`)).size ===
          items.length,
      ),
    ),
    nextCursor: v.nullable(CursorSchema),
    totalCount: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  }),
  v.check(({ items, nextCursor, totalCount }) => {
    const last = items.at(-1)
    return (
      totalCount >= items.length &&
      (nextCursor === null ||
        (items.length === ACCEPTED_RESULT_HISTORY_PAGE_SIZE &&
          last !== undefined &&
          nextCursor.acceptedAt === last.acceptedAt &&
          nextCursor.projectKey === last.projectKey &&
          nextCursor.layerId === last.layerId))
    )
  }),
)

export function isAcceptedResultHistoryCursor(
  value: unknown,
): value is AcceptedResultHistoryCursor {
  return v.is(CursorSchema, value)
}

export function isAcceptedResultHistoryReference(
  value: unknown,
): value is AcceptedResultHistoryReference {
  return v.is(ReferenceSchema, value)
}

export function isAcceptedResultHistoryPage(value: unknown): value is AcceptedResultHistoryPage {
  return v.is(PageSchema, value)
}

/** Preload binds every reference field; only Main verifies the process-lifetime MAC on read. */
function isScopedHistoryImageUrl(value: string, entry: AcceptedResultHistoryReference): boolean {
  try {
    const url = new URL(value)
    const match =
      /^\/(project-v1-[a-f0-9]{64})\/([a-fA-F0-9-]{36})\/([a-fA-F0-9-]{36})\/([a-fA-F0-9-]{36})\/([a-f0-9]{64})\/([a-f0-9]{64})\.img$/.exec(
        url.pathname,
      )
    return (
      url.protocol === 'igs-history:' &&
      url.hostname === 'result' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      match !== null &&
      match[1] === entry.projectKey &&
      match[2] === entry.documentId &&
      match[3] === entry.documentRevision &&
      match[4] === entry.layerId &&
      match[5] === entry.assetSha256
    )
  } catch {
    return false
  }
}
