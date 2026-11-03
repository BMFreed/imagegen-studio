import type {
  IgsProjectDocumentV1,
  IgsRasterLayerV1,
} from '../../shared/projects/project-schema.js'
import {
  IGS_MIMETYPE,
  IGS_SAFETY_CEILINGS,
  IGS_SCHEMA_VERSION,
  parseProjectDocumentV1,
  projectAssetReferences,
  projectOwnedIds,
  projectRasterLayers,
} from '../../shared/projects/project-schema.js'

import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type {
  GenerationAcceptanceHandoff,
  GenerationAcceptanceJournalRepository,
  SmartPatchRasterAcceptanceSource,
} from './generation-acceptance-journal.js'
import type {
  GenerationOrchestrator,
  SmartPatchAcceptanceCancellationScope,
} from './generation-orchestrator.js'
import type {
  GenerationQueueRepository,
  VerifiedQueuedSmartPatchInput,
} from './generation-queue.js'
import type {
  GenerationStagingRepository,
  VerifiedGenerationCandidate,
} from './generation-staging.js'
import type { IgsAssetSource } from './igs-package.js'
import type { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import type { ProjectShadowCommit } from './project-shadow.js'
import type {
  SmartPatchGenerationStagingRepository,
  VerifiedSmartPatchWorldCandidate,
} from './smart-patch-generation-staging.js'

import { preflightGenerationAcceptanceHandoff } from './generation-acceptance-journal.js'
import { isQueuedOutpaint } from './generation-queue.js'
import { DEFAULT_IGS_PACKAGE_LIMITS } from './igs-package.js'
import { proveAcceptedSavedPackage } from './project-accepted-save-proof.js'
import { provenanceFromVerifiedRasterCandidate } from './project-generation-provenance.js'
import { canonicalProjectPath, localProjectRecoveryKey } from './project-identity.js'
import { projectVerifiedSmartPatchVariant } from './project-smart-patch-variant-projection.js'
import { parseAcceptedGenerationBaseV1 } from './regional-queued-generation.js'

const projectKeyPattern = /^project-v1-[a-f0-9]{64}$/
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const MAX_ACCEPTED_PER_OPERATION = 64

/** ProjectAutosaveCoordinator satisfies this interface; only Main may obtain it. */
export interface ProjectGenerationAcceptanceDocument {
  applyDocument: (
    input: unknown,
    sources: Readonly<Record<string, IgsAssetSource>>,
    options: { expectedDocumentEpoch?: number; expectedDocumentRevision: string },
  ) => Promise<{ documentRevision: string }>
  readonly dirty: boolean
  readonly document: IgsProjectDocumentV1
  readonly documentEpoch?: number
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
  smartPatch?: SmartPatchRasterAcceptanceDependencies
  staging: Pick<
    GenerationStagingRepository,
    'discardSessions' | 'listVerifiedCandidates' | 'readVerifiedCandidatePng'
  >
}

export interface SmartPatchRasterAcceptanceDependencies {
  orchestrator: Pick<GenerationOrchestrator, 'cancelSmartPatchAcceptanceJobs'>
  queue: Pick<
    GenerationQueueRepository,
    | 'listSmartPatchAcceptanceSessionJobs'
    | 'listUnfinishedSmartPatchJobsByProject'
    | 'loadVerifiedSmartPatchInput'
  >
  staging: Pick<
    SmartPatchGenerationStagingRepository,
    'discardSessions' | 'listVerifiedCandidates' | 'readVerifiedCandidate'
  >
}

export interface SmartPatchOrphanRasterAcceptRequest {
  candidateIds: readonly string[]
  expectedAvailableIds: readonly string[]
  expectedOwner: {
    documentEpoch: number
    documentId: string
    documentRevision: string
    layerId: string
  }
  expectedUnfinishedJobIds: readonly string[]
  focusedCandidateId: string | null
}

export type ProjectGenerationAcceptanceResult = {
  documentRevision: string
  kind: 'accepted' | 'already-accepted'
  layerIds: string[]
}

type RasterLayer = IgsRasterLayerV1
type SmartRasterCancellationScope = SmartPatchAcceptanceCancellationScope & {
  reviewedJobs?: SmartPatchRasterAcceptanceSource['reviewedJobs']
}

type PendingCancellation = {
  documentId: string
  jobIds: string[]
  projectPath: string
  stagingSessionIds: string[]
}

/** Smart source operations stay typed; no ordinary candidate or frozen payload is fabricated. */
class SmartPatchRasterSourceAdapter {
  constructor(private readonly options: SmartPatchRasterAcceptanceDependencies) {}

  async cancel(scope: SmartPatchAcceptanceCancellationScope): Promise<void> {
    await this.options.orchestrator.cancelSmartPatchAcceptanceJobs(scope)
  }

  async captureReviewedJobs(
    scope: SmartRasterCancellationScope,
    assertCurrent: () => void,
  ): Promise<SmartRasterCancellationScope> {
    const list = this.options.queue.listUnfinishedSmartPatchJobsByProject
    const unfinished = (await list.call(this.options.queue, scope.tabId)).filter(
      (job) =>
        job.localProjectKey === scope.tabId &&
        job.projectPath === scope.projectPath &&
        job.documentId === scope.documentId &&
        job.layerId === scope.layerId,
    )
    assertCurrent()
    requireExpectedJobIds(unfinished, scope.expectedUnfinishedJobIds)
    const sessions = [
      ...new Set([...scope.stagingSessionIds, ...unfinished.map((job) => job.stagingSessionId)]),
    ]
    if (
      sessions.length > IGS_SAFETY_CEILINGS.archiveEntries ||
      unfinished.length > IGS_SAFETY_CEILINGS.archiveEntries
    ) {
      throw new ProjectGenerationAcceptanceError(
        'ACCEPTANCE_PACKAGE_LIMIT',
        'The reviewed Smart Patch job/session set exceeds the recovery metadata limit.',
      )
    }
    const load = this.options.queue.loadVerifiedSmartPatchInput
    const reviewedJobs: NonNullable<SmartPatchRasterAcceptanceSource['reviewedJobs']> = []
    for (const job of unfinished) {
      const input = await load.call(this.options.queue, job.id)
      assertCurrent()
      const witness = smartJobWitness(input, scope)
      if (witness.jobId !== job.id || witness.stagingSessionId !== job.stagingSessionId) {
        throw handoffRecoveryError()
      }
      reviewedJobs.push(witness)
    }
    return { ...scope, reviewedJobs, stagingSessionIds: sessions }
  }

  async discard(tabId: string, sessions: readonly string[]): Promise<void> {
    await this.options.staging.discardSessions(tabId, sessions)
  }

  async exclusive(
    scope: SmartPatchAcceptanceCancellationScope,
    smart: readonly VerifiedSmartPatchWorldCandidate[],
    normal: ProjectGenerationAcceptanceOptions['staging'],
  ): Promise<void> {
    const sessions = new Set(scope.stagingSessionIds)
    if (
      smart.some(
        (candidate) =>
          sessions.has(candidate.stagingSessionId) &&
          (candidate.localProjectKey !== scope.tabId ||
            candidate.projectPath !== scope.projectPath ||
            candidate.documentId !== scope.documentId ||
            candidate.payload.context.layerId !== scope.layerId),
      )
    ) {
      throw handoffRecoveryError()
    }
    if (
      (await normal.listVerifiedCandidates(scope.tabId)).some((candidate) =>
        sessions.has(candidate.stagingSessionId),
      )
    ) {
      throw handoffRecoveryError()
    }
  }

  async jobs(scope: SmartPatchAcceptanceCancellationScope) {
    return await this.options.queue.listSmartPatchAcceptanceSessionJobs({
      ...scope,
      localProjectKey: scope.tabId,
    })
  }

  async list(tabId: string): Promise<VerifiedSmartPatchWorldCandidate[]> {
    return await this.options.staging.listVerifiedCandidates(tabId)
  }

  owned(
    candidates: readonly VerifiedSmartPatchWorldCandidate[],
    projectPath: string,
    documentId: string,
    layerId: string,
  ): VerifiedSmartPatchWorldCandidate[] {
    const projectKey = localProjectRecoveryKey(projectPath)
    return candidates.filter(
      (candidate) =>
        candidate.localProjectKey === projectKey &&
        candidate.projectPath === projectPath &&
        candidate.documentId === documentId &&
        candidate.payload.context.layerId === layerId,
    )
  }

  async project(
    candidate: VerifiedSmartPatchWorldCandidate,
    acceptedAt: string,
    id: string,
    visible: boolean,
  ): Promise<{ layer: RasterLayer; sourcePath: string }> {
    const read = await this.options.staging.readVerifiedCandidate({
      ...smartWitness(candidate),
      documentId: candidate.documentId,
      imageSha256: candidate.image.sha256,
      localProjectKey: candidate.localProjectKey,
    })
    if (!read || !isDeepStrictEqual(read.candidate, candidate)) {
      throw new ProjectGenerationAcceptanceError(
        'ACCEPTANCE_CANDIDATE_UNAVAILABLE',
        'The exact Smart Patch contribution or frozen context changed before Add.',
      )
    }
    const variant = await projectVerifiedSmartPatchVariant({ acceptedAt, read, variantId: id })
    return {
      layer: {
        asset: variant.asset,
        blendMode: 'normal',
        generationProvenance: variant.generationProvenance,
        id,
        kind: 'raster',
        locked: false,
        name: variant.name,
        opacity: 1,
        transform: {
          rotationDegrees: 0,
          scaleX: 1,
          scaleY: 1,
          x: variant.bbox.x,
          y: variant.bbox.y,
        },
        visible,
      },
      sourcePath: read.candidate.assetPath,
    }
  }

  async verifyReviewedJobs(
    scope: SmartRasterCancellationScope,
    allowPruned: boolean,
  ): Promise<void> {
    if (!scope.reviewedJobs?.length) {
      return
    }
    const load = this.options.queue.loadVerifiedSmartPatchInput
    for (const expected of scope.reviewedJobs) {
      let input: VerifiedQueuedSmartPatchInput
      try {
        input = await load.call(this.options.queue, expected.jobId)
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'QUEUE_ITEM_NOT_FOUND' &&
          (allowPruned ||
            scope.verifiedCandidates.some(
              (candidate) =>
                candidate.candidateId === expected.jobId &&
                candidate.stagingSessionId === expected.stagingSessionId &&
                candidate.frozenPayloadSha256 === expected.frozenPayloadSha256,
            ))
        ) {
          // A journal or retained cancellation scope proves this exact job's original ownership.
          // This is only permission to reach the cancellation owner again: its independent session/
          // receipt checks and physical quiescence must still qualify a pruned job's absence.
          continue
        }
        throw error
      }
      if (!isDeepStrictEqual(smartJobWitness(input, scope), expected)) {
        throw handoffRecoveryError()
      }
    }
  }
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
  for (const layer of projectRasterLayers(document)) {
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
  private readonly smartCancellations = new Map<string, SmartRasterCancellationScope>()
  private readonly smartCancellationStarted = new Set<string>()
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
        if (this.smartCancellations.has(tabId)) {
          // Both sources share this Raster owner. Never register an ordinary cancellation while
          // Smart cancellation still retains its physical-exit scope: neither may drain the other.
          retainFence = true
          throw new ProjectGenerationAcceptanceError(
            'ACCEPTANCE_HANDOFF_PENDING',
            'Finish recovery of the Smart Patch Raster Add before accepting ordinary results.',
          )
        }
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
            (candidate.localProjectKey !== tabId ||
              candidate.candidateId !== candidate.queueItemId ||
              createHash('sha256').update(candidate.frozenPayloadJson).digest('hex') !==
                candidate.frozenPayloadSha256)
          ) {
            throw new ProjectGenerationAcceptanceError(
              'ACCEPTANCE_CANDIDATE_UNAVAILABLE',
              'The selected generation result identity or frozen context changed before Add.',
            )
          }
          if (
            candidateIds.includes(candidate.candidateId) &&
            candidate.documentId === owner.document.documentId &&
            candidate.projectPath === owner.filePath &&
            isQueuedOutpaint(parseAcceptedGenerationBaseV1(candidate.frozenPayloadJson))
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
          if (pending.smartPatchSource) {
            throw new ProjectGenerationAcceptanceError(
              'ACCEPTANCE_HANDOFF_PENDING',
              'Finish recovery of the Smart Patch Raster Add before accepting ordinary results.',
            )
          }
          const proof = handoffProof(initial, pending)
          if (pending.projectPath !== owner.filePath || proof === 'changed') {
            throw handoffRecoveryError()
          }
          if (proof === 'absent') {
            await this.abandonHandoff(tabId, owner, pending)
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

  /** Exact frozen Smart contributions become new Raster owners, without current-layer or worker IO. */
  async acceptSmartPatchOrphans(
    tabId: string,
    input: SmartPatchOrphanRasterAcceptRequest,
  ): Promise<ProjectGenerationAcceptanceResult> {
    const request = snapshotSmartRequest(tabId, input)
    return await this.options.gate.run(tabId, async () => {
      const owner = this.requireDocument(tabId)
      const source = this.smartSource()
      const assertInitial = () => this.requireSmartOwner(tabId, owner, request.expectedOwner)
      assertInitial()
      let retain = this.hasPendingHandoff(tabId)
      try {
        await this.options.orchestrator.fenceProjectGeneration(tabId)
        assertInitial()
        if ((await canonicalProjectPath(owner.filePath)) !== owner.filePath) {
          throw handoffRecoveryError()
        }
        assertInitial()
        retain = true
        await this.finishPendingCancellation(tabId, owner)
        await this.finishSmartCancellation(tabId, owner, assertInitial)
        assertInitial()
        const initial = structuredClone(owner.document)
        let pending = await this.loadHandoff(tabId, initial.documentId)
        if (pending) {
          const proof = handoffProof(initial, pending)
          if (pending.projectPath !== owner.filePath || proof === 'changed') {
            throw handoffRecoveryError()
          }
          if (proof === 'absent') {
            await this.abandonHandoff(tabId, owner, pending)
            assertInitial()
            pending = undefined
          } else {
            if (
              !pending.smartPatchSource ||
              pending.smartPatchSource.layerId !== request.expectedOwner.layerId ||
              candidateKey(pending.acceptedLayers.map(candidateIdFromLayer)) !==
                candidateKey(request.candidateIds)
            ) {
              throw new ProjectGenerationAcceptanceError(
                'ACCEPTANCE_HANDOFF_PENDING',
                'Finish recovery of the previous Add before accepting different results.',
              )
            }
            await this.finishSmartHandoff(tabId, owner, pending)
            retain = false
            return {
              documentRevision: owner.document.documentRevision,
              kind: 'already-accepted',
              layerIds: request.candidateIds.map(
                (id) =>
                  pending!.acceptedLayers.find((layer) => candidateIdFromLayer(layer) === id)!.id,
              ),
            }
          }
        }
        const all = await source.list(tabId)
        assertInitial()
        retain = false
        const owned = source.owned(
          all,
          owner.filePath,
          initial.documentId,
          request.expectedOwner.layerId,
        )
        const existing = acceptedLayers(initial)
        if (
          all.some(
            (candidate) =>
              candidate.documentId === initial.documentId &&
              candidate.projectPath === owner.filePath &&
              (existing.has(candidate.candidateId) ||
                hasNestedCandidate(initial, [candidate.candidateId])),
          )
        ) {
          retain = true
          throw handoffRecoveryError()
        }
        const accepted = request.candidateIds.map((id) => existing.get(id))
        if (accepted.every((layer) => layer !== undefined)) {
          retain = true
          if (
            accepted.some(
              (layer) =>
                !isSmartRasterForTarget(layer, initial.documentId, request.expectedOwner.layerId),
            ) ||
            all.some((candidate) => request.candidateIds.includes(candidate.candidateId)) ||
            hasNestedCandidate(initial, request.candidateIds)
          ) {
            throw handoffRecoveryError()
          }
          await this.requireDurable(
            owner,
            tabId,
            initial.documentId,
            initial.documentRevision,
            true,
          )
          assertInitial()
          retain = false
          return {
            documentRevision: initial.documentRevision,
            kind: 'already-accepted',
            layerIds: accepted.map((layer) => layer.id),
          }
        }
        if (
          accepted.some((layer) => layer !== undefined) ||
          hasNestedCandidate(initial, request.candidateIds)
        ) {
          retain = true
          throw handoffRecoveryError()
        }
        requireExpectedAvailable(owned, request.expectedAvailableIds)
        const selected = owned.filter((candidate) =>
          request.candidateIds.includes(candidate.candidateId),
        )
        selected.sort(
          (a, b) =>
            a.completionOrder - b.completionOrder || a.candidateId.localeCompare(b.candidateId),
        )
        if (selected.length !== request.candidateIds.length) {
          throw new ProjectGenerationAcceptanceError(
            'ACCEPTANCE_CANDIDATE_UNAVAILABLE',
            'A selected Smart Patch contribution is missing or belongs to another owner.',
          )
        }
        if (initial.layers.length + selected.length > IGS_SAFETY_CEILINGS.archiveEntries) {
          throw new ProjectGenerationAcceptanceError(
            'ACCEPTANCE_LAYER_LIMIT',
            'This Project cannot hold that many Raster Layers.',
          )
        }
        const anchor = request.candidateIds.includes(request.focusedCandidateId ?? '')
          ? request.focusedCandidateId
          : selected[0].candidateId
        const acceptedAt = (this.options.now ?? (() => new Date().toISOString()))()
        const sources: Record<string, IgsAssetSource> = {}
        const layers: RasterLayer[] = []
        for (const candidate of selected) {
          const projected = await source.project(
            candidate,
            acceptedAt,
            uniqueLayerId(initial, layers, [
              candidate.payload.context.layerId,
              candidate.payload.context.mask.id,
            ]),
            candidate.candidateId === anchor,
          )
          assertInitial()
          layers.push(projected.layer)
          sources[projected.layer.asset.path] = { sourcePath: projected.sourcePath }
        }
        const projected = parseProjectDocumentV1({
          ...initial,
          layers: [...layers, ...initial.layers],
        })
        preflightProjectedDocument(projected)
        assertInitial()
        if ((await canonicalProjectPath(owner.filePath)) !== owner.filePath) {
          throw handoffRecoveryError()
        }
        assertInitial()
        const scope = await source.captureReviewedJobs(
          {
            documentId: initial.documentId,
            expectedUnfinishedJobIds: [...request.expectedUnfinishedJobIds],
            layerId: request.expectedOwner.layerId,
            projectPath: owner.filePath,
            stagingSessionIds: [...new Set(owned.map((candidate) => candidate.stagingSessionId))],
            tabId,
            verifiedCandidates: owned.map(smartWitness),
          },
          assertInitial,
        )
        assertInitial()
        const handoff = preflightGenerationAcceptanceHandoff({
          acceptedLayers: structuredClone(layers),
          documentId: initial.documentId,
          localProjectKey: tabId,
          operationId: randomUUID(),
          projectPath: owner.filePath,
          smartPatchSource: {
            kind: 'smart-patch-orphans',
            layerId: scope.layerId,
            reviewedCandidates: scope.verifiedCandidates.map((candidate) => ({ ...candidate })),
            ...(scope.reviewedJobs?.length
              ? { reviewedJobs: scope.reviewedJobs.map((job) => ({ ...job })) }
              : {}),
          },
          stagingSessionIds: [...scope.stagingSessionIds],
        })
        await source.exclusive(scope, all, this.options.staging)
        assertInitial()
        requireExpectedJobIds(await source.jobs(scope), request.expectedUnfinishedJobIds)
        assertInitial()
        this.smartCancellations.set(tabId, scope)
        retain = true
        await this.finishSmartCancellation(tabId, owner, assertInitial)
        assertInitial()
        retain = false
        const afterCancellation = await source.list(tabId)
        assertInitial()
        const afterOwned = source.owned(
          afterCancellation,
          owner.filePath,
          initial.documentId,
          scope.layerId,
        )
        requireExpectedAvailable(afterOwned, request.expectedAvailableIds)
        if (!isDeepStrictEqual(afterOwned.map(smartWitness), owned.map(smartWitness))) {
          throw handoffRecoveryError()
        }
        await source.exclusive(scope, afterCancellation, this.options.staging)
        assertInitial()
        this.pending.set(tabId, handoff)
        retain = true
        await this.options.journal.record(handoff)
        assertInitial()
        if ((await canonicalProjectPath(owner.filePath)) !== owner.filePath) {
          throw handoffRecoveryError()
        }
        assertInitial()
        const applied = await owner.applyDocument(projected, sources, {
          expectedDocumentEpoch: request.expectedOwner.documentEpoch,
          expectedDocumentRevision: initial.documentRevision,
        })
        this.requireSameDocument(tabId, owner, initial.documentId)
        if (
          owner.document.documentRevision !== applied.documentRevision ||
          handoffProof(owner.document, handoff) !== 'complete'
        ) {
          throw handoffRecoveryError()
        }
        await this.requireDurable(owner, tabId, initial.documentId, applied.documentRevision, false)
        await this.options.afterDurableShadow?.()
        if (
          owner.document.documentRevision !== applied.documentRevision ||
          handoffProof(owner.document, handoff) !== 'complete'
        ) {
          throw handoffRecoveryError()
        }
        await this.finishSmartHandoff(tabId, owner, handoff, false)
        retain = false
        return {
          documentRevision: owner.document.documentRevision,
          kind: 'accepted',
          layerIds: layers.map((layer) => layer.id),
        }
      } catch (error) {
        if (
          error instanceof ProjectGenerationAcceptanceError &&
          ['ACCEPTANCE_CANDIDATE_UNAVAILABLE', 'PROJECT_DOCUMENT_CHANGED'].includes(error.code) &&
          !this.pending.has(tabId) &&
          !this.pendingCancellations.has(tabId) &&
          !this.smartCancellations.has(tabId)
        ) {
          retain = false
        }
        throw error
      } finally {
        if (retain) {
          this.unresolved.add(tabId)
        } else {
          this.unresolved.delete(tabId)
          this.options.orchestrator.releaseProjectGenerationFence(tabId)
        }
      }
    })
  }

  /** Close must not release an acceptance fence or discard its candidate before reconciliation. */
  hasPendingHandoff(tabId: string): boolean {
    return (
      this.pending.has(tabId) ||
      this.pendingCancellations.has(tabId) ||
      this.smartCancellations.has(tabId) ||
      this.unresolved.has(tabId)
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
        await this.finishSmartCancellation(tabId, owner)
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
            await this.abandonHandoff(tabId, owner, pending)
            retainFence = false
            return 'none'
          }
          if (proof !== 'complete') {
            throw handoffRecoveryError()
          }
          if (pending.smartPatchSource) {
            await this.finishSmartHandoff(tabId, owner, pending)
            retainFence = false
            return 'cleaned'
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
        if (this.options.smartPatch) {
          const smartStaged = await this.options.smartPatch.staging.listVerifiedCandidates(tabId)
          this.requireSameDocument(tabId, owner, document.documentId)
          if (
            smartStaged.some(
              (candidate) =>
                candidate.documentId === document.documentId &&
                candidate.projectPath === owner.filePath &&
                (accepted.has(candidate.candidateId) ||
                  hasNestedCandidate(document, [candidate.candidateId])),
            )
          ) {
            throw handoffRecoveryError()
          }
        }
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

  private async abandonHandoff(
    tabId: string,
    owner: ProjectGenerationAcceptanceDocument,
    handoff: GenerationAcceptanceHandoff,
  ): Promise<void> {
    const revision = owner.document.documentRevision
    const epoch = owner.documentEpoch
    await this.options.journal.abandon(handoff)
    try {
      this.requireSameDocument(tabId, owner, handoff.documentId)
      if (
        owner.document.documentRevision !== revision ||
        owner.documentEpoch !== epoch ||
        handoffProof(owner.document, handoff) !== 'absent'
      ) {
        throw handoffRecoveryError()
      }
    } catch (error) {
      // A concurrent Redo can restore lineage while SQL acknowledges deletion. Restore the exact
      // intent rather than permit an unjournaled accepted/staged overlap (including revision ABA).
      await this.options.journal.record(handoff)
      throw error
    }
    this.pending.delete(tabId)
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

  private async finishSmartCancellation(
    tabId: string,
    owner: ProjectGenerationAcceptanceDocument,
    beforeCancel?: () => void,
  ): Promise<void> {
    let scope = this.smartCancellations.get(tabId)
    if (!scope) {
      return
    }
    try {
      const source = this.smartSource()
      this.requireSameDocument(tabId, owner, scope.documentId)
      if (
        owner.filePath !== scope.projectPath ||
        localProjectRecoveryKey(owner.filePath) !== tabId
      ) {
        throw handoffRecoveryError()
      }
      const all = await source.list(tabId)
      this.requireSameDocument(tabId, owner, scope.documentId)
      beforeCancel?.()
      await source.exclusive(scope, all, this.options.staging)
      beforeCancel?.()
      if (
        beforeCancel &&
        scope.verifiedCandidates.some(
          (witness) =>
            !all.some((candidate) => isDeepStrictEqual(smartWitness(candidate), witness)),
        )
      ) {
        throw new ProjectGenerationAcceptanceError(
          'ACCEPTANCE_CANDIDATE_UNAVAILABLE',
          'A reviewed Smart Patch contribution changed before cancellation. Temporary results were kept.',
        )
      }
      if (!this.pending.has(tabId)) {
        const witnesses = new Map(
          scope.verifiedCandidates.map((candidate) => [candidate.candidateId, candidate]),
        )
        for (const candidate of source.owned(
          all,
          scope.projectPath,
          scope.documentId,
          scope.layerId,
        )) {
          if (!scope.stagingSessionIds.includes(candidate.stagingSessionId)) {
            continue
          }
          const witness = smartWitness(candidate)
          const previous = witnesses.get(candidate.candidateId)
          if (previous && !isDeepStrictEqual(previous, witness)) {
            throw handoffRecoveryError()
          }
          witnesses.set(candidate.candidateId, witness)
        }
        scope = { ...scope, verifiedCandidates: [...witnesses.values()] }
        this.smartCancellations.set(tabId, scope)
      }
      await source.verifyReviewedJobs(
        scope,
        this.pending.has(tabId) || this.smartCancellationStarted.has(tabId),
      )
      this.requireSameDocument(tabId, owner, scope.documentId)
      beforeCancel?.()
      this.smartCancellationStarted.add(tabId)
      await source.cancel(scope)
      this.requireSameDocument(tabId, owner, scope.documentId)
      beforeCancel?.()
      if ((await source.jobs(scope)).length !== 0) {
        throw new ProjectGenerationAcceptanceError(
          'ACCEPTANCE_UNFINISHED_JOBS',
          'Smart Patch sibling cancellation has not confirmed completion.',
        )
      }
      this.requireSameDocument(tabId, owner, scope.documentId)
      beforeCancel?.()
      this.smartCancellations.delete(tabId)
      this.smartCancellationStarted.delete(tabId)
    } catch (error) {
      // A refused preflight did not start cancellation. Once requested, retain its scope until
      // actual exit/publication drain is proved, including when the acknowledgement was lost.
      if (!this.smartCancellationStarted.has(tabId)) {
        this.smartCancellations.delete(tabId)
      }
      throw error
    }
  }

  private async finishSmartHandoff(
    tabId: string,
    owner: ProjectGenerationAcceptanceDocument,
    handoff: GenerationAcceptanceHandoff,
    verifyDurability = true,
  ): Promise<void> {
    if (!handoff.smartPatchSource || handoff.projectPath !== owner.filePath) {
      throw handoffRecoveryError()
    }
    const revision = owner.document.documentRevision
    const epoch = owner.documentEpoch
    const assertCurrent = () => {
      this.requireSameDocument(tabId, owner, handoff.documentId)
      if (
        owner.document.documentRevision !== revision ||
        owner.documentEpoch !== epoch ||
        handoffProof(owner.document, handoff) !== 'complete'
      ) {
        throw handoffRecoveryError()
      }
    }
    assertCurrent()
    const scope: SmartRasterCancellationScope = {
      documentId: handoff.documentId,
      expectedUnfinishedJobIds: [],
      layerId: handoff.smartPatchSource.layerId,
      projectPath: handoff.projectPath,
      stagingSessionIds: [...handoff.stagingSessionIds],
      tabId,
      verifiedCandidates: handoff.smartPatchSource.reviewedCandidates.map((candidate) => ({
        ...candidate,
      })),
      ...(handoff.smartPatchSource.reviewedJobs
        ? {
            reviewedJobs: handoff.smartPatchSource.reviewedJobs.map((job) => ({ ...job })),
          }
        : {}),
    }
    this.smartCancellations.set(tabId, scope)
    await this.finishSmartCancellation(tabId, owner)
    assertCurrent()
    if (verifyDurability) {
      await this.requireDurable(owner, tabId, handoff.documentId, revision, true)
      assertCurrent()
    }
    await this.options.journal.complete(handoff)
    await this.smartSource().discard(tabId, handoff.stagingSessionIds)
    assertCurrent()
    this.pending.delete(tabId)
  }

  private async loadHandoff(
    tabId: string,
    documentId: string,
  ): Promise<GenerationAcceptanceHandoff | undefined> {
    const durable = await this.options.journal.read(tabId, documentId)
    const local = this.pending.get(tabId)
    if (durable && local && !isDeepStrictEqual(durable, local)) {
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

  private requireSmartOwner(
    tabId: string,
    owner: ProjectGenerationAcceptanceDocument,
    expected: SmartPatchOrphanRasterAcceptRequest['expectedOwner'],
  ): void {
    this.requireSameDocument(tabId, owner, expected.documentId)
    if (
      localProjectRecoveryKey(owner.filePath) !== tabId ||
      owner.document.documentRevision !== expected.documentRevision ||
      owner.documentEpoch !== expected.documentEpoch ||
      owner.document.layers.some((layer) => layer.id === expected.layerId)
    ) {
      throw new ProjectGenerationAcceptanceError(
        'PROJECT_DOCUMENT_CHANGED',
        'The reviewed Project or missing Smart Patch target changed. Review Raster conversion again.',
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

  private smartSource(): SmartPatchRasterSourceAdapter {
    if (!this.options.smartPatch) {
      throw new ProjectGenerationAcceptanceError(
        'ACCEPTANCE_RECOVERY_REQUIRED',
        'Smart Patch recovery storage is unavailable. Temporary results were kept.',
      )
    }
    return new SmartPatchRasterSourceAdapter(this.options.smartPatch)
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

function snapshotSmartRequest(
  tabId: string,
  input: SmartPatchOrphanRasterAcceptRequest,
): SmartPatchOrphanRasterAcceptRequest {
  let request: SmartPatchOrphanRasterAcceptRequest
  try {
    request = structuredClone(input)
  } catch {
    throw new ProjectGenerationAcceptanceError(
      'ACCEPTANCE_INPUT_INVALID',
      'The Smart Patch Raster selection is invalid.',
    )
  }
  if (!request || typeof request !== 'object') {
    throw new ProjectGenerationAcceptanceError(
      'ACCEPTANCE_INPUT_INVALID',
      'The Smart Patch Raster selection is invalid.',
    )
  }
  validateRequest(
    tabId,
    request.candidateIds,
    request.focusedCandidateId,
    request.expectedAvailableIds,
  )
  validateJobIds(request.expectedUnfinishedJobIds)
  const expected = request.expectedOwner
  if (
    !expected ||
    !Number.isSafeInteger(expected.documentEpoch) ||
    expected.documentEpoch < 0 ||
    [expected.documentId, expected.documentRevision, expected.layerId].some(
      (id) => typeof id !== 'string' || !uuidPattern.test(id),
    ) ||
    request.candidateIds.some((id) => !request.expectedAvailableIds.includes(id))
  ) {
    throw new ProjectGenerationAcceptanceError(
      'ACCEPTANCE_INPUT_INVALID',
      'Review the exact Project document and orphan Smart Patch before Add.',
    )
  }
  return request
}

function smartWitness(
  candidate: VerifiedSmartPatchWorldCandidate,
): SmartPatchRasterAcceptanceSource['reviewedCandidates'][number] {
  return {
    candidateId: candidate.candidateId,
    frozenPayloadSha256: candidate.frozenPayloadSha256,
    stagingSessionId: candidate.stagingSessionId,
  }
}

function smartJobWitness(
  input: VerifiedQueuedSmartPatchInput,
  scope: SmartPatchAcceptanceCancellationScope,
): NonNullable<SmartPatchRasterAcceptanceSource['reviewedJobs']>[number] {
  const { item, payload } = input
  if (
    item.localProjectKey !== scope.tabId ||
    item.projectPath !== scope.projectPath ||
    payload.context.projectKey !== scope.tabId ||
    payload.context.documentId !== scope.documentId ||
    payload.context.layerId !== scope.layerId
  ) {
    throw handoffRecoveryError()
  }
  return {
    frozenPayloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    jobId: item.id,
    stagingSessionId: item.stagingSessionId,
  }
}

function isSmartRasterForTarget(layer: RasterLayer, documentId: string, layerId: string): boolean {
  const provenance = layer.generationProvenance
  return (
    !!provenance &&
    (provenance.kind === 'illustrious-smart-patch' || provenance.kind === 'anima-smart-patch') &&
    provenance.layerSourceContext.sourceDocumentId === documentId &&
    provenance.layerSourceContext.layerId === layerId
  )
}

function hasNestedCandidate(document: IgsProjectDocumentV1, ids: readonly string[]): boolean {
  return document.layers.some(
    (layer) =>
      layer.kind === 'smart-patch' &&
      layer.rasterSubLayers.some((variant) =>
        ids.includes(variant.generationProvenance.executionResultContext.candidateId),
      ),
  )
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
  owned: readonly { candidateId: string }[],
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

function uniqueLayerId(
  document: IgsProjectDocumentV1,
  prepared: readonly RasterLayer[],
  excluded: readonly string[] = [],
): string {
  const occupied = new Set(projectOwnedIds(document))
  let id = randomUUID()
  while (occupied.has(id) || prepared.some((layer) => layer.id === id) || excluded.includes(id)) {
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
      current.kind === 'raster' &&
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
  if (handoff.smartPatchSource) {
    const candidateIds = handoff.acceptedLayers.map(candidateIdFromLayer)
    if (hasNestedCandidate(document, candidateIds)) {
      return 'changed'
    }
    const represented = projectRasterLayers(document).filter((layer) =>
      candidateIds.includes(layer.generationProvenance?.executionResultContext.candidateId ?? ''),
    )
    if (represented.length !== 0 && represented.length !== handoff.acceptedLayers.length) {
      return 'changed'
    }
    if (new Set(represented.map(candidateIdFromLayer)).size !== represented.length) {
      return 'changed'
    }
  }
  if (sameAcceptedLayers(document, handoff.acceptedLayers)) {
    return 'complete'
  }
  const represented = handoff.acceptedLayers.some((expected) =>
    document.layers.some(
      (current) =>
        current.id === expected.id ||
        (current.kind === 'raster' &&
          current.generationProvenance?.executionResultContext.candidateId ===
            candidateIdFromLayer(expected)),
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
  for (const asset of projectAssetReferences(document)) {
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
    await proveAcceptedSavedPackage(owner)
  } catch (error) {
    throw new ProjectGenerationAcceptanceError(
      'ACCEPTANCE_SHADOW_UNCONFIRMED',
      `The saved Project could not be verified for result handoff: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
