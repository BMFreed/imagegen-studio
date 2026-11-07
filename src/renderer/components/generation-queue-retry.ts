import type { GenerationQueueEntry } from '../../shared/projects/generation-queue-manager.js'
import type { ProjectGenerationActionState } from '../../shared/projects/project-generation-actions.js'

type RetryState = Pick<
  ProjectGenerationActionState,
  | 'animaOutpaintSupported'
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
  | 'regionalSupported'
  | 'regionalVaeSupported'
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
): string | null {
  if (
    operation === 'illustrious-regional-txt2img' ||
    operation === 'illustrious-regional-img2img'
  ) {
    if (state === null) {
      return 'Checking image engine support for this frozen Regional Guidance job.'
    }
    if (state.regionalSupported !== true) {
      return 'The current image engine does not support Regional Guidance. Repair or update the runtime.'
    }
    if (operation === 'illustrious-regional-img2img' && state.regionalImg2ImgSupported !== true) {
      return 'The current image engine does not support opaque img2img with Regional Guidance. Repair or update the runtime.'
    }
    if (
      operation === 'illustrious-regional-img2img' &&
      frozenSampler === 'Euler a' &&
      state.regionalImg2ImgEulerASupported !== true
    ) {
      return 'The current image engine does not support Euler a with opaque regional img2img. Repair or update the runtime.'
    }
    if (
      operation === 'illustrious-regional-img2img' &&
      frozenSampler === 'DPM++ 2M' &&
      state.regionalImg2ImgDpmpp2mSupported !== true
    ) {
      return 'The current image engine does not support DPM++ 2M with opaque regional img2img. Repair or update the runtime.'
    }
    if (frozenCfgRescale !== 0 && state.regionalCfgRescaleSupported !== true) {
      return 'The current image engine does not support CFG Rescale with Regional Guidance. Repair or update the runtime.'
    }
    if (
      operation === 'illustrious-regional-img2img' &&
      frozenCfgRescale !== 0 &&
      state.regionalImg2ImgCfgRescaleSupported !== true
    ) {
      return 'The current image engine does not support CFG Rescale with opaque regional img2img. Repair or update the runtime.'
    }
    if (requiresRegionalLora && state.regionalLoraSupported !== true) {
      return 'The current image engine does not support global LoRAs with Regional Guidance. Repair or update the runtime.'
    }
    if (requiresRegionalVae && state.regionalVaeSupported !== true) {
      return 'The current image engine does not support selected VAE and precision with Regional Guidance. Repair or update the runtime.'
    }
    if (
      operation === 'illustrious-regional-img2img' &&
      requiresRegionalVae &&
      state.regionalImg2ImgVaeSupported !== true
    ) {
      return 'The current image engine does not support selected VAE and precision with opaque regional img2img. Repair or update the runtime.'
    }
    if (
      operation === 'illustrious-regional-txt2img' &&
      frozenSampler === 'DPM++ 2M' &&
      state.regionalDpmSupported !== true
    ) {
      return 'The current image engine does not support Regional Guidance with DPM++ 2M. Repair or update the runtime.'
    }
    return frozenSampler === 'Euler a' && state.regionalInvokeInitializationSupported !== true
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
