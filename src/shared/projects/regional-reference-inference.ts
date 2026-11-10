import type { IgsProjectDocumentV1 } from './project-schema.js'

/** Finite first consumer; these do not limit authoring or the empty-reference lane. */
export const REGIONAL_REFERENCE_INFERENCE_PROFILE =
  'invoke-illustrious-regional-reference-txt2img-v1' as const
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
