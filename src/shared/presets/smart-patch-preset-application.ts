import * as v from 'valibot'

import type { IgsProjectDocumentV1 } from '../projects/project-schema.js'

import { isProjectGenerationDraftV1 } from '../projects/project-schema.js'
import { parsePresetApplicationPayload } from './preset-application.js'
import { PRESET_SECTION_KEYS, type PresetPayload, type PresetSectionKey } from './preset-schema.js'

/** A review addresses current owned settings, never accepted-result provenance or geometry. */
export interface SmartPatchPresetApplicationReviewRequest {
  documentId: string
  documentRevision: string
  layerId: string
}

export interface SmartPatchPresetApplicationReview extends SmartPatchPresetApplicationReviewRequest {
  generationDraft: IgsProjectDocumentV1['generationDraft']
  reviewToken: string
}

export interface SmartPatchPresetApplicationRequest extends SmartPatchPresetApplicationReviewRequest {
  payload: PresetPayload
  reviewToken: string
  selectedSections: PresetSectionKey[]
  sourcePresetId: string
}

const uuid = v.pipe(v.string(), v.uuid())
const reviewFields = { documentId: uuid, documentRevision: uuid, layerId: uuid }
const reviewRequestSchema = v.strictObject(reviewFields)
const reviewSchema = v.strictObject({
  ...reviewFields,
  generationDraft: v.custom<IgsProjectDocumentV1['generationDraft']>(isProjectGenerationDraftV1),
  reviewToken: uuid,
})
const applicationSchema = v.strictObject({
  ...reviewFields,
  payload: v.unknown(),
  reviewToken: uuid,
  selectedSections: v.array(v.picklist(PRESET_SECTION_KEYS)),
  sourcePresetId: uuid,
})

export function parseSmartPatchPresetApplicationReviewRequest(
  input: unknown,
): SmartPatchPresetApplicationReviewRequest {
  return v.parse(reviewRequestSchema, input)
}

export function parseSmartPatchPresetApplicationRequest(
  input: unknown,
): SmartPatchPresetApplicationRequest {
  const request = v.parse(applicationSchema, input)
  if (request.selectedSections.includes('size')) {
    throw new Error('Size cannot be applied to a Smart Patch.')
  }
  return {
    ...request,
    payload: parsePresetApplicationPayload(request.payload, request.selectedSections),
  }
}

/** A valid reply for another review owner must never populate the current Apply preview. */
export function isSmartPatchPresetApplicationReviewForRequest(
  input: unknown,
  request: SmartPatchPresetApplicationReviewRequest,
): input is SmartPatchPresetApplicationReview {
  return (
    v.is(reviewRequestSchema, request) &&
    v.is(reviewSchema, input) &&
    input.documentId === request.documentId &&
    input.documentRevision === request.documentRevision &&
    input.layerId === request.layerId
  )
}
