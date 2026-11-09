import { isAnimaSamplingMethod } from '../../shared/projects/anima-sampling-method.js'
import type { GenerationQueueEntry } from '../../shared/projects/generation-queue-manager.js'
import type { ProjectGenerationActionState } from '../../shared/projects/project-generation-actions.js'

type RetryState = Pick<
  ProjectGenerationActionState,
  | 'animaOutpaintSupported'
  | 'animaRegionalImg2ImgSupported'
  | 'animaRegionalLoraSupported'
  | 'animaRegionalOutpaintSupported'
  | 'animaRegionalSamplingSupported'
  | 'animaRegionalSupported'
  | 'animaSmartPatchRegionalImg2ImgSupported'
  | 'animaSmartPatchRegionalOutpaintSupported'
  | 'animaSmartPatchRegionalSupported'
  | 'animaSmartPatchRegionalTxt2ImgSupported'
  | 'animaSupported'
  | 'outpaintSupported'
  | 'regionalCfgRescaleSupported'
  | 'regionalDpmSupported'
  | 'regionalImg2ImgCfgRescaleSupported'
  | 'regionalImg2ImgDpmpp2mSupported'
  | 'regionalImg2ImgEulerASupported'
  | 'regionalImg2ImgSupported'
  | 'regionalImg2ImgVaeSupported'
  | 'regionalInvokeInitializationSupported'
  | 'regionalLoraSupported'
  | 'regionalOutpaintSupported'
  | 'regionalSupported'
  | 'regionalVaeSupported'
  | 'regionalVPredictionImageSupported'
  | 'regionalVPredictionSamplingSupported'
  | 'regionalVPredictionSupported'
  | 'smartPatchSupported'
>

/** Advisory worker gate follows the frozen operation; Main still verifies exact local resources. */
export function generationQueueRetryReason(
  operation: GenerationQueueEntry['operation'],
  state: RetryState | null,
  frozenSampler?: string | null,
  requiresRegionalLora = false,
  requiresRegionalVae = false,
  frozenCfgRescale = 0,
  frozenAnimaMethod?: string | null,
  frozenPredictionType?: string | null,
  requiresSmartPatchRegional = false,
  requiresSmartPatchRegionalOutpaint = false,
  requiresSmartPatchRegionalTxt2Img = false,
  requiresSmartPatchRegionalImg2Img = false,
): string | null {
  if (
    operation === 'anima-regional-txt2img' ||
    operation === 'anima-regional-img2img' ||
    operation === 'anima-regional-outpaint'
  ) {
    if (state === null) {
      return 'Checking image engine support for this frozen Anima Regional Guidance job.'
    }
    if (state.animaRegionalSupported !== true) {
      return 'The current image engine does not support Anima Regional Guidance. Repair or update the runtime.'
    }
    if (requiresRegionalLora && state.animaRegionalLoraSupported !== true) {
      return 'The current image engine does not support global LoRAs with this frozen Anima Regional Guidance job. Repair or update the runtime.'
    }
    if (operation === 'anima-regional-outpaint' && state.animaRegionalOutpaintSupported !== true) {
      return 'The current image engine does not support this frozen Anima Regional Guidance outpaint job. Repair or update the runtime.'
    }
    if (operation === 'anima-regional-img2img' && state.animaRegionalImg2ImgSupported !== true) {
      return 'The current image engine does not support this frozen Anima Regional Guidance image job. Repair or update the runtime.'
    }
    if (frozenAnimaMethod != null && !isAnimaSamplingMethod(frozenAnimaMethod)) {
      return 'This frozen Anima Regional Guidance sampling method is unsupported.'
    }
    return frozenAnimaMethod != null &&
      frozenAnimaMethod !== 'euler' &&
      state.animaRegionalSamplingSupported !== true
      ? 'The current image engine does not support this frozen Anima Regional Guidance sampling method. Repair or update the runtime.'
      : null
  }
  if (
    operation === 'illustrious-regional-txt2img' ||
    operation === 'illustrious-regional-img2img' ||
    operation === 'illustrious-regional-outpaint'
  ) {
    if (state === null) {
      return 'Checking image engine support for this frozen Regional Guidance job.'
    }
    if (state.regionalSupported !== true) {
      return 'The current image engine does not support Regional Guidance. Repair or update the runtime.'
    }
    if (frozenPredictionType === 'v_prediction') {
      if (!['DPM++ 2M', 'Euler', 'Euler a'].includes(frozenSampler ?? '')) {
        return operation === 'illustrious-regional-txt2img'
          ? 'This frozen regional v_prediction job requires a supported TXT sampling method.'
          : 'This frozen regional v_prediction job requires a supported image sampling method.'
      }
      if (state.regionalVPredictionSupported !== true) {
        return 'The current image engine does not support this frozen Regional Guidance v_prediction job. Repair or update the runtime.'
      }
      if (
        operation !== 'illustrious-regional-txt2img' &&
        state.regionalVPredictionImageSupported !== true
      ) {
        return 'The current image engine does not support this frozen Regional Guidance v_prediction image job. Repair or update the runtime.'
      }
      if (frozenSampler !== 'Euler' && state.regionalVPredictionSamplingSupported !== true) {
        return 'The current image engine does not support this frozen Regional Guidance v_prediction sampling method. Repair or update the runtime.'
      }
    }
    if (operation === 'illustrious-regional-outpaint' && state.regionalOutpaintSupported !== true) {
      return 'The current image engine does not support outpaint with Regional Guidance. Repair or update the runtime.'
    }
    const image =
      operation === 'illustrious-regional-img2img' || operation === 'illustrious-regional-outpaint'
    const imageLabel =
      operation === 'illustrious-regional-outpaint'
        ? 'regional outpaint'
        : 'opaque regional img2img'
    if (image && state.regionalImg2ImgSupported !== true) {
      return 'The current image engine does not support opaque img2img with Regional Guidance. Repair or update the runtime.'
    }
    if (image && frozenSampler === 'Euler a' && state.regionalImg2ImgEulerASupported !== true) {
      return `The current image engine does not support Euler a with ${imageLabel}. Repair or update the runtime.`
    }
    if (image && frozenSampler === 'DPM++ 2M' && state.regionalImg2ImgDpmpp2mSupported !== true) {
      return `The current image engine does not support DPM++ 2M with ${imageLabel}. Repair or update the runtime.`
    }
    if (frozenCfgRescale !== 0 && state.regionalCfgRescaleSupported !== true) {
      return 'The current image engine does not support CFG Rescale with Regional Guidance. Repair or update the runtime.'
    }
    if (image && frozenCfgRescale !== 0 && state.regionalImg2ImgCfgRescaleSupported !== true) {
      return `The current image engine does not support CFG Rescale with ${imageLabel}. Repair or update the runtime.`
    }
    if (requiresRegionalLora && state.regionalLoraSupported !== true) {
      return 'The current image engine does not support global LoRAs with Regional Guidance. Repair or update the runtime.'
    }
    if (requiresRegionalVae && state.regionalVaeSupported !== true) {
      return 'The current image engine does not support selected VAE and precision with Regional Guidance. Repair or update the runtime.'
    }
    if (image && requiresRegionalVae && state.regionalImg2ImgVaeSupported !== true) {
      return `The current image engine does not support selected VAE and precision with ${imageLabel}. Repair or update the runtime.`
    }
    if (
      operation === 'illustrious-regional-txt2img' &&
      frozenSampler === 'DPM++ 2M' &&
      state.regionalDpmSupported !== true
    ) {
      return 'The current image engine does not support Regional Guidance with DPM++ 2M. Repair or update the runtime.'
    }
    return operation === 'illustrious-regional-txt2img' &&
      frozenSampler === 'Euler a' &&
      state.regionalInvokeInitializationSupported !== true
      ? 'The current image engine does not support Regional Guidance with Euler a. Repair or update the runtime.'
      : null
  }
  if (operation === 'illustrious-smart-patch' || operation === 'anima-smart-patch') {
    if (state === null) {
      return 'Checking image engine support for this frozen Smart Patch job.'
    }
    if (state.smartPatchSupported !== true) {
      return 'The current image engine does not support Smart Patch generation.'
    }
    if (
      requiresSmartPatchRegionalTxt2Img &&
      state.animaSmartPatchRegionalTxt2ImgSupported !== true
    ) {
      return 'The current image engine does not support this frozen Anima Smart TXT Regional Guidance job.'
    }
    if (
      requiresSmartPatchRegionalImg2Img &&
      state.animaSmartPatchRegionalImg2ImgSupported !== true
    ) {
      return 'The current image engine does not support this frozen Anima Smart IMG Regional Guidance job.'
    }
    if (
      requiresSmartPatchRegionalOutpaint &&
      state.animaSmartPatchRegionalOutpaintSupported !== true
    ) {
      return 'The current image engine does not support this frozen Anima Smart OUT Regional Guidance job.'
    }
    if (
      requiresSmartPatchRegional &&
      !requiresSmartPatchRegionalOutpaint &&
      !requiresSmartPatchRegionalTxt2Img &&
      !requiresSmartPatchRegionalImg2Img &&
      state.animaSmartPatchRegionalSupported !== true
    ) {
      return 'The current image engine does not support this frozen Anima Smart Patch Regional Guidance job.'
    }
    return operation === 'anima-smart-patch' && state.animaSupported !== true
      ? 'The current image engine does not support Smart Patch generation for Anima.'
      : null
  }
  if (operation !== 'illustrious-outpaint' && operation !== 'anima-outpaint') {
    return null
  }
  if (state === null) {
    return 'Checking image engine support for this frozen outpaint job.'
  }
  const anima = operation === 'anima-outpaint'
  const supported = anima ? state.animaOutpaintSupported : state.outpaintSupported
  return supported === true
    ? null
    : `The current image engine does not support outpaint for ${anima ? 'Anima' : 'Illustrious'}.`
}
