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
