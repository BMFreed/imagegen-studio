import type { GenerationCandidate, ProjectQueueItem, ProjectSession } from './project.types'

/** A completed mock candidate stands in for a validated, committed output. */
export function recordCompletedActualSeed(
  session: ProjectSession,
  item: ProjectQueueItem,
  candidate: GenerationCandidate | undefined,
): boolean {
  if (
    item.status !== 'completed' ||
    candidate?.status !== 'completed' ||
    candidate.queueItemId !== item.id ||
    !session.queueItems.includes(item) ||
    !session.staging?.candidates.includes(candidate)
  ) {
    return false
  }
  const actualSeed = item.frozenGeneration?.payload.seed?.value
  if (actualSeed === undefined) {
    return false
  }
  session.lastActualSeed = actualSeed
  return true
}
