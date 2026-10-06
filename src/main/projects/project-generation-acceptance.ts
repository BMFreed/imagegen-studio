import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import {
  IGS_MIMETYPE,
  IGS_SAFETY_CEILINGS,
  IGS_SCHEMA_VERSION,
} from '../../shared/projects/project-schema.js'

import { randomUUID } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type {
  GenerationAcceptanceHandoff,
  GenerationAcceptanceJournalRepository,
} from './generation-acceptance-journal.js'
import type {
  GenerationStagingRepository,
  VerifiedGenerationCandidate,
} from './generation-staging.js'
import type { IgsAssetSource } from './igs-package.js'
import type { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import type { ProjectShadowCommit } from './project-shadow.js'

import { isQueuedOutpaint, parseFrozenGenerationPayloadV1 } from './generation-queue.js'
import { DEFAULT_IGS_PACKAGE_LIMITS, readIgsPackage } from './igs-package.js'
import { provenanceFromVerifiedRasterCandidate } from './project-generation-provenance.js'

const projectKeyPattern = /^project-v1-[a-f0-9]{64}$/
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const MAX_ACCEPTED_PER_OPERATION = 64

/** ProjectAutosaveCoordinator satisfies this interface; only Main may obtain it. */
export interface ProjectGenerationAcceptanceDocument {
  applyDocument: (
    input: unknown,
    sources: Readonly<Record<string, IgsAssetSource>>,
    options: { expectedDocumentRevision: string },
  ) => Promise<{ documentRevision: string }>
  readonly dirty: boolean
  readonly document: IgsProjectDocumentV1
  readonly filePath: string
  flush: () => Promise<ProjectShadowCommit | null>
}

export interface ProjectGenerationAcceptanceOptions {
  /** Failure seam for the durable-shadow/before-tombstone crash window. */
  afterDurableShadow?: () => Promise<void>
  documents: {
    getOpenDocument: (tabId: string) => ProjectGenerationAcceptanceDocument | null
  }
  gate: ProjectGenerationOperationGate
  journal: Pick<GenerationAcceptanceJournalRepository, 'abandon' | 'complete' | 'read' | 'record'>
  now?: () => string
  orchestrator: {
    cancelAcceptanceJobs: (
      tabId: string,
      documentId: string,
      stagingSessionIds: readonly string[],
      expectedJobIds: readonly string[],
    ) => Promise<void>
    fenceProjectGeneration: (tabId: string) => Promise<void>
    releaseProjectGenerationFence: (tabId: string) => void
  }
  queue: {
    listUnfinishedByProjectDocument: (
      tabId: string,
      documentId: string,
    ) => Promise<readonly { id: string; stagingSessionId: string }[]>
  }
  staging: Pick<
    GenerationStagingRepository,
    'discardSessions' | 'listVerifiedCandidates' | 'readVerifiedCandidatePng'
  >
}

export type ProjectGenerationAcceptanceResult = {
  documentRevision: string
  kind: 'accepted' | 'already-accepted'
  layerIds: string[]
}

type RasterLayer = IgsProjectDocumentV1['layers'][number]

type PendingCancellation = {
  documentId: string
  jobIds: string[]
  projectPath: string
  stagingSessionIds: string[]
}

export class ProjectGenerationAcceptanceError extends Error {
  constructor(
    readonly code:
      | 'ACCEPTANCE_CANDIDATE_UNAVAILABLE'
      | 'ACCEPTANCE_CONFLICT'
      | 'ACCEPTANCE_HANDOFF_PENDING'
      | 'ACCEPTANCE_INPUT_INVALID'
      | 'ACCEPTANCE_LAYER_LIMIT'
      | 'ACCEPTANCE_OUTPAINT_UNAVAILABLE'
      | 'ACCEPTANCE_PACKAGE_LIMIT'
      | 'ACCEPTANCE_RECOVERY_REQUIRED'
      | 'ACCEPTANCE_SELECTION_STALE'
      | 'ACCEPTANCE_SHADOW_UNCONFIRMED'
      | 'ACCEPTANCE_UNFINISHED_JOBS'
      | 'PROJECT_DOCUMENT_CHANGED'
      | 'PROJECT_NOT_OPEN',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectGenerationAcceptanceError'
  }
}

function acceptedLayers(document: IgsProjectDocumentV1): Map<string, RasterLayer> {
  const accepted = new Map<string, RasterLayer>()
  for (const layer of document.layers) {
    const candidateId = layer.generationProvenance?.executionResultContext.candidateId
    if (!candidateId) {
      continue
    }
    if (accepted.has(candidateId)) {
      throw new ProjectGenerationAcceptanceError(
        'ACCEPTANCE_CONFLICT',
        'The Project contains duplicate accepted result identities.',
      )
    }
    accepted.set(candidateId, layer)
  }
  return accepted
}

/**
 * Main-only Raster acceptance. The operation gate must also guard Project close; the temporary
 * generation fence prevents new work while the exact candidate set is handed to the shadow.
 * Unfinished sibling jobs are canceled only after an exact reviewed job-set confirmation.
 */
export class ProjectGenerationAcceptance {
  private readonly pending = new Map<string, GenerationAcceptanceHandoff>()
  private readonly pendingCancellations = new Map<string, PendingCancellation>()
  private readonly unresolved = new Set<string>()

  constructor(private readonly options: ProjectGenerationAcceptanceOptions) {}

  async accept(
    tabId: string,
    candidateIds: readonly string[],
    focusedCandidateId: string | null,
    expectedAvailableIds: readonly string[],
    expectedUnfinishedJobIds: readonly string[] = [],
  ): Promise<ProjectGenerationAcceptanceResult> {
    validateRequest(tabId, candidateIds, focusedCandidateId, expectedAvailableIds)
    validateJobIds(expectedUnfinishedJobIds)
    return await this.options.gate.run(tabId, async () => {
      const owner = this.requireDocument(tabId)
      let fenced = false
      let retainFence = this.hasPendingHandoff(tabId)
      try {
        fenced = true
        await this.options.orchestrator.fenceProjectGeneration(tabId)
        // Staging verifies source-bound RGBA contributions, including after queue pruning.
        // Preflight selected outpaint pixels and portable metadata before a pending handoff can
        // cancel siblings, write its journal or discard sessions. Already accepted results retain
        // the existing idempotent reconciliation path when their staging files are gone.
        const beforeHandoff = await this.options.staging.listVerifiedCandidates(tabId)
        const previouslyAccepted = acceptedLayers(owner.document)
        for (const candidate of beforeHandoff) {
          if (
            candidateIds.includes(candidate.candidateId) &&
            candidate.documentId === owner.document.documentId &&
            candidate.projectPath === owner.filePath &&
            isQueuedOutpaint(parseFrozenGenerationPayloadV1(candidate.frozenPayloadJson))
          ) {
            const bytes = await this.options.staging.readVerifiedCandidatePng({
              candidateId: candidate.candidateId,
              imageSha256: candidate.image.sha256,
              localProjectKey: tabId,
              stagingSessionId: candidate.stagingSessionId,
            })
            if (!bytes) {
              throw new ProjectGenerationAcceptanceError(
                'ACCEPTANCE_CANDIDATE_UNAVAILABLE',
                'A selected outpaint contribution changed before Add. Temporary results were kept.',
              )
            }
            provenanceFromVerifiedRasterCandidate({
              acceptedAt: candidate.completedAt,
              candidate,
              imagePngBytes: bytes,
            })
          }
        }
        if (
          candidateIds.some(
            (id) =>
              !previouslyAccepted.has(id) &&
              !beforeHandoff.some((candidate) => candidate.candidateId === id),
          )
        ) {
          throw new ProjectGenerationAcceptanceError(
            'ACCEPTANCE_SELECTION_STALE',
            'A selected generation result is missing or cannot be verified.',
          )
        }
        if (this.pendingCancellations.has(tabId)) {
          retainFence = true
          await this.finishPendingCancellation(tabId, owner)
          this.unresolved.delete(tabId)
          retainFence = false
        }
        const initial = structuredClone(owner.document)
        this.requireSameDocument(tabId, owner, initial.documentId)
        const selectedKey = candidateKey(candidateIds)
        retainFence = true
        let pending = await this.loadHandoff(tabId, initial.documentId)
        retainFence = pending !== undefined || this.unresolved.has(tabId)
        if (pending) {
          const proof = handoffProof(initial, pending)
          if (pending.projectPath !== owner.filePath || proof === 'changed') {
            throw handoffRecoveryError()
          }
          if (proof === 'absent') {
            await this.options.journal.abandon(pending)
            this.pending.delete(tabId)
            pending = undefined
            retainFence = false
          }
        }

        if (
          pending &&
          candidateKey(pending.acceptedLayers.map(candidateIdFromLayer)) !== selectedKey
        ) {
          throw new ProjectGenerationAcceptanceError(
            'ACCEPTANCE_HANDOFF_PENDING',
            'Finish recovery of the previous Add before accepting different results.',
          )
        }

        const all = await this.options.staging.listVerifiedCandidates(tabId)
        const owned = all.filter(
          (candidate) =>
            candidate.documentId === initial.documentId && candidate.projectPath === owner.filePath,
        )
        const available = new Map(owned.map((candidate) => [candidate.candidateId, candidate]))
        const sessionIds = pending?.stagingSessionIds ?? [
          ...new Set(owned.map((candidate) => candidate.stagingSessionId)),
        ]
        const unfinished = await this.scopedUnfinishedJobs(tabId, initial.documentId, sessionIds)
        requireExpectedJobIds(unfinished, expectedUnfinishedJobIds)
        if (
          candidateIds.some((id) =>
            all.some(
              (candidate) =>
                candidate.candidateId === id &&
                (candidate.documentId !== initial.documentId ||
                  candidate.projectPath !== owner.filePath),
            ),
          )
        ) {
          throw new ProjectGenerationAcceptanceError(
            'PROJECT_DOCUMENT_CHANGED',
            'A selected result was generated for a different Project document.',
          )
        }
        const accepted = acceptedLayers(initial)
        const existing = candidateIds
          .map((id) => accepted.get(id))
          .filter((layer) => layer !== undefined)
        if (existing.length > 0 && existing.length !== candidateIds.length) {
          throw new ProjectGenerationAcceptanceError(
            'ACCEPTANCE_CONFLICT',
            'This selection mixes already accepted results with temporary results.',
          )
        }

        if (existing.length === candidateIds.length) {
          const stagedSelected = candidateIds
            .map((id) => available.get(id))
            .filter((item) => item !== undefined)
          if (stagedSelected.length > 0 && !pending) {
            // After a crash the open recovered document is the only authority. Reconcile the
            // interrupted handoff before permitting another Add or new generation.
            retainFence = true
            throw new ProjectGenerationAcceptanceError(
              'ACCEPTANCE_RECOVERY_REQUIRED',
              'Finish recovery of previously accepted results before adding more.',
            )
          }
          if (pending) {
            await this.requireNoUnfinishedJobs(tabId, initial.documentId, pending.stagingSessionIds)
            requireExpectedAvailable(owned, expectedAvailableIds)
            retainFence = true
            await this.requireDurable(
              owner,
              tabId,
              initial.documentId,
              initial.documentRevision,
              true,
            )
            if (handoffProof(owner.document, pending) !== 'complete') {
              throw handoffRecoveryError()
            }
            await this.options.journal.complete(pending)
            await this.options.staging.discardSessions(tabId, pending.stagingSessionIds)
            this.pending.delete(tabId)
            retainFence = false
          }
          return {
            documentRevision: owner.document.documentRevision,
            kind: 'already-accepted',
            layerIds: candidateIds.map((id) => accepted.get(id)!.id),
          }
        }

        if (owned.some((candidate) => accepted.has(candidate.candidateId))) {
          retainFence = true
          throw new ProjectGenerationAcceptanceError(
            'ACCEPTANCE_RECOVERY_REQUIRED',
            'Finish recovery of previously accepted results before adding more.',
          )
        }
        requireExpectedAvailable(owned, expectedAvailableIds)
        const selectedSet = new Set(candidateIds)
        const selected = owned
          .filter((candidate) => selectedSet.has(candidate.candidateId))
          .sort(
            (a, b) =>
              a.completionOrder - b.completionOrder || a.candidateId.localeCompare(b.candidateId),
          )
        if (selected.length !== selectedSet.size) {
          throw new ProjectGenerationAcceptanceError(
            'ACCEPTANCE_CANDIDATE_UNAVAILABLE',
            'A selected generation result is missing or cannot be verified.',
          )
        }
        if (initial.layers.length + selected.length > IGS_SAFETY_CEILINGS.archiveEntries) {
          throw new ProjectGenerationAcceptanceError(
            'ACCEPTANCE_LAYER_LIMIT',
            'This Project cannot hold that many Raster Layers.',
          )
        }
        for (const candidate of selected) {
          if (
            candidate.localProjectKey !== tabId ||
            candidate.projectPath !== owner.filePath ||
            candidate.documentId !== initial.documentId
          ) {
            throw new ProjectGenerationAcceptanceError(
              'PROJECT_DOCUMENT_CHANGED',
              'A selected result was generated for a different Project document.',
            )
          }
        }

        const anchorId =
          focusedCandidateId && selectedSet.has(focusedCandidateId)
            ? focusedCandidateId
            : selected[0].candidateId
        const acceptedAt = (this.options.now ?? (() => new Date().toISOString()))()
        const sources: Record<string, IgsAssetSource> = {}
        const layers: RasterLayer[] = []
        for (const candidate of selected) {
          const imagePngBytes = await this.options.staging.readVerifiedCandidatePng({
            candidateId: candidate.candidateId,
            imageSha256: candidate.image.sha256,
            localProjectKey: tabId,
            stagingSessionId: candidate.stagingSessionId,
          })
          if (!imagePngBytes) {
            throw new ProjectGenerationAcceptanceError(
              'ACCEPTANCE_CANDIDATE_UNAVAILABLE',
              'A selected result changed before it could become a Project layer.',
            )
          }
          const provenance = provenanceFromVerifiedRasterCandidate({
            acceptedAt,
            candidate,
            imagePngBytes,
          })
          const id = uniqueLayerId(initial, layers)
          const assetPath = `assets/layers/${id}.png`
          sources[assetPath] = { sourcePath: candidate.assetPath }
          layers.push(
            layerFromCandidate(
              candidate,
              id,
              assetPath,
              provenance,
              candidate.candidateId === anchorId,
            ),
          )
        }
        this.requireSameDocument(tabId, owner, initial.documentId)
        const projected = { ...initial, layers: [...layers, ...initial.layers] }
        preflightProjectedDocument(projected)
        this.requireSameDocument(tabId, owner, initial.documentId)
        if (owner.document.documentRevision !== initial.documentRevision) {
          throw new ProjectGenerationAcceptanceError(
            'ACCEPTANCE_CONFLICT',
            'The Project changed while Add was being prepared. Review the results again.',
          )
        }
        requireExpectedJobIds(
          await this.scopedUnfinishedJobs(tabId, initial.documentId, sessionIds),
          expectedUnfinishedJobIds,
        )
        if (unfinished.length > 0) {
          this.pendingCancellations.set(tabId, {
            documentId: initial.documentId,
            jobIds: [...expectedUnfinishedJobIds],
            projectPath: owner.filePath,
            stagingSessionIds: [...sessionIds],
          })
          retainFence = true
          await this.finishPendingCancellation(tabId, owner)
          retainFence = pending !== undefined
        }
        // A sibling can finish before its cancel request. Do not silently discard a new result
        // that was absent from the user's confirmation; queue cancellation itself is irreversible.
        const afterCancellation = (await this.options.staging.listVerifiedCandidates(tabId)).filter(
          (candidate) =>
            candidate.documentId === initial.documentId && candidate.projectPath === owner.filePath,
        )
        requireExpectedAvailable(afterCancellation, expectedAvailableIds)
        this.requireSameDocument(tabId, owner, initial.documentId)
        const handoff: GenerationAcceptanceHandoff = {
          acceptedLayers: structuredClone(layers),
          documentId: initial.documentId,
          localProjectKey: tabId,
          operationId: randomUUID(),
          projectPath: owner.filePath,
          stagingSessionIds: sessionIds,
        }
        // Keep the in-process intent even if SQLite reports an uncertain commit. Recovery can
        // inspect/abandon a pre-apply intent, but cannot guess whether its write reached disk.
        this.pending.set(tabId, handoff)
        retainFence = true
        await this.options.journal.record(handoff)
        const applied = await owner.applyDocument(projected, sources, {
          expectedDocumentRevision: initial.documentRevision,
        })
        const after = owner.document
        if (
          after.documentRevision !== applied.documentRevision ||
          !sameAcceptedLayers(after, layers)
        ) {
          throw new ProjectGenerationAcceptanceError(
            'ACCEPTANCE_CONFLICT',
            'The accepted Project layers changed before recovery could commit.',
          )
        }
        await this.requireDurable(owner, tabId, initial.documentId, applied.documentRevision, false)
        await this.options.afterDurableShadow?.()
        this.requireSameDocument(tabId, owner, initial.documentId)
        if (owner.document.documentRevision !== applied.documentRevision) {
          throw new ProjectGenerationAcceptanceError(
            'ACCEPTANCE_SHADOW_UNCONFIRMED',
            'The Project changed after its accepted revision reached recovery storage.',
          )
        }
        if (handoffProof(owner.document, handoff) !== 'complete') {
          throw handoffRecoveryError()
        }
        await this.options.journal.complete(handoff)
        await this.options.staging.discardSessions(tabId, sessionIds)
        this.pending.delete(tabId)
        retainFence = false
        return {
          documentRevision: owner.document.documentRevision,
          kind: 'accepted',
          layerIds: layers.map((layer) => layer.id),
        }
      } finally {
        if (fenced) {
          if (retainFence) {
            this.unresolved.add(tabId)
          } else {
            this.unresolved.delete(tabId)
            this.options.orchestrator.releaseProjectGenerationFence(tabId)
          }
        }
      }
    })
  }

  /** Close must not release an acceptance fence or discard its candidate before reconciliation. */
  hasPendingHandoff(tabId: string): boolean {
    return (
      this.pending.has(tabId) || this.pendingCancellations.has(tabId) || this.unresolved.has(tabId)
    )
  }

  /**
   * Resolve a crash after the accepted document reached its shadow but before session tombstones.
   * Call after Project recovery/open and before any new Generate admission for that Project.
   */
  async reconcile(tabId: string): Promise<'cleaned' | 'none'> {
    if (!projectKeyPattern.test(tabId)) {
      throw new ProjectGenerationAcceptanceError(
        'ACCEPTANCE_INPUT_INVALID',
        'Project ID is invalid.',
      )
    }
    return await this.options.gate.run(tabId, async () => {
      const owner = this.requireDocument(tabId)
      let fenced = false
      let retainFence = this.hasPendingHandoff(tabId)
      try {
        fenced = true
        await this.options.orchestrator.fenceProjectGeneration(tabId)
        await this.finishPendingCancellation(tabId, owner)
        // If recovery storage cannot be inspected, admission must stay blocked until a later
        // successful reconciliation establishes whether an accepted candidate is still staged.
        retainFence = true
        const document = structuredClone(owner.document)
        this.requireSameDocument(tabId, owner, document.documentId)
        const pending = await this.loadHandoff(tabId, document.documentId)
        if (pending) {
          if (pending.projectPath !== owner.filePath) {
            throw handoffRecoveryError()
          }
          const proof = handoffProof(document, pending)
          if (proof === 'absent') {
            // A durable intent is not a committed Add. This includes a crash before apply and a
            // full Undo: keep every candidate and permit a later explicit Add.
            await this.options.journal.abandon(pending)
            this.pending.delete(tabId)
            retainFence = false
            return 'none'
          }
          if (proof !== 'complete') {
            throw handoffRecoveryError()
          }
          await this.requireNoUnfinishedJobs(tabId, document.documentId, pending.stagingSessionIds)
          await this.requireDurable(
            owner,
            tabId,
            document.documentId,
            document.documentRevision,
            true,
          )
          if (handoffProof(owner.document, pending) !== 'complete') {
            throw handoffRecoveryError()
          }
          await this.options.journal.complete(pending)
          await this.options.staging.discardSessions(tabId, pending.stagingSessionIds)
          this.pending.delete(tabId)
          retainFence = false
          return 'cleaned'
        }
        const accepted = acceptedLayers(document)
        const staged = await this.options.staging.listVerifiedCandidates(tabId)
        const overlap = staged.some(
          (candidate) =>
            candidate.documentId === document.documentId &&
            candidate.projectPath === owner.filePath &&
            accepted.has(candidate.candidateId),
        )
        if (!overlap) {
          retainFence = false
          return 'none'
        }
        const acceptedSessionIds = [
          ...new Set(
            staged
              .filter(
                (candidate) =>
                  candidate.documentId === document.documentId &&
                  candidate.projectPath === owner.filePath &&
                  accepted.has(candidate.candidateId),
              )
              .map((candidate) => candidate.stagingSessionId),
          ),
        ]
        await this.requireNoUnfinishedJobs(tabId, document.documentId, acceptedSessionIds)
        await this.requireDurable(
          owner,
          tabId,
          document.documentId,
          document.documentRevision,
          true,
        )
        const sessionIds = [
          ...new Set(
            staged
              .filter(
                (candidate) =>
                  candidate.documentId === document.documentId &&
                  candidate.projectPath === owner.filePath &&
                  accepted.has(candidate.candidateId),
              )
              .map((candidate) => candidate.stagingSessionId),
          ),
        ]
        // Legacy Add operations have no journal. Only accepted-candidate sessions are proven;
        // deleting other sessions could erase work that never belonged to that operation.
        await this.options.staging.discardSessions(tabId, sessionIds)
        this.pending.delete(tabId)
        retainFence = false
        return 'cleaned'
      } finally {
        if (fenced) {
          if (retainFence) {
            this.unresolved.add(tabId)
          } else {
            this.unresolved.delete(tabId)
            this.options.orchestrator.releaseProjectGenerationFence(tabId)
          }
        }
      }
    })
  }

  private async finishPendingCancellation(
    tabId: string,
    owner: ProjectGenerationAcceptanceDocument,
  ): Promise<void> {
    const pending = this.pendingCancellations.get(tabId)
    if (!pending) {
      return
    }
    this.requireSameDocument(tabId, owner, pending.documentId)
    if (owner.filePath !== pending.projectPath) {
      throw handoffRecoveryError()
    }
    await this.options.orchestrator.cancelAcceptanceJobs(
      tabId,
      pending.documentId,
      pending.stagingSessionIds,
      pending.jobIds,
    )
    await this.requireNoUnfinishedJobs(tabId, pending.documentId, pending.stagingSessionIds)
    this.requireSameDocument(tabId, owner, pending.documentId)
    this.pendingCancellations.delete(tabId)
  }

  private async loadHandoff(
    tabId: string,
    documentId: string,
  ): Promise<GenerationAcceptanceHandoff | undefined> {
    const durable = await this.options.journal.read(tabId, documentId)
    const local = this.pending.get(tabId)
    if (durable && local && durable.operationId !== local.operationId) {
      throw handoffRecoveryError()
    }
    const handoff = durable ?? local
    if (handoff) {
      if (handoff.documentId !== documentId) {
        throw handoffRecoveryError()
      }
      this.pending.set(tabId, handoff)
    }
    return handoff
  }

  private requireDocument(tabId: string): ProjectGenerationAcceptanceDocument {
    const owner = this.options.documents.getOpenDocument(tabId)
    if (!owner) {
      throw new ProjectGenerationAcceptanceError('PROJECT_NOT_OPEN', 'Open the Project first.')
    }
    return owner
  }

  private async requireDurable(
    owner: ProjectGenerationAcceptanceDocument,
    tabId: string,
    documentId: string,
    expectedRevision: string,
    allowSavedPackage: boolean,
  ): Promise<void> {
    this.requireSameDocument(tabId, owner, documentId)
    if (owner.document.documentRevision !== expectedRevision) {
      throw new ProjectGenerationAcceptanceError(
        'ACCEPTANCE_CONFLICT',
        'The Project changed during result acceptance.',
      )
    }
    let commit: ProjectShadowCommit | null
    try {
      commit = await owner.flush()
    } catch (error) {
      throw new ProjectGenerationAcceptanceError(
        'ACCEPTANCE_SHADOW_UNCONFIRMED',
        `The accepted Project change could not be verified in recovery storage: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    this.requireSameDocument(tabId, owner, documentId)
    if (owner.document.documentRevision !== expectedRevision) {
      throw new ProjectGenerationAcceptanceError(
        'ACCEPTANCE_SHADOW_UNCONFIRMED',
        'The accepted Project change has not been confirmed in recovery storage.',
      )
    }
    if (!commit && allowSavedPackage && !owner.dirty) {
      await proveSavedPackage(owner)
      this.requireSameDocument(tabId, owner, documentId)
      if (owner.document.documentRevision === expectedRevision && !owner.dirty) {
        return
      }
    }
    if (
      !commit ||
      !commit.directorySynced ||
      commit.documentRevision !== expectedRevision ||
      commit.documentId !== documentId ||
      commit.localRecoveryKey !== tabId
    ) {
      throw new ProjectGenerationAcceptanceError(
        'ACCEPTANCE_SHADOW_UNCONFIRMED',
        'The accepted Project change has not been confirmed in recovery storage.',
      )
    }
  }

  private async requireNoUnfinishedJobs(
    tabId: string,
    documentId: string,
    sessionIds: readonly string[],
  ): Promise<void> {
    if ((await this.scopedUnfinishedJobs(tabId, documentId, sessionIds)).length > 0) {
      throw new ProjectGenerationAcceptanceError(
        'ACCEPTANCE_UNFINISHED_JOBS',
        'The remaining sibling jobs have not confirmed cancellation. Review the results and retry Add.',
      )
    }
  }

  private requireSameDocument(
    tabId: string,
    owner: ProjectGenerationAcceptanceDocument,
    documentId: string,
  ): void {
    if (
      this.options.documents.getOpenDocument(tabId) !== owner ||
      owner.document.documentId !== documentId
    ) {
      throw new ProjectGenerationAcceptanceError(
        'PROJECT_DOCUMENT_CHANGED',
        'The Project document changed during result acceptance.',
      )
    }
  }

  private async scopedUnfinishedJobs(
    tabId: string,
    documentId: string,
    sessionIds: readonly string[],
  ) {
    const sessions = new Set(sessionIds)
    return (await this.options.queue.listUnfinishedByProjectDocument(tabId, documentId)).filter(
      (item) => sessions.has(item.stagingSessionId),
    )
  }
}

function validateRequest(
  tabId: string,
  candidateIds: readonly string[],
  focusedCandidateId: string | null,
  expectedAvailableIds: readonly string[],
): void {
  if (
    !projectKeyPattern.test(tabId) ||
    !Array.isArray(candidateIds) ||
    candidateIds.length < 1 ||
    candidateIds.length > MAX_ACCEPTED_PER_OPERATION ||
    candidateIds.some((id) => typeof id !== 'string' || !uuidPattern.test(id)) ||
    new Set(candidateIds).size !== candidateIds.length ||
    !Array.isArray(expectedAvailableIds) ||
    expectedAvailableIds.length > IGS_SAFETY_CEILINGS.archiveEntries ||
    expectedAvailableIds.some((id) => typeof id !== 'string' || !uuidPattern.test(id)) ||
    new Set(expectedAvailableIds).size !== expectedAvailableIds.length ||
    (focusedCandidateId !== null &&
      (typeof focusedCandidateId !== 'string' || !uuidPattern.test(focusedCandidateId)))
  ) {
    throw new ProjectGenerationAcceptanceError(
      'ACCEPTANCE_INPUT_INVALID',
      'Select between 1 and 64 distinct generation results.',
    )
  }
}

function validateJobIds(ids: readonly string[]): void {
  if (
    !Array.isArray(ids) ||
    ids.length > IGS_SAFETY_CEILINGS.archiveEntries ||
    ids.some((id) => typeof id !== 'string' || !uuidPattern.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new ProjectGenerationAcceptanceError(
      'ACCEPTANCE_INPUT_INVALID',
      'The confirmed generation job set is invalid.',
    )
  }
}

function requireExpectedJobIds(
  current: readonly { id: string }[],
  expected: readonly string[],
): void {
  if (current.length > 0 && expected.length === 0) {
    throw new ProjectGenerationAcceptanceError(
      'ACCEPTANCE_UNFINISHED_JOBS',
      'Adding now will cancel unfinished sibling jobs. Review and confirm their count first.',
    )
  }
  const ids = new Set(current.map((item) => item.id))
  if (ids.size !== expected.length || expected.some((id) => !ids.has(id))) {
    throw new ProjectGenerationAcceptanceError(
      'ACCEPTANCE_SELECTION_STALE',
      'Generation jobs changed. Refresh the results and confirm Add again.',
    )
  }
}

function requireExpectedAvailable(
  owned: readonly VerifiedGenerationCandidate[],
  expectedAvailableIds: readonly string[],
): void {
  const current = new Set(owned.map((candidate) => candidate.candidateId))
  if (
    current.size !== expectedAvailableIds.length ||
    expectedAvailableIds.some((id) => !current.has(id))
  ) {
    throw new ProjectGenerationAcceptanceError(
      'ACCEPTANCE_SELECTION_STALE',
      'Generation results changed. Refresh the results and confirm Add again.',
    )
  }
}

function candidateKey(candidateIds: readonly string[]): string {
  return [...candidateIds].sort().join(':')
}

function uniqueLayerId(document: IgsProjectDocumentV1, prepared: readonly RasterLayer[]): string {
  let id = randomUUID()
  while (
    document.layers.some((layer) => layer.id === id) ||
    prepared.some((layer) => layer.id === id)
  ) {
    id = randomUUID()
  }
  return id
}

function layerFromCandidate(
  candidate: VerifiedGenerationCandidate,
  id: string,
  assetPath: string,
  provenance: NonNullable<RasterLayer['generationProvenance']>,
  visible: boolean,
): RasterLayer {
  return {
    asset: {
      bytes: candidate.image.byteSize,
      height: candidate.image.height,
      path: assetPath,
      sha256: candidate.image.sha256,
      width: candidate.image.width,
    },
    blendMode: 'normal',
    generationProvenance: provenance,
    id,
    kind: 'raster',
    locked: false,
    name: `Generated ${candidate.completionOrder}`,
    opacity: 1,
    transform: {
      rotationDegrees: 0,
      scaleX: 1,
      scaleY: 1,
      x: candidate.bbox.x,
      y: candidate.bbox.y,
    },
    visible,
  }
}

function sameAcceptedLayers(
  document: IgsProjectDocumentV1,
  expected: readonly RasterLayer[],
): boolean {
  return expected.every((layer) => {
    const current = document.layers.find((candidate) => candidate.id === layer.id)
    return (
      current !== undefined &&
      current.kind === layer.kind &&
      isDeepStrictEqual(current.asset, layer.asset) &&
      isDeepStrictEqual(current.sourceIccProfile, layer.sourceIccProfile) &&
      isDeepStrictEqual(current.generationProvenance, layer.generationProvenance)
    )
  })
}

function candidateIdFromLayer(layer: RasterLayer): string {
  return layer.generationProvenance!.executionResultContext.candidateId
}

function handoffProof(
  document: IgsProjectDocumentV1,
  handoff: GenerationAcceptanceHandoff,
): 'absent' | 'changed' | 'complete' {
  if (sameAcceptedLayers(document, handoff.acceptedLayers)) {
    return 'complete'
  }
  const represented = handoff.acceptedLayers.some((expected) =>
    document.layers.some(
      (current) =>
        current.id === expected.id ||
        current.generationProvenance?.executionResultContext.candidateId ===
          candidateIdFromLayer(expected),
    ),
  )
  return represented ? 'changed' : 'absent'
}

function handoffRecoveryError(): ProjectGenerationAcceptanceError {
  return new ProjectGenerationAcceptanceError(
    'ACCEPTANCE_RECOVERY_REQUIRED',
    'The interrupted Add is only partially represented or its accepted result identity changed. Keep temporary results and repair recovery before adding more.',
  )
}

/** Reject package limits that the new layer references can exceed before the document is edited. */
function preflightProjectedDocument(document: IgsProjectDocumentV1): void {
  // ProjectShadowStore and the package writer serialize this member with JSON.stringify.
  const projectJsonBytes = Buffer.byteLength(JSON.stringify(document), 'utf8')
  if (projectJsonBytes > IGS_SAFETY_CEILINGS.projectJsonBytes) {
    throw new ProjectGenerationAcceptanceError(
      'ACCEPTANCE_PACKAGE_LIMIT',
      'Adding these results would exceed the Project document size limit.',
    )
  }

  const assets = new Map<string, { bytes: number; path: string; raw: unknown; sha256: string }>()
  for (const layer of document.layers) {
    for (const asset of [layer.asset, layer.sourceIccProfile]) {
      if (!asset) {
        continue
      }
      const member = { bytes: asset.bytes, path: asset.path, raw: asset, sha256: asset.sha256 }
      const existing = assets.get(asset.path)
      if (existing && !isDeepStrictEqual(existing.raw, asset)) {
        throw new ProjectGenerationAcceptanceError(
          'ACCEPTANCE_CONFLICT',
          'The Project contains conflicting asset references.',
        )
      }
      assets.set(asset.path, member)
    }
  }
  // The writer adds mimetype, manifest.json, project.json and two preview members.
  if (assets.size + 5 > DEFAULT_IGS_PACKAGE_LIMITS.archiveEntries) {
    throw new ProjectGenerationAcceptanceError(
      'ACCEPTANCE_PACKAGE_LIMIT',
      'Adding these results would exceed the Project package entry limit.',
    )
  }
  const maxPreviewRect = {
    height: IGS_SAFETY_CEILINGS.previewExtent,
    width: IGS_SAFETY_CEILINGS.previewExtent,
    x: -IGS_SAFETY_CEILINGS.previewCoordinateMagnitude,
    y: -IGS_SAFETY_CEILINGS.previewCoordinateMagnitude,
  }
  const manifest = {
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    members: [
      { bytes: projectJsonBytes, path: 'project.json', sha256: 'f'.repeat(64) },
      {
        bytes: DEFAULT_IGS_PACKAGE_LIMITS.thumbnailBytes,
        path: 'preview/thumbnail.webp',
        sha256: 'f'.repeat(64),
      },
      {
        bytes: DEFAULT_IGS_PACKAGE_LIMITS.mergedPreviewBytes,
        path: 'preview/merged.png',
        sha256: 'f'.repeat(64),
      },
      ...[...assets.values()].map(({ bytes, path: assetPath, sha256 }) => ({
        bytes,
        path: assetPath,
        sha256,
      })),
    ],
    preview: { rect: maxPreviewRect, status: 'unavailable' },
    schemaVersion: IGS_SCHEMA_VERSION,
  }
  const manifestJsonBytes = Buffer.byteLength(JSON.stringify(manifest), 'utf8')
  const totalBytes =
    Buffer.byteLength(IGS_MIMETYPE, 'utf8') +
    manifestJsonBytes +
    projectJsonBytes +
    DEFAULT_IGS_PACKAGE_LIMITS.thumbnailBytes +
    DEFAULT_IGS_PACKAGE_LIMITS.mergedPreviewBytes +
    [...assets.values()].reduce((sum, asset) => sum + asset.bytes, 0)
  if (
    manifestJsonBytes > DEFAULT_IGS_PACKAGE_LIMITS.manifestJsonBytes ||
    totalBytes > DEFAULT_IGS_PACKAGE_LIMITS.archiveUncompressedBytes
  ) {
    throw new ProjectGenerationAcceptanceError(
      'ACCEPTANCE_PACKAGE_LIMIT',
      'Adding these results would exceed a Project package size limit.',
    )
  }
}

/** A clean replay may use a verified, already saved package instead of a discarded shadow. */
async function proveSavedPackage(owner: ProjectGenerationAcceptanceDocument): Promise<void> {
  try {
    const target = owner.filePath
    const before = await lstat(target, { bigint: true })
    if (!before.isFile() || before.isSymbolicLink() || (await realpath(target)) !== target) {
      throw new Error('The saved Project path is not a canonical regular file.')
    }
    // readIgsPackage verifies every ZIP member, not only the Project JSON.
    const packageContent = await readIgsPackage(target)
    if (!isDeepStrictEqual(packageContent.project, owner.document)) {
      throw new Error('The saved Project document differs from the accepted document.')
    }
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      if (!sameFileStat(before, await file.stat({ bigint: true }))) {
        throw new Error('The saved Project file changed during verification.')
      }
      await file.sync()
    } finally {
      await file.close()
    }
    const directory = await open(
      path.dirname(target),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
    if (!sameFileStat(before, await lstat(target, { bigint: true }))) {
      throw new Error('The saved Project file changed during verification.')
    }
  } catch (error) {
    throw new ProjectGenerationAcceptanceError(
      'ACCEPTANCE_SHADOW_UNCONFIRMED',
      `The saved Project could not be verified for result handoff: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function sameFileStat(a: BigIntStats, b: BigIntStats): boolean {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeNs === b.mtimeNs &&
    a.ctimeNs === b.ctimeNs &&
    a.mode === b.mode
  )
}
