import type { IgsProjectDocumentV1, IgsSmartPatchLayerV1 } from './project-schema.js'

import { compileAnimaPromptWeighting } from './anima-prompt-weighting.js'
import { activePromptEmbeddingRefs } from './prompt-embeddings.js'
import { RegionalGuidanceGenerationError } from './regional-guidance.js'

export const ANIMA_SMART_PATCH_REGIONAL_CAPABILITY =
  'anima-smart-patch-regional-inpaint-v1' as const

/**
 * Invoke4875 compileCanvasGraph grafts INP before regions on the selected job. This is
 * source/settings preflight; actual opaque INP classification and raw alpha qualification remain
 * the CPU/frozen input owners. Undefined runtime support means metadata-only Main preflight;
 * renderer always supplies a boolean.
 */
export function getSmartPatchRegionalGenerationUnavailableReason(input: {
  document: Pick<IgsProjectDocumentV1, 'regionalGuidance'>
  iterations?: number
  patch:
    Pick<IgsSmartPatchLayerV1, 'boundingBox' | 'generationDraft' | 'internalResolution'> | undefined
  runtimeSupported?: boolean
  targetMode?: string | null
}): string | null {
  const regions = (input.document.regionalGuidance ?? []).filter((region) => region.enabled)
  if (regions.length === 0) {
    return null
  }
  if (input.targetMode != null && input.targetMode !== 'inpaint') {
    return 'Regional Smart Patch generation currently requires opaque-source INP.'
  }
  const { patch } = input
  if (!patch) {
    return 'Select the Smart Patch that owns this regional generation.'
  }
  const draft = patch.generationDraft
  if (draft.model?.baseModelFamily !== 'anima') {
    return 'Regional Guidance with Smart Patch currently requires an original Anima model.'
  }
  if ((input.iterations ?? 1) !== 1) {
    return 'Regional Smart Patch generation currently requires one static image.'
  }
  if (regions.length > 3) {
    return 'Regional Smart Patch generation supports at most three regions.'
  }
  const size = patch.internalResolution
  const bounds = patch.boundingBox
  if (
    ![size.width, size.height].every(
      (n) => Number.isInteger(n) && n >= 64 && n <= 512 && n % 8 === 0,
    ) ||
    ![bounds.width, bounds.height].every((n) => Number.isInteger(n) && n >= 1 && n <= 2048) ||
    bounds.width * bounds.height > 4_000_000
  ) {
    return 'Regional Smart Patch generation requires processing dimensions 64–512, divisible by 8, and bounded world dimensions.'
  }
  if (
    !['euler', 'heun'].includes(draft.sampling.animaMethod ?? '') ||
    draft.sampling.sampler !== null ||
    draft.sampling.scheduler !== null ||
    (draft.cfgRescale ?? 0) !== 0 ||
    draft.clipSkip !== undefined ||
    draft.vae !== null ||
    (draft.vaePrecision ?? 'Auto') !== 'Auto'
  ) {
    return 'Regional Smart Patch generation requires native Anima Euler or Heun and embedded Auto VAE.'
  }
  if (draft.loras.some((entry) => entry.enabled)) {
    return 'Regional Smart Patch generation does not support enabled LoRAs yet.'
  }
  if (regions.some((region) => (region.referenceImages?.length ?? 0) > 0)) {
    return 'Regional Smart Patch generation does not support regional reference images.'
  }
  const prompts = [draft.positivePrompt, draft.negativePrompt]
  for (const region of regions) {
    if (region.prompts?.positive) {
      prompts.push(region.prompts.positive)
    }
    prompts.push(
      region.prompts?.useGlobalNegativePrompt === false
        ? region.prompts.negative!
        : draft.negativePrompt,
    )
  }
  let total = 0
  try {
    for (const prompt of prompts) {
      if (!prompt || /[{}]/u.test(prompt.text)) {
        return 'Regional Smart Patch generation requires static prompts without braces.'
      }
      const bytes = new TextEncoder().encode(prompt.text).byteLength
      total += bytes
      if (bytes > 16 * 1024 || total > 128 * 1024) {
        return 'Regional Smart Patch prompts exceed the bounded text budget.'
      }
      if (activePromptEmbeddingRefs(prompt.text, prompt.embeddingRefs).length > 0) {
        return 'Regional Smart Patch generation does not support active textual inversion.'
      }
      compileAnimaPromptWeighting(prompt.text)
    }
  } catch {
    return 'A Regional Smart Patch prompt is invalid or unsupported.'
  }
  return input.runtimeSupported === false
    ? 'The image engine does not support Anima Smart Patch Regional Guidance. Repair or update the runtime.'
    : null
}

export function assertSmartPatchRegionalGenerationAvailable(
  input: Parameters<typeof getSmartPatchRegionalGenerationUnavailableReason>[0],
): void {
  const reason = getSmartPatchRegionalGenerationUnavailableReason(input)
  if (reason !== null) {
    throw new RegionalGuidanceGenerationError(reason)
  }
}
