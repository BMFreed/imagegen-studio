import * as v from 'valibot'

import type { ProjectGenerateResult } from './project-generation-actions.js'

import { isProjectGenerateResult } from './project-generation-actions.js'
import { IGS_SAFETY_CEILINGS } from './project-schema.js'

const uuid = v.pipe(v.string(), v.uuid())
const ids = v.pipe(
  v.array(uuid),
  v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
  v.check((values) => new Set(values).size === values.length),
)
const boundedMessage = v.pipe(v.string(), v.minLength(1), v.maxLength(512))
const owner = { documentId: uuid, documentRevision: uuid, layerId: uuid }
const reviewed = { expectedAvailableIds: ids, expectedUnfinishedJobIds: ids }
const generateSchema = v.strictObject({
  ...owner,
  confirmation: v.optional(v.strictObject({ candidateIds: ids, unfinishedJobIds: ids })),
  iterations: v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(100)),
  kind: v.literal('smart-patch'),
})
const acceptSchema = v.strictObject({
  ...owner,
  ...reviewed,
  candidateIds: v.pipe(ids, v.minLength(1), v.maxLength(64)),
  focusedCandidateId: v.nullable(uuid),
  kind: v.literal('smart-patch'),
})
const rasterAcceptSchema = v.pipe(
  v.strictObject({
    ...acceptSchema.entries,
    kind: v.literal('smart-patch-raster'),
  }),
  v.check((request) =>
    request.candidateIds.every((id) => request.expectedAvailableIds.includes(id)),
  ),
  v.check(
    (request) =>
      request.focusedCandidateId === null ||
      request.candidateIds.includes(request.focusedCandidateId),
  ),
)
const discardSchema = v.strictObject({
  ...owner,
  ...reviewed,
  kind: v.literal('smart-patch'),
  /** Original candidate owner, which can differ from the currently open document. */
  sourceDocumentId: uuid,
})
const exportSchema = v.strictObject({
  candidateId: uuid,
  documentId: uuid,
  layerId: uuid,
  stagingSessionId: uuid,
})
const discardResultSchema = v.strictObject({
  cleanupDeferred: v.boolean(),
  discardedSessionCount: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
})
const targetStateSchema = v.pipe(
  v.strictObject({
    ...owner,
    kind: v.literal('smart-patch-target'),
    mode: v.nullable(v.picklist(['txt2img', 'img2img', 'inpaint', 'outpaint'])),
    unavailableReason: v.nullable(boundedMessage),
  }),
  v.check((state) =>
    state.mode === null ? state.unavailableReason !== null : state.unavailableReason === null,
  ),
)
const disposition = v.picklist(['available', 'blocked', 'orphaned', 'foreign-document'])
const targetFields = {
  disposition,
  documentId: uuid,
  layerId: uuid,
  layerName: v.nullable(v.pipe(v.string(), v.maxBytes(IGS_SAFETY_CEILINGS.titleBytes))),
  unavailableReason: v.nullable(boundedMessage),
}
const targetSchema = v.pipe(
  v.strictObject({ ...targetFields, unfinishedJobIds: ids }),
  v.check((target) => validDisposition(target)),
)
const integer = (min: number, max: number) =>
  v.pipe(v.number(), v.safeInteger(), v.minValue(min), v.maxValue(max))
const bbox = v.strictObject({
  height: integer(1, IGS_SAFETY_CEILINGS.rasterDimension),
  width: integer(1, IGS_SAFETY_CEILINGS.rasterDimension),
  x: integer(-IGS_SAFETY_CEILINGS.coordinateMagnitude, IGS_SAFETY_CEILINGS.coordinateMagnitude),
  y: integer(-IGS_SAFETY_CEILINGS.coordinateMagnitude, IGS_SAFETY_CEILINGS.coordinateMagnitude),
})
const candidateSchema = v.pipe(
  v.strictObject({
    ...targetFields,
    actualSeed: integer(0, 0xff_ff_ff_ff),
    bbox,
    candidateId: uuid,
    completedAt: v.pipe(
      v.string(),
      v.check((value) => Number.isFinite(Date.parse(value))),
    ),
    completionOrder: integer(1, Number.MAX_SAFE_INTEGER),
    imageUrl: v.string(),
    kind: v.literal('smart-patch-world-candidate'),
    queueItemId: uuid,
    rasterConversionUnavailableReason: v.nullable(boundedMessage),
    stagingSessionId: uuid,
    thumbnailUrl: v.optional(v.string()),
  }),
  v.check((candidate) => isSmartImageUrl(candidate.imageUrl, candidate)),
  v.check(
    (candidate) =>
      candidate.thumbnailUrl === undefined ||
      isSmartThumbnailUrl(candidate.thumbnailUrl, candidate),
  ),
  v.check((candidate) => validDisposition(candidate)),
  v.check(
    (candidate) =>
      candidate.disposition === 'orphaned' || candidate.rasterConversionUnavailableReason !== null,
  ),
)
const snapshotSchema = v.pipe(
  v.strictObject({
    candidates: v.pipe(v.array(candidateSchema), v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries)),
    documentId: uuid,
    documentRevision: uuid,
    kind: v.literal('smart-patch-results'),
    lastActualSeed: v.nullable(integer(0, 0xff_ff_ff_ff)),
    recoveryUnavailable: v.boolean(),
    targets: v.pipe(v.array(targetSchema), v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries)),
  }),
  v.check(
    (snapshot) =>
      new Set(snapshot.candidates.map(({ candidateId }) => candidateId)).size ===
      snapshot.candidates.length,
  ),
  v.check(
    (snapshot) =>
      new Set(snapshot.targets.map(({ documentId, layerId }) => `${documentId}:${layerId}`))
        .size === snapshot.targets.length,
  ),
  v.check(
    (snapshot) =>
      !snapshot.recoveryUnavailable ||
      (snapshot.candidates.length === 0 &&
        snapshot.targets.length === 0 &&
        snapshot.lastActualSeed === null),
  ),
  v.check((snapshot) =>
    snapshot.candidates.every((candidate) =>
      snapshot.targets.some(
        (target) =>
          target.documentId === candidate.documentId &&
          target.layerId === candidate.layerId &&
          target.disposition === candidate.disposition &&
          target.unavailableReason === candidate.unavailableReason &&
          target.layerName === candidate.layerName,
      ),
    ),
  ),
  v.check((snapshot) =>
    snapshot.candidates.every(
      (candidate) =>
        candidate.rasterConversionUnavailableReason !== null ||
        candidate.documentId === snapshot.documentId,
    ),
  ),
)

export type ProjectSmartPatchGenerateOptions = v.InferOutput<typeof generateSchema>

export type ProjectSmartPatchGenerateResult = ProjectGenerateResult & {
  layerId: string
  targetKind: 'smart-patch'
}
export type ProjectSmartPatchAcceptRequest = v.InferOutput<typeof acceptSchema>
export type ProjectSmartPatchRasterAcceptRequest = v.InferOutput<typeof rasterAcceptSchema>
export type ProjectSmartPatchDiscardRequest = v.InferOutput<typeof discardSchema>
export type ProjectSmartPatchDiscardResult = v.InferOutput<typeof discardResultSchema>
export type ProjectSmartPatchCandidateExportRequest = v.InferOutput<typeof exportSchema>
export type ProjectSmartPatchGenerationTargetState = v.InferOutput<typeof targetStateSchema>
export type ProjectSmartPatchResultView = v.InferOutput<typeof candidateSchema>
export type ProjectSmartPatchResultTarget = v.InferOutput<typeof targetSchema>
export type ProjectSmartPatchResultsSnapshot = v.InferOutput<typeof snapshotSchema>
function validDisposition(target: {
  disposition: 'available' | 'blocked' | 'foreign-document' | 'orphaned'
  unavailableReason: string | null
}): boolean {
  return target.disposition === 'available'
    ? target.unavailableReason === null
    : target.unavailableReason !== null
}

export const isProjectSmartPatchGenerateOptions = (
  value: unknown,
): value is ProjectSmartPatchGenerateOptions => v.is(generateSchema, value)
export const isProjectSmartPatchAcceptRequest = (
  value: unknown,
): value is ProjectSmartPatchAcceptRequest => v.is(acceptSchema, value)
export const isProjectSmartPatchRasterAcceptRequest = (
  value: unknown,
): value is ProjectSmartPatchRasterAcceptRequest => v.is(rasterAcceptSchema, value)
export const isProjectSmartPatchDiscardRequest = (
  value: unknown,
): value is ProjectSmartPatchDiscardRequest => v.is(discardSchema, value)
export const isProjectSmartPatchDiscardResult = (
  value: unknown,
): value is ProjectSmartPatchDiscardResult => v.is(discardResultSchema, value)
export const isProjectSmartPatchCandidateExportRequest = (
  value: unknown,
): value is ProjectSmartPatchCandidateExportRequest => v.is(exportSchema, value)
export const isProjectSmartPatchGenerationTargetState = (
  value: unknown,
): value is ProjectSmartPatchGenerationTargetState => v.is(targetStateSchema, value)
export const isProjectSmartPatchResultsSnapshot = (
  value: unknown,
): value is ProjectSmartPatchResultsSnapshot => v.is(snapshotSchema, value)

export function isProjectSmartPatchGenerateResult(
  value: unknown,
): value is ProjectSmartPatchGenerateResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const { layerId, targetKind, ...result } = value as Record<string, unknown>
  return targetKind === 'smart-patch' && v.is(uuid, layerId) && isProjectGenerateResult(result)
}

function isSmartImageUrl(
  value: string,
  candidate: { candidateId: string; stagingSessionId: string },
): boolean {
  try {
    const url = new URL(value)
    const match =
      /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/[a-f0-9]{64}\/[a-f0-9]{64}\.png$/.exec(
        url.pathname,
      )
    return (
      url.protocol === 'igs-smart-staging:' &&
      url.hostname === 'asset' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      match?.[2] === candidate.stagingSessionId &&
      match[3] === candidate.candidateId
    )
  } catch {
    return false
  }
}

function isSmartThumbnailUrl(
  value: string,
  candidate: { candidateId: string; imageUrl: string; stagingSessionId: string },
): boolean {
  try {
    const url = new URL(value)
    const image = new URL(candidate.imageUrl)
    const match =
      /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9]{64})\/[a-f0-9]{64}\/[a-f0-9]{64}\.png$/.exec(
        url.pathname,
      )
    return (
      url.protocol === 'igs-smart-staging:' &&
      url.hostname === 'thumbnail' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      match?.[2] === candidate.stagingSessionId &&
      match[3] === candidate.candidateId &&
      image.pathname.startsWith(`/${match[1]}/${match[2]}/${match[3]}/${match[4]}/`)
    )
  } catch {
    return false
  }
}
