import * as v from 'valibot'

/** Processing-pixel policy limit shared with the qualified CPU conditioning operation. */
export const SMART_PATCH_COHERENCE_EDGE_MAX = 1024

export const SmartPatchCoherenceSettingsSchema = v.strictObject({
  edgeSize: v.pipe(
    v.number(),
    v.safeInteger(),
    v.minValue(0),
    v.maxValue(SMART_PATCH_COHERENCE_EDGE_MAX),
  ),
  minimumDenoise: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1)),
  mode: v.picklist(['Gaussian Blur', 'Box Blur', 'Staged']),
})

export type SmartPatchCoherenceSettings = v.InferOutput<typeof SmartPatchCoherenceSettingsSchema>

/** Older packages read these original Invoke defaults without acquiring a new document member. */
export const SMART_PATCH_DEFAULT_COHERENCE_SETTINGS: Readonly<SmartPatchCoherenceSettings> =
  Object.freeze({ edgeSize: 16, minimumDenoise: 0, mode: 'Gaussian Blur' })

export function isSmartPatchCoherenceSettings(
  input: unknown,
): input is SmartPatchCoherenceSettings {
  return v.safeParse(SmartPatchCoherenceSettingsSchema, input).success
}

export function resolveSmartPatchCoherenceSettings(
  settings: SmartPatchCoherenceSettings | undefined,
): SmartPatchCoherenceSettings {
  return { ...(settings ?? SMART_PATCH_DEFAULT_COHERENCE_SETTINGS) }
}
