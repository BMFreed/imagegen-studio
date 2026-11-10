/** Explicitly qualified worker versions; unknown versions never inherit an inference capability. */
export interface QualifiedInferenceWorkerReady {
  capabilities: readonly string[]
  protocolVersion: '1'
  runtimeProfile: 'linux-nvidia'
  workerVersion:
    | '0.10.0'
    | '0.11.0'
    | '0.12.0'
    | '0.13.0'
    | '0.14.0'
    | '0.2.0'
    | '0.3.0'
    | '0.4.0'
    | '0.5.0'
    | '0.6.0'
    | '0.7.0'
    | '0.8.0'
    | '0.9.0'
}

export function isQualifiedInferenceWorkerReady(
  value: unknown,
): value is QualifiedInferenceWorkerReady {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const ready = value as Record<string, unknown>
  return (
    ready.protocolVersion === '1' &&
    ready.runtimeProfile === 'linux-nvidia' &&
    Array.isArray(ready.capabilities) &&
    ready.capabilities.every((capability) => typeof capability === 'string') &&
    ready.capabilities.includes('illustrious-txt2img') &&
    (ready.workerVersion === '0.2.0' ||
      (ready.workerVersion === '0.3.0' && ready.capabilities.includes('denoising-progress')) ||
      (ready.workerVersion === '0.4.0' &&
        ready.capabilities.includes('denoising-progress') &&
        ready.capabilities.includes('candidate-thumbnails')) ||
      (ready.workerVersion === '0.5.0' &&
        ready.capabilities.includes('denoising-progress') &&
        ready.capabilities.includes('candidate-thumbnails') &&
        ready.capabilities.includes('illustrious-cfg-rescale')) ||
      (ready.workerVersion === '0.6.0' &&
        ready.capabilities.includes('denoising-progress') &&
        ready.capabilities.includes('candidate-thumbnails') &&
        ready.capabilities.includes('illustrious-cfg-rescale') &&
        ready.capabilities.includes('illustrious-img2img')) ||
      (ready.workerVersion === '0.7.0' &&
        ready.capabilities.includes('denoising-progress') &&
        ready.capabilities.includes('candidate-thumbnails') &&
        ready.capabilities.includes('illustrious-cfg-rescale') &&
        ready.capabilities.includes('illustrious-img2img') &&
        ready.capabilities.includes('illustrious-lora')) ||
      (ready.workerVersion === '0.8.0' &&
        ready.capabilities.includes('denoising-progress') &&
        ready.capabilities.includes('candidate-thumbnails') &&
        ready.capabilities.includes('illustrious-cfg-rescale') &&
        ready.capabilities.includes('illustrious-img2img') &&
        ready.capabilities.includes('illustrious-lora') &&
        ready.capabilities.includes('illustrious-vae-precision')) ||
      (ready.workerVersion === '0.9.0' &&
        ready.capabilities.includes('denoising-progress') &&
        ready.capabilities.includes('candidate-thumbnails') &&
        ready.capabilities.includes('illustrious-cfg-rescale') &&
        ready.capabilities.includes('illustrious-img2img') &&
        ready.capabilities.includes('illustrious-lora') &&
        ready.capabilities.includes('illustrious-vae-precision') &&
        ready.capabilities.includes('illustrious-external-vae')) ||
      ((ready.workerVersion === '0.10.0' ||
        ready.workerVersion === '0.11.0' ||
        ((ready.workerVersion === '0.12.0' ||
          ready.workerVersion === '0.13.0' ||
          ready.workerVersion === '0.14.0') &&
          ready.capabilities.includes('illustrious-outpaint'))) &&
        ready.capabilities.includes('denoising-progress') &&
        ready.capabilities.includes('candidate-thumbnails') &&
        ready.capabilities.includes('illustrious-cfg-rescale') &&
        ready.capabilities.includes('illustrious-img2img') &&
        ready.capabilities.includes('illustrious-lora') &&
        ready.capabilities.includes('illustrious-vae-precision') &&
        ready.capabilities.includes('illustrious-external-vae') &&
        ready.capabilities.includes('illustrious-embeddings')))
  )
}

/** Legacy 0.2.0 remains usable but may not send progress, even if it advertises extra strings. */
export function supportsInferenceDenoisingProgress(value: unknown): boolean {
  return isQualifiedInferenceWorkerReady(value) && value.workerVersion !== '0.2.0'
}

/** Regional progress is opt-in only for the qualified regional execution and telemetry owners. */
export function supportsInferenceRegionalProgress(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    supportsInferenceDenoisingProgress(value) &&
    value.capabilities.includes('illustrious-regional-progress-v1') &&
    (value.capabilities.includes('private-current-canvas-regional-v1') ||
      value.capabilities.includes('illustrious-regional-invoke-v1'))
  )
}

/** Opt-in identity support never follows from a sampler name or a historical ready message. */
export function supportsInferenceRegionalInvokeInitialization(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    value.capabilities.includes('illustrious-regional-invoke-init-v1') &&
    (value.capabilities.includes('private-current-canvas-regional-v1') ||
      value.capabilities.includes('illustrious-regional-invoke-v1'))
  )
}

/** DPM++ 2M requires its public opt-in and the already qualified Invoke initialization owner. */
export function supportsInferenceRegionalDpm(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    value.capabilities.includes('illustrious-regional-invoke-v1') &&
    value.capabilities.includes('illustrious-regional-dpmpp-2m-v1') &&
    supportsInferenceRegionalInvokeInitialization(value)
  )
}

/** Invoke's UNet objective is frozen explicitly; older epsilon regional peers cannot execute V. */
export function supportsInferenceRegionalVPrediction(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    value.capabilities.includes('illustrious-regional-invoke-v1') &&
    value.capabilities.includes('illustrious-regional-v-prediction-v1')
  )
}

/**
 * Source-conditioned V execution is separately qualified; the TXT objective capability stays
 * narrow.
 */
export function supportsInferenceRegionalVPredictionImage(value: unknown): boolean {
  return (
    supportsInferenceRegionalVPrediction(value) &&
    supportsInferenceRegionalImg2Img(value) &&
    isQualifiedInferenceWorkerReady(value) &&
    value.capabilities.includes('illustrious-regional-v-prediction-image-v1')
  )
}

/** Non-Euler V combinations require their own qualification, plus each existing sampler owner. */
export function supportsInferenceRegionalVPredictionSampling(value: unknown): boolean {
  return (
    supportsInferenceRegionalVPrediction(value) &&
    isQualifiedInferenceWorkerReady(value) &&
    value.capabilities.includes('illustrious-regional-v-prediction-sampling-v1')
  )
}

/** Ordinary rescale support alone never qualifies the separate regional execution owner. */
export function supportsInferenceRegionalCFGRescale(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    value.capabilities.includes('illustrious-regional-invoke-v1') &&
    value.capabilities.includes('illustrious-regional-cfg-rescale-v1') &&
    supportsInferenceCFGRescale(value)
  )
}

/** Ordinary img2img alone does not qualify regional image conditioning or its frozen replay. */
export function supportsInferenceRegionalImg2Img(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    value.capabilities.includes('illustrious-regional-invoke-v1') &&
    value.capabilities.includes('illustrious-regional-img2img-v1') &&
    supportsInferenceImg2Img(value)
  )
}

/** Masked regional execution additionally requires the ordinary source-bound contribution owner. */
export function supportsInferenceRegionalOutpaint(value: unknown): boolean {
  return (
    supportsInferenceRegionalImg2Img(value) &&
    supportsInferenceOutpaint(value) &&
    isQualifiedInferenceWorkerReady(value) &&
    value.capabilities.includes('illustrious-regional-outpaint-v1')
  )
}

/** Separate IMG rescale qualification cannot be inferred from independent TXT and image support. */
export function supportsInferenceRegionalImg2ImgCFGRescale(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    supportsInferenceRegionalImg2Img(value) &&
    supportsInferenceRegionalCFGRescale(value) &&
    value.capabilities.includes('illustrious-regional-img2img-cfg-rescale-v1')
  )
}

/** Selected VAE/precision on IMG requires its own encoder/decode combination qualification. */
export function supportsInferenceRegionalImg2ImgVae(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    supportsInferenceRegionalImg2Img(value) &&
    supportsInferenceRegionalVae(value) &&
    value.capabilities.includes('illustrious-regional-img2img-vae-v1')
  )
}

/** Opaque IMG plus TXT Euler a alone does not qualify their separate native combination. */
export function supportsInferenceRegionalImg2ImgEulerAncestral(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    supportsInferenceRegionalImg2Img(value) &&
    supportsInferenceRegionalInvokeInitialization(value) &&
    value.capabilities.includes('illustrious-regional-img2img-euler-a-v1')
  )
}

/** Image DPM keeps the native scheduler but uses source latents instead of TXT initialization. */
export function supportsInferenceRegionalImg2ImgDpmpp2m(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    supportsInferenceRegionalImg2Img(value) &&
    value.capabilities.includes('illustrious-regional-dpmpp-2m-v1') &&
    value.capabilities.includes('illustrious-regional-img2img-dpmpp-2m-v1')
  )
}

/** Global LoRAs require the qualified public regional owner and its explicit adapter opt-in. */
export function supportsInferenceRegionalLoras(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    value.capabilities.includes('illustrious-regional-invoke-v1') &&
    value.capabilities.includes('illustrious-regional-lora-v1')
  )
}

/** Selected VAE/precision requires the qualified public regional decode owner. */
export function supportsInferenceRegionalVae(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    value.capabilities.includes('illustrious-regional-invoke-v1') &&
    value.capabilities.includes('illustrious-regional-vae-v1')
  )
}

/** Only explicitly qualified peers may nominate a best-effort thumbnail sidecar. */
export function supportsInferenceCandidateThumbnails(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    (value.workerVersion === '0.4.0' ||
      value.workerVersion === '0.5.0' ||
      value.workerVersion === '0.6.0' ||
      value.workerVersion === '0.7.0' ||
      value.workerVersion === '0.8.0' ||
      value.workerVersion === '0.9.0' ||
      value.workerVersion === '0.10.0' ||
      value.workerVersion === '0.11.0' ||
      value.workerVersion === '0.12.0' ||
      value.workerVersion === '0.13.0' ||
      value.workerVersion === '0.14.0')
  )
}

/** Legacy peers must never inherit rescale support merely by advertising an extra string. */
export function supportsInferenceCFGRescale(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    (value.workerVersion === '0.5.0' ||
      value.workerVersion === '0.6.0' ||
      value.workerVersion === '0.7.0' ||
      value.workerVersion === '0.8.0' ||
      value.workerVersion === '0.9.0' ||
      value.workerVersion === '0.10.0' ||
      value.workerVersion === '0.11.0' ||
      value.workerVersion === '0.12.0' ||
      value.workerVersion === '0.13.0' ||
      value.workerVersion === '0.14.0')
  )
}

export function supportsInferenceImg2Img(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    (value.workerVersion === '0.6.0' ||
      value.workerVersion === '0.7.0' ||
      value.workerVersion === '0.8.0' ||
      value.workerVersion === '0.9.0' ||
      value.workerVersion === '0.10.0' ||
      value.workerVersion === '0.11.0' ||
      value.workerVersion === '0.12.0' ||
      value.workerVersion === '0.13.0' ||
      value.workerVersion === '0.14.0')
  )
}

/** Only the qualified native adapter runtime may consume nonempty LoRA requests. */
export function supportsInferenceLora(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    (value.workerVersion === '0.7.0' ||
      value.workerVersion === '0.8.0' ||
      value.workerVersion === '0.9.0' ||
      value.workerVersion === '0.10.0' ||
      value.workerVersion === '0.11.0' ||
      value.workerVersion === '0.12.0' ||
      value.workerVersion === '0.13.0' ||
      value.workerVersion === '0.14.0')
  )
}

/** Manual VAE precision is available only on the qualified encode/decode runtime. */
export function supportsInferenceVaePrecision(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    (value.workerVersion === '0.8.0' ||
      value.workerVersion === '0.9.0' ||
      value.workerVersion === '0.10.0' ||
      value.workerVersion === '0.11.0' ||
      value.workerVersion === '0.12.0' ||
      value.workerVersion === '0.13.0' ||
      value.workerVersion === '0.14.0')
  )
}

/** External VAE loading never follows from an unqualified peer's capability string alone. */
export function supportsInferenceExternalVae(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    (value.workerVersion === '0.9.0' ||
      value.workerVersion === '0.10.0' ||
      value.workerVersion === '0.11.0' ||
      value.workerVersion === '0.12.0' ||
      value.workerVersion === '0.13.0' ||
      value.workerVersion === '0.14.0')
  )
}

/** Exact textual-inversion resources require the qualified dual-CLIP embedding runtime. */
export function supportsInferenceEmbeddings(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    (value.workerVersion === '0.10.0' ||
      value.workerVersion === '0.11.0' ||
      value.workerVersion === '0.12.0' ||
      value.workerVersion === '0.13.0' ||
      value.workerVersion === '0.14.0')
  )
}

/** Only the qualified original-Anima runtime may consume the complete compiled flow command. */
export function supportsInferenceAnima(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    (value.workerVersion === '0.11.0' ||
      value.workerVersion === '0.12.0' ||
      value.workerVersion === '0.13.0' ||
      value.workerVersion === '0.14.0') &&
    [
      'anima-txt2img',
      'anima-img2img',
      'anima-lora',
      'anima-prompt-weighting',
      'anima-flow-sampling',
    ].every((capability) => value.capabilities.includes(capability))
  )
}

/** Regional Anima has a separate frozen execution owner; ordinary family support cannot grant it. */
export function supportsInferenceAnimaRegional(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    supportsInferenceAnima(value) &&
    value.capabilities.includes('anima-regional-txt2img-v1')
  )
}

/** Spatial negative banks additionally require their explicitly qualified regional owner. */
export function supportsInferenceAnimaRegionalNegative(value: unknown): boolean {
  return (
    supportsInferenceAnimaRegional(value) &&
    isQualifiedInferenceWorkerReady(value) &&
    value.capabilities.includes('anima-regional-negative-v1')
  )
}

/** Global adapters require both ordinary Anima support and its separately qualified regional scope. */
export function supportsInferenceAnimaRegionalLora(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    supportsInferenceAnimaRegional(value) &&
    value.capabilities.includes('anima-lora') &&
    value.capabilities.includes('anima-regional-lora-v1')
  )
}

/** Non-Euler regional sampling additionally requires the qualified shared flow executor. */
export function supportsInferenceAnimaRegionalSampling(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    supportsInferenceAnimaRegional(value) &&
    value.capabilities.includes('anima-regional-sampling-v1')
  )
}

/** Opaque regional Anima sources require their separately qualified image consumer. */
export function supportsInferenceAnimaRegionalImg2Img(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    supportsInferenceAnimaRegional(value) &&
    value.capabilities.includes('anima-regional-img2img-v1')
  )
}

/** Regional OUT adds alpha restoration/contribution to the qualified image owner. */
export function supportsInferenceAnimaRegionalOutpaint(value: unknown): boolean {
  return (
    supportsInferenceAnimaRegionalImg2Img(value) &&
    supportsInferenceAnimaOutpaint(value) &&
    isQualifiedInferenceWorkerReady(value) &&
    value.capabilities.includes('anima-regional-outpaint-v1')
  )
}

/** Explicit alpha conditioning and RGBA contribution require a qualified contribution adapter. */
export function supportsInferenceOutpaint(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    (value.workerVersion === '0.12.0' ||
      value.workerVersion === '0.13.0' ||
      value.workerVersion === '0.14.0')
  )
}

/** Original Anima also requires native BF16 and its explicit contribution adapter. */
export function supportsInferenceAnimaOutpaint(value: unknown): boolean {
  return (
    supportsInferenceOutpaint(value) &&
    supportsInferenceAnima(value) &&
    isQualifiedInferenceWorkerReady(value) &&
    value.capabilities.includes('anima-outpaint')
  )
}

/** Ordinary Euler never follows from an older peer advertising an unqualified string. */
export function supportsInferenceEuler(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    (value.workerVersion === '0.13.0' || value.workerVersion === '0.14.0') &&
    value.capabilities.includes('illustrious-euler')
  )
}

/** Only a qualified native profile runtime can execute an explicit non-neutral schedule. */
export function supportsInferenceIllustriousNoiseProfile(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    value.capabilities.includes('illustrious-euler') &&
    value.capabilities.includes('illustrious-noise-profile')
  )
}

/** Smart INP/regional routing is separately qualified from either existing lane. */
export function supportsInferenceAnimaSmartPatchRegional(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    supportsInferenceAnima(value) &&
    value.capabilities.includes('smart-patch-execution') &&
    value.capabilities.includes('smart-patch-seed-confirmation') &&
    value.capabilities.includes('anima-smart-patch-regional-inpaint-v1')
  )
}

/** OUT is a separately qualified composition; the older INP capability keeps its meaning. */
export function supportsInferenceAnimaSmartPatchRegionalOutpaint(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    supportsInferenceAnima(value) &&
    value.capabilities.includes('smart-patch-execution') &&
    value.capabilities.includes('smart-patch-seed-confirmation') &&
    value.capabilities.includes('anima-smart-patch-regional-outpaint-v1')
  )
}

export function supportsInferenceAnimaSmartPatchRegionalTxt2Img(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    supportsInferenceAnima(value) &&
    value.capabilities.includes('smart-patch-execution') &&
    value.capabilities.includes('smart-patch-seed-confirmation') &&
    value.capabilities.includes('anima-smart-patch-regional-txt2img-v1')
  )
}

export function supportsInferenceAnimaSmartPatchRegionalImg2Img(value: unknown): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    supportsInferenceAnima(value) &&
    value.capabilities.includes('smart-patch-execution') &&
    value.capabilities.includes('smart-patch-seed-confirmation') &&
    value.capabilities.includes('anima-smart-patch-regional-img2img-v1')
  )
}

/** Global enabled LoRA, including zero, requires its own exact Smart-mode grant. */
export function supportsInferenceAnimaSmartPatchRegionalLoraMode(
  value: unknown,
  mode: unknown,
): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    supportsInferenceAnima(value) &&
    value.capabilities.includes('smart-patch-execution') &&
    value.capabilities.includes('smart-patch-seed-confirmation') &&
    ['img2img', 'inpaint', 'outpaint', 'txt2img'].includes(typeof mode === 'string' ? mode : '') &&
    value.capabilities.includes(`anima-smart-patch-regional-lora-${String(mode)}-v1`)
  )
}

/** Call only with the actual classified or strictly parsed frozen Smart mode. */
export function supportsInferenceAnimaSmartPatchRegionalMode(
  value: unknown,
  mode: unknown,
  requiresLora = false,
): boolean {
  if (requiresLora) {
    return supportsInferenceAnimaSmartPatchRegionalLoraMode(value, mode)
  }
  return mode === 'inpaint'
    ? supportsInferenceAnimaSmartPatchRegional(value)
    : mode === 'outpaint'
      ? supportsInferenceAnimaSmartPatchRegionalOutpaint(value)
      : mode === 'txt2img'
        ? supportsInferenceAnimaSmartPatchRegionalTxt2Img(value)
        : mode === 'img2img'
          ? supportsInferenceAnimaSmartPatchRegionalImg2Img(value)
          : false
}

/** EPS retains its old capability; V requires a separate exact objective/mode grant. */
export function supportsInferenceIllustriousSmartPatchRegionalMode(
  value: unknown,
  mode: unknown,
  predictionType: unknown = 'epsilon',
): boolean {
  return (
    isQualifiedInferenceWorkerReady(value) &&
    value.workerVersion === '0.14.0' &&
    (predictionType === 'epsilon' || predictionType === 'v_prediction') &&
    ['img2img', 'inpaint', 'outpaint', 'txt2img'].includes(typeof mode === 'string' ? mode : '') &&
    supportsInferenceEuler(value) &&
    supportsInferenceIllustriousNoiseProfile(value) &&
    value.capabilities.includes('smart-patch-execution') &&
    value.capabilities.includes('smart-patch-seed-confirmation') &&
    value.capabilities.includes(
      `illustrious-smart-patch-regional-${predictionType === 'v_prediction' ? 'v-prediction-' : ''}${String(mode)}-v1`,
    )
  )
}

/** Family is taken from the classified request or strictly parsed frozen item. */
export function supportsInferenceSmartPatchRegionalMode(
  value: unknown,
  family: unknown,
  mode: unknown,
  predictionType: unknown = 'epsilon',
  requiresLora = false,
): boolean {
  return family === 'illustrious'
    ? !requiresLora &&
        supportsInferenceIllustriousSmartPatchRegionalMode(value, mode, predictionType)
    : family === 'anima'
      ? supportsInferenceAnimaSmartPatchRegionalMode(value, mode, requiresLora)
      : false
}
