import type { GenerationStagingRepository } from './generation-staging.js'

export type ProjectTemporaryRecoveryInspection =
  { completedCandidateCount: number; kind: 'available' } | { kind: 'unavailable'; reason: string }

/** Unknown local storage never authorizes deleting results or makes a saved Project uneditable. */
export function unavailableTemporaryRecovery(error?: unknown): ProjectTemporaryRecoveryInspection {
  const diagnostic = error instanceof Error ? ` ${error.message}` : ''
  return {
    kind: 'unavailable',
    reason:
      `Temporary generation recovery cannot be inspected. Local results were kept; repair recovery storage before discarding them.${diagnostic}`.slice(
        0,
        512,
      ),
  }
}

/** Main-only presence uses authoritative PNG/receipt verification, not queue or thumbnail metadata. */
export async function inspectTemporaryRecovery(
  staging: Pick<GenerationStagingRepository, 'listVerifiedCandidates'> | null,
  projectKey: string,
): Promise<ProjectTemporaryRecoveryInspection> {
  if (!staging) {
    return unavailableTemporaryRecovery()
  }
  try {
    const candidates = await staging.listVerifiedCandidates(projectKey)
    return {
      completedCandidateCount: candidates.filter(
        (candidate) => candidate.localProjectKey === projectKey,
      ).length,
      kind: 'available',
    }
  } catch (error) {
    return unavailableTemporaryRecovery(error)
  }
}
