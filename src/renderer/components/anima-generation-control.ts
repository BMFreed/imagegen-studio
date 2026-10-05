import { isAnimaSamplingMethod } from '../../shared/projects/anima-sampling-method.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

export function animaEngineReason(supported: boolean | null | undefined): string | null {
  return supported === true
    ? null
    : supported === null
      ? 'Checking image engine support for Anima.'
      : 'The current image engine does not support Anima generation. Install a qualified image engine.'
}

/** Renderer advice only. Main validates the captured draft, exact resources and native plan. */
export function animaDraftGenerationReason(
  draft: IgsProjectDocumentV1['generationDraft'],
): string | null {
  if (draft.positivePrompt.embeddingRefs.length || draft.negativePrompt.embeddingRefs.length) {
    return 'Prompt embeddings are not supported by Anima. Remove their activation tokens to generate.'
  }
  if (draft.vae !== null) {
    return 'Anima requires its verified companion VAE. Reset the external VAE selection.'
  }
  if (
    draft.clipSkip !== undefined ||
    (draft.cfgRescale !== undefined && draft.cfgRescale !== 0) ||
    (draft.vaePrecision !== undefined && draft.vaePrecision !== 'Auto')
  ) {
    return 'Anima does not support CLIP Skip, nonzero CFG Rescale or manual VAE precision. Reset these settings to generate.'
  }
  if (!isAnimaSamplingMethod(draft.sampling.animaMethod)) {
    return 'Choose a native Anima sampling method before generating.'
  }
  if (draft.sampling.steps === null || draft.sampling.cfgScale === null) {
    return 'Set Steps and CFG before generating with Anima.'
  }
  return null
}
