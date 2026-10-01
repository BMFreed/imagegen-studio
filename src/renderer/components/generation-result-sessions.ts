import type { ProjectGenerationResultView } from '../../shared/api.js'

export interface GenerationResultSession {
  candidateCount: number
  id: string
}

/** Presentation groups use verified recovery candidates, independently of prunable queue rows. */
export function generationResultSessions(
  candidates: ProjectGenerationResultView[],
): GenerationResultSession[] {
  const sessions = new Map<string, GenerationResultSession>()
  for (const candidate of candidates) {
    const session = sessions.get(candidate.stagingSessionId)
    if (session) {
      session.candidateCount += 1
    } else {
      sessions.set(candidate.stagingSessionId, {
        candidateCount: 1,
        id: candidate.stagingSessionId,
      })
    }
  }
  return [...sessions.values()]
}

export function reconcileResultSession(
  candidates: ProjectGenerationResultView[],
  sessionId: string | null,
): string | null {
  return sessionId !== null && candidates.some((item) => item.stagingSessionId === sessionId)
    ? sessionId
    : null
}

export function resultSessionCandidates(
  candidates: ProjectGenerationResultView[],
  sessionId: string | null,
): ProjectGenerationResultView[] {
  return sessionId === null
    ? candidates
    : candidates.filter((candidate) => candidate.stagingSessionId === sessionId)
}

/** A filter can move preview focus, but never changes the independent acceptance selection. */
export function resultSessionFocus(
  candidates: ProjectGenerationResultView[],
  sessionId: string | null,
  focusedCandidateId: string | null,
): string | null {
  const visible = resultSessionCandidates(candidates, sessionId)
  return (
    (
      visible.find((candidate) => candidate.candidateId === focusedCandidateId) ??
      visible.find((candidate) => !candidate.sourceDocumentMismatch) ??
      visible[0]
    )?.candidateId ?? null
  )
}

/** Add keeps its reviewed, flat scope even when a filter hides some checked results. */
export function resultSessionSelection(
  candidates: ProjectGenerationResultView[],
  selectedCandidateIds: string[],
  sessionId: string | null,
): { hidden: number; total: number } {
  const selected = new Set(selectedCandidateIds)
  const eligible = candidates.filter(
    (candidate) => !candidate.sourceDocumentMismatch && selected.has(candidate.candidateId),
  )
  return {
    hidden:
      sessionId === null
        ? 0
        : eligible.filter((candidate) => candidate.stagingSessionId !== sessionId).length,
    total: eligible.length,
  }
}
