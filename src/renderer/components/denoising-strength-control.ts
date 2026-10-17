import type { ProjectGenerationActionState } from '../../shared/projects/project-generation-actions.js'
import type { ProjectGenerationTargetState } from '../../shared/projects/project-generation-target-state.js'

export interface DenoisingTarget {
  mode: 'inpaint' | ProjectGenerationTargetState['mode']
  unavailableReason: string | null
}

export function denoisingRuntimeSupport(
  modelFamily: string | null,
  state: Pick<
    ProjectGenerationActionState,
    'animaOutpaintSupported' | 'animaSupported' | 'img2imgSupported' | 'outpaintSupported'
  > | null,
  mode: ProjectGenerationTargetState['mode'] = 'img2img',
): boolean | null {
  if (!state) {
    return null
  }
  if (mode === 'outpaint') {
    return modelFamily === 'anima'
      ? (state.animaOutpaintSupported ?? false)
      : (state.outpaintSupported ?? false)
  }
  return modelFamily === 'anima' ? (state.animaSupported ?? false) : state.img2imgSupported
}

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
  target: DenoisingTarget | null
  targetError: string | null
}): string | null {
  if (input.modelFamily !== 'illustrious' && input.modelFamily !== 'anima') {
    return 'Denoising Strength requires a supported Illustrious or Anima model.'
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
  if (input.supported === null) {
    return 'Checking image engine support for Denoising Strength.'
  }
  if (!input.supported) {
    if (input.target.mode === 'outpaint') {
      return `The current image engine does not support outpaint for ${input.modelFamily === 'anima' ? 'Anima' : 'Illustrious'}.`
    }
    return `The current image engine does not support image-based generation for ${input.modelFamily === 'anima' ? 'Anima' : 'Illustrious'}.`
  }
  return null
}

export function denoisingGenerationReason(
  mode: DenoisingTarget['mode'],
  value: number | null,
  supported: boolean,
  modelFamily: string | null = 'illustrious',
): string | null {
  if (mode !== 'img2img' && mode !== 'outpaint' && mode !== 'inpaint') {
    return null
  }
  if (value === null) {
    return 'Set Denoising Strength before generating from this raster input.'
  }
  if (mode === 'outpaint' && !supported) {
    return `The current image engine does not support outpaint for ${modelFamily === 'anima' ? 'Anima' : 'Illustrious'}.`
  }
  return supported
    ? null
    : `The current image engine does not support image-based generation for ${modelFamily === 'anima' ? 'Anima' : 'Illustrious'}.`
}
