import type {
  ProjectGenerationResultsSnapshot,
  ProjectGenerationResultView,
} from '../../shared/api.js'
import type { GenerationQueueEntry } from '../../shared/projects/generation-queue-manager.js'
import { isProjectGenerationResultsSnapshot } from '../../shared/projects/project-generation-results.js'

/** Navigation pins both the displayed document and the original completed job. */
export interface QueueResultReference {
  candidateId: string
  openDocumentId: string
  projectKey: string
  queueItemId: string
  sourceDocumentId: string
  stagingSessionId: string
}

export interface GenerationResultFocusRequest extends QueueResultReference {
  revision: number
}

type NavigationOutcome =
  | { focus: GenerationResultFocusRequest; kind: 'focused' }
  | { kind: 'superseded' }
  | { kind: 'unavailable'; reason: string }

interface NavigationDependencies {
  canNavigate: () => boolean
  getOpenDocumentId: (projectKey: string) => string | null
  readResults: (projectKey: string) => Promise<ProjectGenerationResultsSnapshot>
}

/** Real async owner used by App; late reads cannot navigate after close/replacement. */
export class GenerationQueueResultNavigator {
  private revision = 0

  constructor(private readonly dependencies: NavigationDependencies) {}

  cancel(): void {
    this.revision += 1
  }

  async open(reference: QueueResultReference): Promise<NavigationOutcome> {
    const revision = ++this.revision
    const reviewed = { ...reference }
    const current = () => revision === this.revision && this.dependencies.canNavigate()
    const sameDocument = () =>
      this.dependencies.getOpenDocumentId(reviewed.projectKey) === reviewed.openDocumentId
    if (!current() || !sameDocument()) {
      return {
        kind: 'unavailable',
        reason: 'Open this Project before viewing its temporary result.',
      }
    }
    let snapshot: ProjectGenerationResultsSnapshot
    try {
      snapshot = await this.dependencies.readResults(reviewed.projectKey)
    } catch (cause) {
      if (!current() || !sameDocument()) {
        return { kind: 'superseded' }
      }
      throw cause
    }
    if (!current()) {
      return { kind: 'superseded' }
    }
    if (!sameDocument()) {
      return {
        kind: 'unavailable',
        reason: 'The open Project changed while the result was being checked. Refresh the queue.',
      }
    }
    if (
      !isProjectGenerationResultsSnapshot(snapshot) ||
      snapshot.recoveryUnavailable ||
      !resultFocusCandidate(reviewed, snapshot.candidates, {
        documentId: reviewed.openDocumentId,
        projectKey: reviewed.projectKey,
      })
    ) {
      return {
        kind: 'unavailable',
        reason: 'The temporary result is no longer available. Refresh the queue.',
      }
    }
    return { focus: { ...reviewed, revision }, kind: 'focused' }
  }
}

export function queueResultCandidate(
  item: GenerationQueueEntry,
  snapshot: ProjectGenerationResultsSnapshot | null | undefined,
  openDocumentId: string | null | undefined,
): ProjectGenerationResultView | null {
  if (
    item.status !== 'completed' ||
    item.publicationPending ||
    !openDocumentId ||
    !isProjectGenerationResultsSnapshot(snapshot) ||
    snapshot.recoveryUnavailable
  ) {
    return null
  }
  return (
    snapshot.candidates.find(
      (candidate) =>
        candidate.queueItemId === item.id &&
        candidate.stagingSessionId === item.stagingSessionId &&
        candidate.sourceDocumentMismatch === (item.documentId !== openDocumentId) &&
        belongsToProject(candidate, item.projectKey),
    ) ?? null
  )
}

export function queueResultReference(
  item: GenerationQueueEntry,
  candidate: ProjectGenerationResultView,
  openDocumentId: string,
): QueueResultReference {
  return {
    candidateId: candidate.candidateId,
    openDocumentId,
    projectKey: item.projectKey,
    queueItemId: item.id,
    sourceDocumentId: item.documentId,
    stagingSessionId: item.stagingSessionId,
  }
}

/** Only presentation focus changes; acceptance selection is owned by Canvas. */
export function resultFocusCandidate(
  request: QueueResultReference | null | undefined,
  candidates: ProjectGenerationResultView[],
  open: { documentId: string; projectKey: string },
): ProjectGenerationResultView | null {
  if (
    !request ||
    request.projectKey !== open.projectKey ||
    request.openDocumentId !== open.documentId
  ) {
    return null
  }
  return (
    candidates.find(
      (candidate) =>
        candidate.candidateId === request.candidateId &&
        candidate.queueItemId === request.queueItemId &&
        candidate.stagingSessionId === request.stagingSessionId &&
        candidate.sourceDocumentMismatch === (request.sourceDocumentId !== open.documentId) &&
        belongsToProject(candidate, request.projectKey),
    ) ?? null
  )
}

function belongsToProject(candidate: ProjectGenerationResultView, projectKey: string): boolean {
  try {
    const url = new URL(candidate.imageUrl)
    return (
      url.protocol === 'igs-staging:' &&
      url.hostname === 'asset' &&
      url.pathname.startsWith(`/${projectKey}/`)
    )
  } catch {
    return false
  }
}
