import type {
  ProjectGenerationResultsSnapshot,
  ProjectGenerationResultView,
  ProjectSmartPatchResultsSnapshot,
  ProjectSmartPatchResultView,
} from '../../shared/api.js'
import type { GenerationQueueEntry } from '../../shared/projects/generation-queue-manager.js'
import { isProjectGenerationResultsSnapshot } from '../../shared/projects/project-generation-results.js'
import { isProjectSmartPatchResultsSnapshot } from '../../shared/projects/smart-patch-public-generation.js'

/** Navigation pins both the displayed document and the original completed job. */
export interface QueueResultReference {
  candidateId: string
  layerId?: string
  openDocumentId: string
  projectKey: string
  queueItemId: string
  sourceDocumentId: string
  stagingSessionId: string
  targetKind?: 'smart-patch'
}

export interface GenerationResultFocusRequest extends QueueResultReference {
  revision: number
}

/** Closed Projects do not expose a verified candidate ID until ordinary Open/recovery. */
export type QueueResultOpenReference = Omit<QueueResultReference, 'candidateId' | 'openDocumentId'>

type NavigationOutcome =
  | { focus: GenerationResultFocusRequest; kind: 'focused' }
  | { kind: 'superseded' }
  | { kind: 'unavailable'; reason: string }

interface NavigationDependencies {
  canContinueProjectOpen: () => boolean
  canNavigate: () => boolean
  getOpenDocumentId: (projectKey: string) => string | null
  readResults: (projectKey: string) => Promise<ProjectGenerationResultsSnapshot>
  readSmartResults?: (projectKey: string) => Promise<ProjectSmartPatchResultsSnapshot>
}

/** Real async owner used by App; late reads cannot navigate after close/replacement. */
export class GenerationQueueResultNavigator {
  private pendingProjectOpen: {
    reference: QueueResultOpenReference
    revision: number
    started: boolean
  } | null = null
  private revision = 0
  private viewToken = 0

  constructor(private readonly dependencies: NavigationDependencies) {}

  beginProjectOpen(reference: QueueResultOpenReference): void {
    this.cancel()
    this.pendingProjectOpen = {
      reference: { ...reference },
      revision: ++this.revision,
      started: false,
    }
  }

  cancel(): void {
    this.cancelView()
    this.cancelProjectOpen()
  }

  cancelProjectOpen(): void {
    this.pendingProjectOpen = null
  }

  cancelView(): void {
    this.viewToken += 1
  }

  async continueProjectOpen(): Promise<NavigationOutcome> {
    const intent = this.pendingProjectOpen
    if (!intent || intent.started) {
      return { kind: 'superseded' }
    }
    intent.started = true
    const current = () =>
      this.pendingProjectOpen === intent && this.dependencies.canContinueProjectOpen()
    try {
      const openDocumentId = this.dependencies.getOpenDocumentId(intent.reference.projectKey)
      if (!current() || !openDocumentId) {
        return { kind: 'superseded' }
      }
      const sameDocument = () =>
        this.dependencies.getOpenDocumentId(intent.reference.projectKey) === openDocumentId
      if (intent.reference.targetKind === 'smart-patch') {
        let snapshot: ProjectSmartPatchResultsSnapshot | undefined
        try {
          snapshot = await this.dependencies.readSmartResults?.(intent.reference.projectKey)
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
            reason:
              'The open Project changed while the Smart Patch result was being checked. Refresh the queue.',
          }
        }
        const candidates =
          isProjectSmartPatchResultsSnapshot(snapshot) && !snapshot.recoveryUnavailable
            ? snapshot.candidates.filter(
                (candidate) =>
                  candidate.queueItemId === intent.reference.queueItemId &&
                  candidate.stagingSessionId === intent.reference.stagingSessionId &&
                  candidate.documentId === intent.reference.sourceDocumentId &&
                  smartBelongsToProject(candidate, intent.reference.projectKey),
              )
            : []
        const candidate = candidates.length === 1 ? candidates[0] : null
        if (!candidate) {
          return {
            kind: 'unavailable',
            reason:
              'The temporary Smart Patch result is no longer available. The Project is open; refresh the queue.',
          }
        }
        return {
          focus: {
            ...intent.reference,
            candidateId: candidate.candidateId,
            layerId: candidate.layerId,
            openDocumentId,
            revision: intent.revision,
            targetKind: 'smart-patch',
          },
          kind: 'focused',
        }
      }
      let snapshot: ProjectGenerationResultsSnapshot
      try {
        snapshot = await this.dependencies.readResults(intent.reference.projectKey)
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
      const candidates =
        isProjectGenerationResultsSnapshot(snapshot) && !snapshot.recoveryUnavailable
          ? snapshot.candidates.filter(
              (candidate) =>
                candidate.queueItemId === intent.reference.queueItemId &&
                candidate.stagingSessionId === intent.reference.stagingSessionId &&
                candidate.sourceDocumentMismatch ===
                  (intent.reference.sourceDocumentId !== openDocumentId) &&
                belongsToProject(candidate, intent.reference.projectKey),
            )
          : []
      const candidate = candidates.length === 1 ? candidates[0] : null
      if (!candidate) {
        return {
          kind: 'unavailable',
          reason:
            'The temporary result is no longer available. The Project is open; refresh the queue.',
        }
      }
      return {
        focus: {
          ...intent.reference,
          candidateId: candidate.candidateId,
          openDocumentId,
          revision: intent.revision,
        },
        kind: 'focused',
      }
    } finally {
      if (this.pendingProjectOpen === intent) {
        this.pendingProjectOpen = null
      }
    }
  }

  getPendingProjectOpen(): QueueResultOpenReference | null {
    return this.pendingProjectOpen ? { ...this.pendingProjectOpen.reference } : null
  }

  hasPendingProjectOpen(): boolean {
    return this.pendingProjectOpen !== null
  }

  async open(reference: QueueResultReference): Promise<NavigationOutcome> {
    this.cancel()
    const token = this.viewToken
    const revision = ++this.revision
    const reviewed = { ...reference }
    const current = () => token === this.viewToken && this.dependencies.canNavigate()
    const sameDocument = () =>
      this.dependencies.getOpenDocumentId(reviewed.projectKey) === reviewed.openDocumentId
    if (!current() || !sameDocument()) {
      return {
        kind: 'unavailable',
        reason: 'Open this Project before viewing its temporary result.',
      }
    }
    if (reviewed.targetKind === 'smart-patch') {
      let snapshot: ProjectSmartPatchResultsSnapshot | undefined
      try {
        snapshot = await this.dependencies.readSmartResults?.(reviewed.projectKey)
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
          reason:
            'The open Project changed while the Smart Patch result was being checked. Refresh the queue.',
        }
      }
      if (
        !isProjectSmartPatchResultsSnapshot(snapshot) ||
        snapshot.recoveryUnavailable ||
        !smartResultFocusCandidate(reviewed, snapshot.candidates, {
          documentId: reviewed.openDocumentId,
          projectKey: reviewed.projectKey,
        })
      ) {
        return {
          kind: 'unavailable',
          reason: 'The temporary Smart Patch result is no longer available. Refresh the queue.',
        }
      }
      return { focus: { ...reviewed, revision }, kind: 'focused' }
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

export function queueResultOpenReference(
  item: GenerationQueueEntry,
): QueueResultOpenReference | null {
  if (item.status !== 'completed' || item.publicationPending) {
    return null
  }
  return {
    ...(['anima-smart-patch', 'illustrious-smart-patch'].includes(item.operation)
      ? { targetKind: 'smart-patch' as const }
      : {}),
    projectKey: item.projectKey,
    queueItemId: item.id,
    sourceDocumentId: item.documentId,
    stagingSessionId: item.stagingSessionId,
  }
}

export function queueResultCandidate(
  item: GenerationQueueEntry,
  snapshot: ProjectGenerationResultsSnapshot | null | undefined,
  openDocumentId: string | null | undefined,
): ProjectGenerationResultView | null {
  if (
    item.status !== 'completed' ||
    ['anima-smart-patch', 'illustrious-smart-patch'].includes(item.operation) ||
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
    request.targetKind === 'smart-patch' ||
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

export function queueSmartResultCandidate(
  item: GenerationQueueEntry,
  snapshot: ProjectSmartPatchResultsSnapshot | null | undefined,
  openDocumentId: string | null | undefined,
): ProjectSmartPatchResultView | null {
  if (
    !['anima-smart-patch', 'illustrious-smart-patch'].includes(item.operation) ||
    item.status !== 'completed' ||
    item.publicationPending ||
    !openDocumentId ||
    !isProjectSmartPatchResultsSnapshot(snapshot) ||
    snapshot.recoveryUnavailable ||
    snapshot.documentId !== openDocumentId
  ) {
    return null
  }
  const candidates = snapshot.candidates.filter(
    (candidate) =>
      candidate.queueItemId === item.id &&
      candidate.stagingSessionId === item.stagingSessionId &&
      candidate.documentId === item.documentId &&
      smartBelongsToProject(candidate, item.projectKey),
  )
  return candidates.length === 1 ? (candidates[0] ?? null) : null
}
export function queueSmartResultReference(
  item: GenerationQueueEntry,
  candidate: ProjectSmartPatchResultView,
  openDocumentId: string,
): QueueResultReference {
  return {
    candidateId: candidate.candidateId,
    layerId: candidate.layerId,
    openDocumentId,
    projectKey: item.projectKey,
    queueItemId: item.id,
    sourceDocumentId: item.documentId,
    stagingSessionId: item.stagingSessionId,
    targetKind: 'smart-patch',
  }
}
export function smartResultFocusCandidate(
  request: QueueResultReference | null | undefined,
  candidates: ProjectSmartPatchResultView[],
  open: { documentId: string; projectKey: string },
): ProjectSmartPatchResultView | null {
  if (
    !request ||
    request.targetKind !== 'smart-patch' ||
    request.projectKey !== open.projectKey ||
    request.openDocumentId !== open.documentId ||
    !request.layerId
  ) {
    return null
  }
  const exact = candidates.filter(
    (candidate) =>
      candidate.candidateId === request.candidateId &&
      candidate.queueItemId === request.queueItemId &&
      candidate.stagingSessionId === request.stagingSessionId &&
      candidate.documentId === request.sourceDocumentId &&
      candidate.layerId === request.layerId &&
      smartBelongsToProject(candidate, request.projectKey),
  )
  return exact.length === 1 ? (exact[0] ?? null) : null
}
function smartBelongsToProject(
  candidate: ProjectSmartPatchResultView,
  projectKey: string,
): boolean {
  try {
    const url = new URL(candidate.imageUrl)
    return (
      url.protocol === 'igs-smart-staging:' &&
      url.hostname === 'asset' &&
      url.pathname.startsWith(`/${projectKey}/`)
    )
  } catch {
    return false
  }
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
