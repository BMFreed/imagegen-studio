import * as v from 'valibot'

import type { ProjectAcceptedResultTarget } from './project-accepted-results.js'

import { type PresetPayload, PresetPayloadSchema } from '../presets/preset-schema.js'

/** Current document containment, never the historical target retained in provenance. */
export type SmartResultPresetOwner = ProjectAcceptedResultTarget

/** A source copy only. Size, Seed and every non-preset provenance group are forbidden. */
export type SmartResultPresetPayload = Pick<
  PresetPayload,
  'cfgRescale' | 'denoisingStrength' | 'loras' | 'vae' | 'vaePrecision'
> &
  Required<Pick<PresetPayload, 'guidance' | 'model' | 'negativePrompt' | 'prompt' | 'sampling'>> & {
    seed?: never
    size?: never
  }

export interface SmartResultPresetRequest {
  assetSha256: string
  documentId: string
  documentRevision: string
  owner: SmartResultPresetOwner
}

export interface SmartResultPresetData extends SmartResultPresetRequest {
  payload: SmartResultPresetPayload
  resultId: string
  workflow: 'smartPatch'
}

const uuid = v.pipe(v.string(), v.uuid())
const sha256 = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))
const ownerSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('raster'), layerId: uuid }),
  v.pipe(
    v.strictObject({ kind: v.literal('smart-patch-variant'), layerId: uuid, variantId: uuid }),
    v.check((owner) => owner.layerId !== owner.variantId),
  ),
])
const requestFields = {
  assetSha256: sha256,
  documentId: uuid,
  documentRevision: uuid,
  owner: ownerSchema,
}
const requestSchema = v.strictObject(requestFields)
const payloadKeys = new Set([
  'cfgRescale',
  'denoisingStrength',
  'guidance',
  'loras',
  'model',
  'negativePrompt',
  'prompt',
  'sampling',
  'vae',
  'vaePrecision',
])
const requiredPayloadKeys = ['prompt', 'negativePrompt', 'model', 'sampling', 'guidance'] as const
const payloadSchema = v.custom<SmartResultPresetPayload>(isSmartResultPresetPayload)
const dataSchema = v.pipe(
  v.strictObject({
    ...requestFields,
    payload: payloadSchema,
    resultId: uuid,
    workflow: v.literal('smartPatch'),
  }),
  v.check((data) => data.resultId === smartResultPresetResultId(data.owner)),
)

/** Reuses strict preset field validation without admitting all optional preset sections. */
export function isSmartResultPresetPayload(input: unknown): input is SmartResultPresetPayload {
  if (
    !v.is(PresetPayloadSchema, input) ||
    Object.keys(input).some((key) => !payloadKeys.has(key)) ||
    requiredPayloadKeys.some((key) => !Object.hasOwn(input, key) || input[key] === undefined)
  ) {
    return false
  }
  const { model, negativePrompt, prompt, sampling } = input
  if (!model || !sampling || !prompt || !negativePrompt) {
    return false
  }
  if (model.baseModelFamily === 'anima') {
    return (
      model.predictionType === null &&
      !Object.hasOwn(sampling, 'sampler') &&
      !Object.hasOwn(sampling, 'scheduler') &&
      sampling.animaMethod !== undefined &&
      !Object.hasOwn(input, 'vae') &&
      prompt.embeddingRefs.length === 0 &&
      negativePrompt.embeddingRefs.length === 0 &&
      (input.cfgRescale === undefined || input.cfgRescale === 0) &&
      (input.vaePrecision === undefined || input.vaePrecision === 'Auto') &&
      (input.loras ?? []).every(
        ({ enabled, resource }) =>
          !enabled || (resource.baseModelFamily === 'anima' && resource.predictionType === null),
      )
    )
  }
  return (
    model.baseModelFamily === 'illustrious' &&
    model.predictionType !== null &&
    !Object.hasOwn(sampling, 'animaMethod') &&
    sampling.sampler !== undefined &&
    sampling.scheduler !== undefined &&
    (input.vae == null ||
      (input.vae.baseModelFamily === 'illustrious' && input.vae.predictionType === null)) &&
    (input.loras ?? []).every(
      ({ enabled, resource }) => !enabled || resource.baseModelFamily === 'illustrious',
    )
  )
}

export function smartResultPresetResultId(owner: SmartResultPresetOwner): string {
  return owner.kind === 'raster' ? owner.layerId : owner.variantId
}

export function isSmartResultPresetOwner(input: unknown): input is SmartResultPresetOwner {
  return v.is(ownerSchema, input)
}

export function isSmartResultPresetRequest(input: unknown): input is SmartResultPresetRequest {
  return v.is(requestSchema, input)
}

export function parseSmartResultPresetRequest(input: unknown): SmartResultPresetRequest {
  return v.parse(requestSchema, input)
}

export function parseSmartResultPresetPayload(input: unknown): SmartResultPresetPayload {
  return v.parse(payloadSchema, input)
}

export function isSmartResultPresetData(input: unknown): input is SmartResultPresetData {
  return v.is(dataSchema, input)
}

export function parseSmartResultPresetData(input: unknown): SmartResultPresetData {
  return v.parse(dataSchema, input)
}

/** The preload/renderer guard binds a valid source reply to the exact captured request. */
export function isSmartResultPresetDataForRequest(
  input: unknown,
  request: SmartResultPresetRequest,
): input is SmartResultPresetData {
  return (
    isSmartResultPresetRequest(request) &&
    isSmartResultPresetData(input) &&
    input.documentId === request.documentId &&
    input.documentRevision === request.documentRevision &&
    input.assetSha256 === request.assetSha256 &&
    input.owner.kind === request.owner.kind &&
    input.owner.layerId === request.owner.layerId &&
    input.resultId === smartResultPresetResultId(request.owner)
  )
}
