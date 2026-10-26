import type { IgsSmartPatchGenerationProvenanceV1 } from '../../shared/projects/project-schema.js'
import {
  parseSmartResultPresetPayload,
  type SmartResultPresetPayload,
} from '../../shared/projects/smart-result-preset.js'

/** Main-only allowlist. No source draft, geometry, execution facts or catalog defaults enter it. */
export function projectSmartResultPresetPayload(
  recorded: IgsSmartPatchGenerationProvenanceV1['generationConfiguration'],
): SmartResultPresetPayload {
  const payload: SmartResultPresetPayload = {
    guidance: { cfgScale: recorded.sampling.cfgScale, steps: recorded.sampling.steps },
    model: recorded.model,
    negativePrompt: recorded.negativePrompt,
    prompt: recorded.positivePrompt,
    sampling:
      'anima' in recorded
        ? { animaMethod: recorded.sampling.animaMethod }
        : { sampler: recorded.sampling.sampler, scheduler: recorded.sampling.scheduler },
  }
  if (!('anima' in recorded) && recorded.sampling.noiseProfile !== undefined) {
    payload.model = { ...recorded.model, noiseProfile: recorded.sampling.noiseProfile }
  }
  if (recorded.loras !== undefined) {
    payload.loras = recorded.loras
  }
  if ('vae' in recorded && recorded.vae !== undefined) {
    payload.vae = recorded.vae
  }
  if (recorded.cfgRescale !== undefined) {
    payload.cfgRescale = recorded.cfgRescale
  }
  if (recorded.vaePrecision !== undefined) {
    payload.vaePrecision = recorded.vaePrecision
  }
  if ('denoisingStrength' in recorded.sampling) {
    payload.denoisingStrength = recorded.sampling.denoisingStrength
  }
  return parseSmartResultPresetPayload(structuredClone(payload))
}
