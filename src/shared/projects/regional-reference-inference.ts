import type { IgsProjectDocumentV1 } from './project-schema.js'

/** Finite consumers; these do not limit authoring or the empty-reference lane. */
export const REGIONAL_REFERENCE_INFERENCE_PROFILE =
  'invoke-illustrious-regional-reference-txt2img-v1' as const
export const REGIONAL_REFERENCE_IMG2IMG_PROFILE =
  'invoke-illustrious-regional-reference-img2img-v1' as const
export const REGIONAL_REFERENCE_OUTPAINT_PROFILE =
  'invoke-illustrious-regional-reference-outpaint-v1' as const
export const REGIONAL_REFERENCE_PROFILES = [
  REGIONAL_REFERENCE_INFERENCE_PROFILE,
  REGIONAL_REFERENCE_IMG2IMG_PROFILE,
  REGIONAL_REFERENCE_OUTPAINT_PROFILE,
] as const
export type RegionalReferenceInferenceProfile = (typeof REGIONAL_REFERENCE_PROFILES)[number]
export type RegionalReferenceInferenceMode = 'img2img' | 'outpaint' | 'txt2img'

/** Invoke 4875d965 compileCanvasGraph.ts grafts source initialization before the common adapter. */
export function regionalReferenceProfileForMode(
  mode: RegionalReferenceInferenceMode,
): RegionalReferenceInferenceProfile {
  switch (mode) {
    case 'img2img': {
      return REGIONAL_REFERENCE_IMG2IMG_PROFILE
    }
    case 'outpaint': {
      return REGIONAL_REFERENCE_OUTPAINT_PROFILE
    }
    case 'txt2img': {
      return REGIONAL_REFERENCE_INFERENCE_PROFILE
    }
  }
  throw new Error('The regional reference target mode is unsupported.')
}
export const REGIONAL_REFERENCE_MAX_IMAGES = 3
export const REGIONAL_REFERENCE_MAX_BYTES = 32 * 1024 * 1024
export const REGIONAL_REFERENCE_MAX_TOTAL_BYTES = 96 * 1024 * 1024
export const REGIONAL_REFERENCE_MAX_SIDE = 16_384
export const REGIONAL_REFERENCE_MAX_PIXELS = 64_000_000

/** Enabled owner, never mask coverage, determines whether its ordered images are consumed. */
export function hasEnabledRegionalReferenceImages(
  document: Pick<IgsProjectDocumentV1, 'regionalGuidance'>,
): boolean {
  return (document.regionalGuidance ?? []).some(
    (region) => region.enabled && (region.referenceImages?.length ?? 0) > 0,
  )
}
