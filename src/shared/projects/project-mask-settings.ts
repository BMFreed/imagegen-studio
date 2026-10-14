import * as v from 'valibot'

/** Project-pixel policy bounds, not an inference capacity measurement. */
export const PROJECT_MASK_SETTINGS_MAX = 512

const MaskSettingValueSchema = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(0),
  v.maxValue(PROJECT_MASK_SETTINGS_MAX),
)

export const ProjectMaskSettingsSchema = v.strictObject({
  blur: MaskSettingValueSchema,
  padding: MaskSettingValueSchema,
})

export type ProjectMaskSettings = v.InferOutput<typeof ProjectMaskSettingsSchema>

/** Absence in older packages means these original defaults, without rewriting the document. */
export const PROJECT_MASK_DEFAULT_SETTINGS = Object.freeze({ blur: 16, padding: 8 })

export function resolveProjectMaskSettings(
  settings: ProjectMaskSettings | undefined,
): ProjectMaskSettings {
  return { ...(settings ?? PROJECT_MASK_DEFAULT_SETTINGS) }
}
