import * as v from 'valibot'

import { applyPresetSections, includedPresetSections } from '../presets/preset-application.js'
import { parsePresetPayload, type PresetPayload } from '../presets/preset-schema.js'
import {
  IGS_SAFETY_CEILINGS,
  type IgsProjectDocumentV1,
  parseProjectDocumentV1,
} from './project-schema.js'

export interface ProjectCreateInput {
  /** Selected reusable settings only; no stored preset identity or live link. */
  generationPayload?: PresetPayload
  height: number
  title: string
  width: number
}

const DimensionSchema = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(1),
  v.maxValue(IGS_SAFETY_CEILINGS.rasterDimension),
)
const CreateSchema = v.strictObject({
  generationPayload: v.optional(v.unknown()),
  height: DimensionSchema,
  title: v.pipe(
    v.string(),
    v.maxBytes(IGS_SAFETY_CEILINGS.titleBytes),
    v.transform((title) => title.trim()),
    v.nonEmpty(),
  ),
  width: DimensionSchema,
})

/** Main and IPC share one strict authoring boundary; no resource availability is inferred here. */
export function parseProjectCreateInput(input: unknown): ProjectCreateInput {
  const parsed = v.parse(CreateSchema, input)
  const generationPayload =
    parsed.generationPayload === undefined
      ? undefined
      : parseTextToImagePayload(parsed.generationPayload)
  if (
    generationPayload?.size !== undefined &&
    (generationPayload.size.width !== parsed.width ||
      generationPayload.size.height !== parsed.height)
  ) {
    throw new Error('Preset Size must match the initial generation area dimensions.')
  }
  return {
    height: parsed.height,
    title: parsed.title,
    width: parsed.width,
    ...(generationPayload === undefined ? {} : { generationPayload }),
  }
}

export function isProjectCreateInput(input: unknown): input is ProjectCreateInput {
  try {
    parseProjectCreateInput(input)
    return true
  } catch {
    return false
  }
}

/** Reuse Apply's pure projection before the new document has ever been written or indexed. */
export function initializeProjectGenerationPayload(
  document: IgsProjectDocumentV1,
  input?: PresetPayload,
): IgsProjectDocumentV1 {
  const payload =
    input === undefined
      ? undefined
      : parseProjectCreateInput({
          generationPayload: input,
          height: document.primaryBbox.height,
          title: document.title,
          width: document.primaryBbox.width,
        }).generationPayload
  const sections = payload === undefined ? [] : includedPresetSections(payload)
  return parseProjectDocumentV1({
    ...document,
    ...(payload !== undefined && sections.length > 0
      ? applyPresetSections(document, payload, sections)
      : {}),
  })
}

function parseTextToImagePayload(input: unknown): PresetPayload {
  if (input !== null && typeof input === 'object' && Object.hasOwn(input, 'denoisingStrength')) {
    throw new Error('New Project only accepts Text to Image preset settings.')
  }
  return parsePresetPayload(input)
}
