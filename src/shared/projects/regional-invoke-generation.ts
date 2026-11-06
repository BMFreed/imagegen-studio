import type { IgsProjectDocumentV1 } from './project-schema.js'

import { GENERATION_BATCH_JOB_LIMIT } from './generation-batch-policy.js'
import { activePromptEmbeddingRefs } from './prompt-embeddings.js'

type RegionalDocument = Pick<
  IgsProjectDocumentV1,
  'generationDraft' | 'primaryBbox' | 'regionalGuidance'
>

export function hasEnabledRegionalGuidance(
  input: Pick<IgsProjectDocumentV1, 'regionalGuidance'>,
): boolean {
  return input.regionalGuidance?.some((region) => region.enabled) ?? false
}

/** Use the existing literal/ref resolver for both plain Main values and renderer proxies. */
export function hasActiveGlobalPromptEmbeddings(
  input: Pick<IgsProjectDocumentV1, 'generationDraft'>,
): boolean {
  return [input.generationDraft.positivePrompt, input.generationDraft.negativePrompt].some(
    (prompt) =>
      activePromptEmbeddingRefs(
        prompt.text,
        prompt.embeddingRefs.map((ref) => ({ resource: { ...ref.resource }, token: ref.token })),
      ).length > 0,
  )
}

/**
 * Advisory for the finite Current Canvas route; Main verifies pixels, exact local resources and
 * runtime again. InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd sources consulted:
 * app/invocations/text_encoder/compel.py, app/invocations/sd/denoise_latents.py,
 * backend/stable_diffusion/diffusion/{shared_invokeai_diffusion,regional_prompt_data}.py and
 * backend/stable_diffusion/schedulers/schedulers.py. Selected VAE/precision follows graph.ts,
 * app/invocations/model.py and app/invocations/vae/latents_to_image.py at that same revision. These
 * bounds describe our qualified adapter, not the full set of configurations Invoke supports. No
 * masks or pooled text are chosen here.
 */
export function getInvokeRegionalGenerationUnavailableReason(input: {
  document: RegionalDocument
  embeddingsSupported?: boolean | null
  initializationSupported?: boolean | null
  iterations: number
  loraSupported?: boolean | null
  runtimeSupported?: boolean | null
  vaeSupported?: boolean | null
}): string | null {
  const regions = input.document.regionalGuidance?.filter((region) => region.enabled) ?? []
  if (regions.length === 0) {
    return null
  }
  const draft = input.document.generationDraft
  if (
    draft.model?.kind !== 'checkpoint' ||
    draft.model.baseModelFamily !== 'illustrious' ||
    draft.model.predictionType !== 'epsilon'
  ) {
    return 'Regional Guidance requires an Illustrious epsilon model on Current Canvas.'
  }
  if (
    (draft.sampling.sampler !== 'Euler' && draft.sampling.sampler !== 'Euler a') ||
    draft.sampling.scheduler !== 'Normal'
  ) {
    return 'Regional Guidance requires Euler or Euler a with the Normal scheduler.'
  }
  if (regions.some((region) => (region.referenceImages?.length ?? 0) > 0)) {
    return 'Remove reference images from enabled regions before generating with Regional Guidance.'
  }
  const { cfgScale, steps } = draft.sampling
  if (cfgScale === null || !Number.isFinite(cfgScale) || cfgScale <= 1 || cfgScale > 30) {
    return 'Regional Guidance requires CFG greater than 1 and no greater than 30.'
  }
  if ((draft.cfgRescale ?? 0) !== 0) {
    return 'Regional Guidance requires CFG Rescale set to 0.'
  }
  if (steps === null || !Number.isSafeInteger(steps) || steps < 1 || steps > 200) {
    return 'Regional Guidance requires an integer from 1 to 200 for Steps.'
  }
  if (regions.length > 3) {
    return 'Regional Guidance supports at most 3 enabled regions per generation.'
  }
  const globalPrompts = [draft.positivePrompt, draft.negativePrompt]
  const effectiveTexts = [
    ...globalPrompts.map((prompt) => prompt.text),
    ...regions.flatMap((region) => [
      region.prompts?.positive?.text ?? '',
      region.prompts?.useGlobalNegativePrompt === false
        ? (region.prompts.negative?.text ?? '')
        : draft.negativePrompt.text,
    ]),
  ]
  if (effectiveTexts.some((text) => /[{}]/u.test(text))) {
    return 'Regional Guidance requires static global and regional prompts without braces.'
  }
  if (
    !Number.isSafeInteger(input.iterations) ||
    input.iterations < 1 ||
    input.iterations > GENERATION_BATCH_JOB_LIMIT
  ) {
    return `Regional Guidance supports from 1 to ${GENERATION_BATCH_JOB_LIMIT} images per click.`
  }
  const { height, width } = input.document.primaryBbox
  if (
    [height, width].some(
      (dimension) =>
        !Number.isSafeInteger(dimension) ||
        dimension < 8 ||
        dimension > 2048 ||
        dimension % 8 !== 0,
    ) ||
    height * width > 4_000_000
  ) {
    return 'Regional Guidance requires dimensions from 8 to 2048, divisible by 8, and at most 4,000,000 pixels.'
  }
  if (input.runtimeSupported === undefined || input.runtimeSupported === null) {
    return 'Checking image engine support for Regional Guidance. Repair or update the runtime if support remains unavailable.'
  }
  if (input.runtimeSupported !== true) {
    return 'The current image engine does not support Regional Guidance. Repair or update the runtime.'
  }
  if (draft.vae !== null || (draft.vaePrecision ?? 'Auto') !== 'FP16') {
    if (input.vaeSupported === undefined || input.vaeSupported === null) {
      return 'Checking image engine support for selected VAE and precision with Regional Guidance. Repair or update the runtime if support remains unavailable.'
    }
    if (input.vaeSupported !== true) {
      return 'The current image engine does not support selected VAE and precision with Regional Guidance. Repair or update the runtime.'
    }
  }
  if (draft.loras.some((lora) => lora.enabled)) {
    if (input.loraSupported === undefined || input.loraSupported === null) {
      return 'Checking image engine support for global LoRAs with Regional Guidance. Repair or update the runtime if support remains unavailable.'
    }
    if (input.loraSupported !== true) {
      return 'The current image engine does not support global LoRAs with Regional Guidance. Repair or update the runtime.'
    }
  }
  if (draft.sampling.sampler === 'Euler a') {
    if (input.initializationSupported === undefined || input.initializationSupported === null) {
      return 'Checking image engine support for Regional Guidance with Euler a. Repair or update the runtime if support remains unavailable.'
    }
    if (input.initializationSupported !== true) {
      return 'The current image engine does not support Regional Guidance with Euler a. Repair or update the runtime.'
    }
  }
  if (hasActiveGlobalPromptEmbeddings(input.document)) {
    if (input.embeddingsSupported === undefined || input.embeddingsSupported === null) {
      return 'Checking image engine support for global embeddings with Regional Guidance. Repair or update the runtime if support remains unavailable.'
    }
    if (input.embeddingsSupported !== true) {
      return 'The current image engine does not support global embeddings with Regional Guidance. Repair or update the runtime.'
    }
  }
  return null
}
