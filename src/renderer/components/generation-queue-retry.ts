import type { GenerationQueueEntry } from '../../shared/projects/generation-queue-manager.js'
import type { ProjectGenerationActionState } from '../../shared/projects/project-generation-actions.js'

type OutpaintRetryState = Pick<
  ProjectGenerationActionState,
  'animaOutpaintSupported' | 'outpaintSupported'
>

/** Advisory worker gate follows the frozen operation; Main still verifies exact local resources. */
export function outpaintQueueRetryReason(
  operation: GenerationQueueEntry['operation'],
  state: OutpaintRetryState | null,
): string | null {
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
