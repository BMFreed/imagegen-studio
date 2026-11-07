import type { IgsProjectDocumentV1 } from './project-schema.js'

import {
  type GenerationBatchPlan,
  GenerationBatchPlanError,
  planGenerationBatch,
} from './generation-batch-plan.js'
import { GENERATION_BATCH_JOB_LIMIT } from './generation-batch-policy.js'
import { getEffectiveDynamicPromptSettings } from './generation-dynamic-settings.js'
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

/**
 * InvokeAI a61ac4fb's invocationSubmit → submissionApi → promptBatch expands global positive before
 * batching; addRegionalGuidance keeps regional texts static. Reuse Studio's planner and its
 * prefix/seed policies, retaining the existing aggregate admission bound.
 */
export function planInvokeRegionalGenerationBatch(
  input: Pick<IgsProjectDocumentV1, 'generationDraft' | 'regionalGuidance'>,
  iterations: number,
  baseSeed = 0,
): GenerationBatchPlan {
  const draft = input.generationDraft
  const staticTexts = [
    draft.negativePrompt.text,
    ...(input.regionalGuidance ?? [])
      .filter((region) => region.enabled)
      .flatMap((region) => [
        region.prompts?.positive?.text ?? '',
        region.prompts?.useGlobalNegativePrompt === false
          ? (region.prompts.negative?.text ?? '')
          : draft.negativePrompt.text,
      ]),
  ]
  if (staticTexts.some((text) => /[{}]/u.test(text))) {
    throw new GenerationBatchPlanError(
      'PROMPT_INVALID',
      'Regional Guidance requires static global negative and regional prompts without braces.',
    )
  }
  const dynamic = getEffectiveDynamicPromptSettings(draft.dynamicPrompt)
  const plan = planGenerationBatch({
    baseSeed,
    iterations,
    maxJobs: GENERATION_BATCH_JOB_LIMIT,
    maxPrompts: dynamic.maxPrompts,
    negativePrompt: draft.negativePrompt.text,
    positivePrompt: draft.positivePrompt.text,
    seedBehavior: dynamic.seedBehavior,
  })
  if (plan.items.some((item) => /[{}]/u.test(item.prompts.positive))) {
    throw new GenerationBatchPlanError(
      'PROMPT_INVALID',
      'Regional Guidance requires concrete global positive prompts without literal braces.',
    )
  }
  return plan
}

/** Use concrete selected text and the existing literal/ref resolver, including renderer proxies. */
export function hasActiveGlobalPromptEmbeddings(
  input: Pick<IgsProjectDocumentV1, 'generationDraft'>,
  concretePositiveTexts?: readonly string[],
): boolean {
  const positives =
    concretePositiveTexts ??
    planInvokeRegionalGenerationBatch(input, 1).items.map((item) => item.prompts.positive)
  return [
    ...positives.map((text) => ({ ...input.generationDraft.positivePrompt, text })),
    input.generationDraft.negativePrompt,
  ].some(
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
 * masks or pooled text are chosen here. Opaque input follows compileCanvasGraph.ts's
 * getCanvasValidationReasons → graftImageToImage → addRegionalGuidance order, with Studio's
 * separately qualified image subset; omitted target mode preserves pre-composition Main checks.
 */
export function getInvokeRegionalGenerationUnavailableReason(input: {
  cfgRescaleSupported?: boolean | null
  document: RegionalDocument
  dpmSupported?: boolean | null
  embeddingsSupported?: boolean | null
  img2imgCfgRescaleSupported?: boolean | null
  img2imgDpmpp2mSupported?: boolean | null
  img2imgEulerASupported?: boolean | null
  img2imgSupported?: boolean | null
  initializationSupported?: boolean | null
  iterations: number
  loraSupported?: boolean | null
  runtimeSupported?: boolean | null
  targetMode?: 'img2img' | 'outpaint' | 'txt2img' | null
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
  if (input.targetMode === 'outpaint') {
    return 'Regional Guidance does not support partially transparent Current Canvas input. Use an empty or fully opaque generation area.'
  }
  const img2img = input.targetMode === 'img2img'
  if (
    img2img &&
    (!(
      ((draft.sampling.sampler === 'Euler' || draft.sampling.sampler === 'Euler a') &&
        draft.sampling.scheduler === 'Normal') ||
      (draft.sampling.sampler === 'DPM++ 2M' &&
        (draft.sampling.scheduler === 'Normal' || draft.sampling.scheduler === 'Karras'))
    ) ||
      draft.vae !== null ||
      draft.vaePrecision !== 'FP16')
  ) {
    return 'Regional img2img requires Euler or Euler a with Normal, or DPM++ 2M with Normal or Karras, and Embedded FP16 VAE.'
  }
  if (!(
    ((draft.sampling.sampler === 'Euler' || draft.sampling.sampler === 'Euler a') &&
      draft.sampling.scheduler === 'Normal') ||
    (draft.sampling.sampler === 'DPM++ 2M' &&
      (draft.sampling.scheduler === 'Normal' || draft.sampling.scheduler === 'Karras'))
  )) {
    return 'Regional Guidance requires Euler or Euler a with the Normal scheduler, or DPM++ 2M with Normal or Karras.'
  }
  if (regions.some((region) => (region.referenceImages?.length ?? 0) > 0)) {
    return 'Remove reference images from enabled regions before generating with Regional Guidance.'
  }
  const { cfgScale, steps } = draft.sampling
  if (cfgScale === null || !Number.isFinite(cfgScale) || cfgScale <= 1 || cfgScale > 30) {
    return 'Regional Guidance requires CFG greater than 1 and no greater than 30.'
  }
  const cfgRescale = draft.cfgRescale ?? 0
  if (
    typeof cfgRescale !== 'number' ||
    !Number.isFinite(cfgRescale) ||
    cfgRescale < 0 ||
    cfgRescale > 0.99
  ) {
    return 'Regional Guidance requires CFG Rescale from 0 to 0.99.'
  }
  if (steps === null || !Number.isSafeInteger(steps) || steps < 1 || steps > 200) {
    return 'Regional Guidance requires an integer from 1 to 200 for Steps.'
  }
  const strength = draft.sampling.denoisingStrength
  if (
    img2img &&
    (typeof strength !== 'number' || !Number.isFinite(strength) || strength < 0 || strength > 1)
  ) {
    return 'Set Denoising Strength from 0 to 1 before generating with Regional Guidance from this raster input.'
  }
  if (regions.length > 3) {
    return 'Regional Guidance supports at most 3 enabled regions per generation.'
  }
  if (
    !Number.isSafeInteger(input.iterations) ||
    input.iterations < 1 ||
    input.iterations > GENERATION_BATCH_JOB_LIMIT
  ) {
    return `Regional Guidance supports from 1 to ${GENERATION_BATCH_JOB_LIMIT} images per click.`
  }
  let plan: GenerationBatchPlan
  try {
    plan = planInvokeRegionalGenerationBatch(input.document, input.iterations)
  } catch (error) {
    if (error instanceof GenerationBatchPlanError) {
      return error.message
    }
    throw error
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
  if (img2img) {
    if (input.img2imgSupported === undefined || input.img2imgSupported === null) {
      return 'Checking image engine support for opaque img2img with Regional Guidance. Repair or update the runtime if support remains unavailable.'
    }
    if (input.img2imgSupported !== true) {
      return 'The current image engine does not support opaque img2img with Regional Guidance. Repair or update the runtime.'
    }
  }
  if (img2img && draft.sampling.sampler === 'Euler a') {
    if (input.img2imgEulerASupported === undefined || input.img2imgEulerASupported === null) {
      return 'Checking image engine support for Euler a with opaque regional img2img. Repair or update the runtime if support remains unavailable.'
    }
    if (input.img2imgEulerASupported !== true) {
      return 'The current image engine does not support Euler a with opaque regional img2img. Repair or update the runtime.'
    }
  }
  if (img2img && draft.sampling.sampler === 'DPM++ 2M') {
    if (input.img2imgDpmpp2mSupported === undefined || input.img2imgDpmpp2mSupported === null) {
      return 'Checking image engine support for DPM++ 2M with opaque regional img2img. Repair or update the runtime if support remains unavailable.'
    }
    if (input.img2imgDpmpp2mSupported !== true) {
      return 'The current image engine does not support DPM++ 2M with opaque regional img2img. Repair or update the runtime.'
    }
  }
  if (cfgRescale !== 0) {
    if (input.cfgRescaleSupported === undefined || input.cfgRescaleSupported === null) {
      return 'Checking image engine support for CFG Rescale with Regional Guidance. Repair or update the runtime if support remains unavailable.'
    }
    if (input.cfgRescaleSupported !== true) {
      return 'The current image engine does not support CFG Rescale with Regional Guidance. Repair or update the runtime.'
    }
  }
  if (img2img && cfgRescale !== 0) {
    if (
      input.img2imgCfgRescaleSupported === undefined ||
      input.img2imgCfgRescaleSupported === null
    ) {
      return 'Checking image engine support for CFG Rescale with opaque regional img2img. Repair or update the runtime if support remains unavailable.'
    }
    if (input.img2imgCfgRescaleSupported !== true) {
      return 'The current image engine does not support CFG Rescale with opaque regional img2img. Repair or update the runtime.'
    }
  }
  if (
    draft.sampling.sampler === 'DPM++ 2M' &&
    !img2img &&
    !(input.targetMode == null && input.img2imgDpmpp2mSupported === true)
  ) {
    if (input.dpmSupported === undefined || input.dpmSupported === null) {
      return 'Checking image engine support for Regional Guidance with DPM++ 2M. Repair or update the runtime if support remains unavailable.'
    }
    if (input.dpmSupported !== true) {
      return 'The current image engine does not support Regional Guidance with DPM++ 2M. Repair or update the runtime.'
    }
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
  if (
    hasActiveGlobalPromptEmbeddings(
      input.document,
      plan.items.map((item) => item.prompts.positive),
    )
  ) {
    if (input.embeddingsSupported === undefined || input.embeddingsSupported === null) {
      return 'Checking image engine support for global embeddings with Regional Guidance. Repair or update the runtime if support remains unavailable.'
    }
    if (input.embeddingsSupported !== true) {
      return 'The current image engine does not support global embeddings with Regional Guidance. Repair or update the runtime.'
    }
  }
  return null
}
