import type { ProjectGenerationTargetState } from '../../shared/projects/project-generation-target-state.js'

export function parseDenoisingStrength(
  text: string,
): { kind: 'invalid' } | { kind: 'valid'; value: number | null } {
  const raw = text.trim()
  if (raw === '') {
    return { kind: 'valid', value: null }
  }
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) {
    return { kind: 'invalid' }
  }
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 && value <= 1
    ? { kind: 'valid', value }
    : { kind: 'invalid' }
}

export function denoisingControlReason(input: {
  modelFamily: string | null
  runtimeUnavailableReason: string | null
  supported: boolean | null
  target: ProjectGenerationTargetState | null
  targetError: string | null
}): string | null {
  if (input.modelFamily !== 'illustrious') {
    return 'Denoising Strength is currently available only for Illustrious.'
  }
  if (input.runtimeUnavailableReason) {
    return input.runtimeUnavailableReason
  }
  if (!input.target) {
    return input.targetError ?? 'Checking the generation area pixels.'
  }
  if (input.target.mode === null) {
    return input.target.unavailableReason
  }
  if (input.target.mode === 'txt2img') {
    return 'Denoising Strength is available when the generation area contains raster input.'
  }
  if (input.target.mode === 'outpaint') {
    return 'The generation area is partly transparent. This generation path is not supported yet.'
  }
  if (input.supported === null) {
    return 'Checking image engine support for Denoising Strength.'
  }
  if (!input.supported) {
    return 'The current image engine does not support image-based generation for Illustrious.'
  }
  return null
}

export function denoisingGenerationReason(
  mode: ProjectGenerationTargetState['mode'],
  value: number | null,
  supported: boolean,
): string | null {
  if (mode === 'outpaint') {
    return 'The generation area is partly transparent. This generation path is not supported yet.'
  }
  if (mode !== 'img2img') {
    return null
  }
  if (value === null) {
    return 'Set Denoising Strength before generating from this raster input.'
  }
  return supported
    ? null
    : 'The current image engine does not support image-based generation for Illustrious.'
}
