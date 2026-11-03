import type { GenerationQueueEntry } from '../../shared/projects/generation-queue-manager.js'
import type { ProjectGenerationActionState } from '../../shared/projects/project-generation-actions.js'

type RetryState = Pick<
  ProjectGenerationActionState,
  | 'animaOutpaintSupported'
  | 'animaSupported'
  | 'outpaintSupported'
  | 'regionalSupported'
  | 'smartPatchSupported'
>

/** Advisory worker gate follows the frozen operation; Main still verifies exact local resources. */
export function generationQueueRetryReason(
  operation: GenerationQueueEntry['operation'],
  state: RetryState | null,
): string | null {
  if (operation === 'illustrious-regional-txt2img') {
    if (state === null) {
      return 'Checking image engine support for this frozen Regional Guidance job.'
    }
    return state.regionalSupported === true
      ? null
      : 'The current image engine does not support Regional Guidance. Repair or update the runtime.'
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
