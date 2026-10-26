import * as v from 'valibot'

import type { ProjectAcceptedResultTarget } from './project-accepted-results.js'
import type { IgsSmartPatchGenerationProvenanceV1 } from './project-schema.js'

import { IGS_SAFETY_CEILINGS, isSmartPatchGenerationConfigurationV1 } from './project-schema.js'

/** Current containment and exact accepted bytes, never historical provenance target IDs. */
export interface SmartResultComparisonRequest {
  assetSha256: string
  documentId: string
  documentRevision: string
  owner: ProjectAcceptedResultTarget
}

export interface SmartResultComparisonData extends SmartResultComparisonRequest {
  currentMode: 'img2img' | 'outpaint' | 'txt2img' | null
  generationConfiguration: IgsSmartPatchGenerationProvenanceV1['generationConfiguration']
  modeUnavailableReason: string | null
  resultId: string
}

const uuid = v.pipe(v.string(), v.uuid())
const ownerSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('raster'), layerId: uuid }),
  v.pipe(
    v.strictObject({ kind: v.literal('smart-patch-variant'), layerId: uuid, variantId: uuid }),
    v.check((owner) => owner.layerId !== owner.variantId),
  ),
])
const requestFields = {
  assetSha256: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
  documentId: uuid,
  documentRevision: uuid,
  owner: ownerSchema,
}
const requestSchema = v.strictObject(requestFields)
const dataSchema = v.pipe(
  v.strictObject({
    ...requestFields,
    currentMode: v.nullable(v.picklist(['img2img', 'outpaint', 'txt2img'])),
    generationConfiguration: v.custom<
      IgsSmartPatchGenerationProvenanceV1['generationConfiguration']
    >(isSmartPatchGenerationConfigurationV1),
    modeUnavailableReason: v.nullable(
      v.pipe(
        v.string(),
        v.nonEmpty(),
        v.maxBytes(IGS_SAFETY_CEILINGS.titleBytes),
        v.check((value) => value.trim().length > 0),
      ),
    ),
    resultId: uuid,
  }),
  v.check((data) => data.resultId === smartResultComparisonResultId(data.owner)),
  v.check((data) =>
    data.currentMode === null
      ? data.modeUnavailableReason !== null
      : data.modeUnavailableReason === null,
  ),
)

export function smartResultComparisonResultId(owner: ProjectAcceptedResultTarget): string {
  return owner.kind === 'raster' ? owner.layerId : owner.variantId
}

export function isSmartResultComparisonRequest(
  input: unknown,
): input is SmartResultComparisonRequest {
  return v.is(requestSchema, input)
}

export function isSmartResultComparisonData(input: unknown): input is SmartResultComparisonData {
  return v.is(dataSchema, input)
}

export function parseSmartResultComparisonData(input: unknown): SmartResultComparisonData {
  return v.parse(dataSchema, input)
}

/** Reject valid but crossed replies as well as malformed or private transport data. */
export function isSmartResultComparisonDataForRequest(
  input: unknown,
  request: SmartResultComparisonRequest,
): input is SmartResultComparisonData {
  return (
    isSmartResultComparisonRequest(request) &&
    isSmartResultComparisonData(input) &&
    input.documentId === request.documentId &&
    input.documentRevision === request.documentRevision &&
    input.assetSha256 === request.assetSha256 &&
    input.owner.kind === request.owner.kind &&
    input.owner.layerId === request.owner.layerId &&
    input.resultId === smartResultComparisonResultId(request.owner)
  )
}
