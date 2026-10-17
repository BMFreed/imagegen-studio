import {
  IGS_SAFETY_CEILINGS,
  type IgsProjectDocumentV1,
  type IgsSmartPatchVariantV1,
} from '../../shared/projects/project-schema.js'

import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type {
  GenerationOrchestrator,
  SmartPatchAcceptanceCancellationScope,
} from './generation-orchestrator.js'
import type { GenerationQueueRepository } from './generation-queue.js'
import type { GenerationStagingRepository } from './generation-staging.js'
import type { IgsAssetSource } from './igs-package.js'
import type { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import type { ProjectService } from './project-service.js'
import type {
  SmartPatchAcceptanceHandoff,
  SmartPatchAcceptanceJournalRepository,
} from './smart-patch-acceptance-journal.js'
import type {
  SmartPatchGenerationStagingRepository,
  VerifiedSmartPatchWorldCandidate,
} from './smart-patch-generation-staging.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { proveAcceptedSavedPackage } from './project-accepted-save-proof.js'
import { localProjectRecoveryKey } from './project-identity.js'
import {
  projectSmartPatchAdoptionDocument,
  projectSmartPatchVariantHandoffProof,
} from './project-smart-patch-adoption.js'
import { projectVerifiedSmartPatchVariant } from './project-smart-patch-variant-projection.js'

export interface SmartPatchAcceptRequest {
  candidateIds: readonly string[]
  expectedAvailableIds: readonly string[]
  /** Main-only reviewed owner; checked after the shared gate actually admits this action. */
  expectedOwner?: {
    documentEpoch: number
    documentId: string
    documentRevision: string
    layerId: string
  }
  expectedUnfinishedJobIds: readonly string[]
  focusedCandidateId: string | null
  worker: Pick<ProjectWorkerClient, 'composeTarget'>
}
export interface SmartPatchAcceptResult {
  documentRevision: string
  kind: 'accepted' | 'already-accepted'
  layerId: string
  variantIds: string[]
}
export interface ProjectSmartPatchAcceptanceOptions {
  afterDurableShadow?: () => Promise<void>
  gate: ProjectGenerationOperationGate
  journal: Pick<SmartPatchAcceptanceJournalRepository, 'abandon' | 'complete' | 'read' | 'record'>
  normalStaging: Pick<GenerationStagingRepository, 'listVerifiedCandidates'>
  now?: () => string
  orchestrator: Pick<
    GenerationOrchestrator,
    'cancelSmartPatchAcceptanceJobs' | 'fenceProjectGeneration' | 'releaseProjectGenerationFence'
  >
  projects: Pick<
    ProjectService,
    | 'appendSmartPatchVariants'
    | 'getOpenDocumentForAcceptance'
    | 'prepareSmartPatchVariantAcceptance'
  >
  queue: Pick<GenerationQueueRepository, 'listSmartPatchAcceptanceSessionJobs'>
  staging: Pick<
    SmartPatchGenerationStagingRepository,
    'discardSessions' | 'listVerifiedCandidates' | 'readVerifiedCandidate'
  >
}
type Owner = NonNullable<ReturnType<ProjectService['getOpenDocumentForAcceptance']>>

export class ProjectSmartPatchAcceptanceError extends Error {
  constructor(
    readonly code:
      | 'PROJECT_DOCUMENT_CHANGED'
      | 'PROJECT_NOT_OPEN'
      | 'SMART_PATCH_ACCEPTANCE_CONFLICT'
      | 'SMART_PATCH_ACCEPTANCE_INPUT_INVALID'
      | 'SMART_PATCH_ACCEPTANCE_PENDING'
      | 'SMART_PATCH_ACCEPTANCE_SELECTION_STALE'
      | 'SMART_PATCH_ACCEPTANCE_SHADOW_UNCONFIRMED'
      | 'SMART_PATCH_ACCEPTANCE_UNFINISHED_JOBS',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectSmartPatchAcceptanceError'
  }
}

/** Main-only Add. The same gate must guard ordinary acceptance and Project close. */
export class ProjectSmartPatchAcceptance {
  private readonly cancellations = new Map<string, SmartPatchAcceptanceCancellationScope>()
  private readonly pending = new Map<string, SmartPatchAcceptanceHandoff>()
  private readonly unresolved = new Set<string>()

  constructor(private readonly options: ProjectSmartPatchAcceptanceOptions) {}

  async accept(tabId: string, input: SmartPatchAcceptRequest): Promise<SmartPatchAcceptResult> {
    const request = snapshotRequest(tabId, input)
    return await this.options.gate.run(tabId, async () => {
      const owner = this.owner(tabId)
      this.assertExpectedOwner(tabId, owner, request.expectedOwner)
      let retain = true
      try {
        await this.options.orchestrator.fenceProjectGeneration(tabId)
        await this.resolvePending(tabId, owner)
        retain = false
        this.assertExpectedOwner(tabId, owner, request.expectedOwner)
        const initial = owner.document
        const initialEpoch = owner.documentEpoch
        const assertInitial = () =>
          this.sameOwner(tabId, owner, initial.documentId, initial.documentRevision, initialEpoch)
        const existing = existingSelection(initial, request.candidateIds)
        if (existing) {
          if (request.expectedOwner && existing.layerId !== request.expectedOwner.layerId) {
            throw stale('The reviewed Smart Patch target changed before Add.')
          }
          retain = true
          await this.requireNoUnjournaledOverlap(tabId, initial)
          assertInitial()
          await this.durable(tabId, owner, initial.documentRevision, true)
          retain = false
          return {
            documentRevision: initial.documentRevision,
            kind: 'already-accepted',
            layerId: existing.layerId,
            variantIds: existing.variants.map((v) => v.id),
          }
        }
        const acceptedAt = (this.options.now ?? (() => new Date().toISOString()))()
        const plan = await this.options.projects.prepareSmartPatchVariantAcceptance(tabId, {
          acceptedAt,
          candidateIds: request.candidateIds,
          expectedAvailableIds: request.expectedAvailableIds,
          focusedCandidateId: request.focusedCandidateId,
          staging: this.options.staging,
          worker: request.worker,
        })
        if (request.expectedOwner && plan.layerId !== request.expectedOwner.layerId) {
          throw stale('The reviewed Smart Patch target changed before Add.')
        }
        assertInitial()
        const adoption = {
          acceptedVariants: plan.proposedVariants.map((v) => v.variant),
          activeVariantId: plan.activeVariantId,
          documentId: plan.documentId,
          expectedDocumentRevision: plan.documentRevision,
          targetLayerId: plan.layerId,
        }
        projectSmartPatchAdoptionDocument(initial, adoption)
        const all = await this.options.staging.listVerifiedCandidates(tabId)
        assertInitial()
        const owned = forTarget(all, owner.filePath, initial.documentId, plan.layerId)
        requireAvailable(owned, request.expectedAvailableIds)
        const sessions = [...new Set(owned.map((v) => v.stagingSessionId))]
        const scope: SmartPatchAcceptanceCancellationScope = {
          documentId: initial.documentId,
          expectedUnfinishedJobIds: request.expectedUnfinishedJobIds,
          layerId: plan.layerId,
          projectPath: owner.filePath,
          stagingSessionIds: sessions,
          tabId,
          verifiedCandidates: owned.map(witness),
        }
        await this.exclusiveSessions(scope, all)
        requireJobs(
          await this.options.queue.listSmartPatchAcceptanceSessionJobs(queueScope(scope)),
          request.expectedUnfinishedJobIds,
        )
        const sources: Record<string, IgsAssetSource> = {}
        for (let index = 0; index < plan.candidateReads.length; index++) {
          const identity = plan.candidateReads[index]
          const read = await this.options.staging.readVerifiedCandidate(identity)
          assertInitial()
          if (!read) {
            throw stale('A selected Smart Patch image changed. Temporary results were kept.')
          }
          const variant = adoption.acceptedVariants[index]
          const verified = await projectVerifiedSmartPatchVariant({
            acceptedAt,
            read,
            variantId: variant.id,
          })
          if (!isDeepStrictEqual(verified, variant)) {
            throw stale('The selected immutable Smart Patch context changed.')
          }
          sources[variant.asset.path] = { sourcePath: read.candidate.assetPath }
        }
        assertInitial()
        this.cancellations.set(tabId, structuredClone(scope))
        retain = true
        await this.finishCancellation(tabId, owner)
        retain = false
        const afterCancel = await this.options.staging.listVerifiedCandidates(tabId)
        assertInitial()
        requireAvailable(
          forTarget(afterCancel, owner.filePath, initial.documentId, plan.layerId),
          request.expectedAvailableIds,
        )
        await this.exclusiveSessions(scope, afterCancel)
        assertInitial()
        const handoff: SmartPatchAcceptanceHandoff = {
          acceptedVariants: structuredClone(adoption.acceptedVariants),
          activeVariantId: plan.activeVariantId,
          documentId: initial.documentId,
          kind: 'smart-patch-variants',
          localProjectKey: tabId,
          operationId: randomUUID(),
          projectPath: owner.filePath,
          reviewedCandidates: scope.verifiedCandidates.map((v) => ({ ...v })),
          schemaVersion: 1,
          stagingSessionIds: sessions,
          targetLayerId: plan.layerId,
        }
        this.pending.set(tabId, handoff)
        retain = true
        await this.options.journal.record(handoff)
        assertInitial()
        const adopted = await this.options.projects.appendSmartPatchVariants(
          tabId,
          adoption,
          sources,
        )
        this.sameOwner(tabId, owner, initial.documentId, adopted.documentRevision)
        if (projectSmartPatchVariantHandoffProof(owner.document, handoff) !== 'complete') {
          throw conflict()
        }
        await this.durable(tabId, owner, adopted.documentRevision, false)
        await this.options.afterDurableShadow?.()
        this.sameOwner(tabId, owner, initial.documentId, adopted.documentRevision)
        await this.finishHandoff(tabId, owner, handoff)
        retain = false
        return {
          documentRevision: adopted.documentRevision,
          kind: 'accepted',
          layerId: plan.layerId,
          variantIds: adopted.variantIds,
        }
      } finally {
        this.finishFence(tabId, retain)
      }
    })
  }

  hasPendingHandoff(tabId: string): boolean {
    return this.pending.has(tabId) || this.cancellations.has(tabId) || this.unresolved.has(tabId)
  }

  /** Classifier probe only: never clears an unknown accepted/staged overlap. */
  async hasUnjournaledOverlap(tabId: string): Promise<boolean> {
    validateProjectKey(tabId)
    const owner = this.owner(tabId)
    const document = owner.document
    const epoch = owner.documentEpoch
    const accepted = acceptedCandidateIds(document)
    const candidates = await this.options.staging.listVerifiedCandidates(tabId)
    this.sameOwner(tabId, owner, document.documentId, document.documentRevision, epoch)
    return candidates.some((candidate) => accepted.has(candidate.candidateId))
  }

  async reconcile(tabId: string): Promise<'cleaned' | 'none'> {
    validateProjectKey(tabId)
    return await this.options.gate.run(tabId, async () => {
      const owner = this.owner(tabId)
      let retain = true
      try {
        await this.options.orchestrator.fenceProjectGeneration(tabId)
        const result = await this.resolvePending(tabId, owner)
        retain = false
        return result
      } finally {
        this.finishFence(tabId, retain)
      }
    })
  }

  private assertExpectedOwner(
    tabId: string,
    owner: Owner,
    expected: SmartPatchAcceptRequest['expectedOwner'],
  ): void {
    if (!expected) {
      return
    }
    this.sameOwner(
      tabId,
      owner,
      expected.documentId,
      expected.documentRevision,
      expected.documentEpoch,
    )
    const target = owner.document.layers.find((layer) => layer.id === expected.layerId)
    if (target?.kind !== 'smart-patch') {
      throw new ProjectSmartPatchAcceptanceError(
        'PROJECT_DOCUMENT_CHANGED',
        'The reviewed Smart Patch target changed before Add. Temporary results were kept.',
      )
    }
  }

  private async durable(
    tabId: string,
    owner: Owner,
    revision: string,
    allowSaved: boolean,
  ): Promise<void> {
    const document = owner.document
    this.sameOwner(tabId, owner, document.documentId, revision)
    let commit
    try {
      commit = await owner.flush()
    } catch {
      throw new ProjectSmartPatchAcceptanceError(
        'SMART_PATCH_ACCEPTANCE_SHADOW_UNCONFIRMED',
        'The accepted variants remain pending until recovery storage confirms the document.',
      )
    }
    this.sameOwner(tabId, owner, document.documentId, revision)
    if (!commit && allowSaved && !owner.dirty) {
      try {
        await proveAcceptedSavedPackage(owner)
      } catch {
        throw new ProjectSmartPatchAcceptanceError(
          'SMART_PATCH_ACCEPTANCE_SHADOW_UNCONFIRMED',
          'The saved Project could not be synced and verified for variant handoff.',
        )
      }
      this.sameOwner(tabId, owner, document.documentId, revision)
      if (owner.dirty) {
        throw conflict()
      }
      return
    }
    if (
      !commit?.directorySynced ||
      commit.documentRevision !== revision ||
      commit.documentId !== document.documentId ||
      commit.localRecoveryKey !== tabId
    ) {
      throw new ProjectSmartPatchAcceptanceError(
        'SMART_PATCH_ACCEPTANCE_SHADOW_UNCONFIRMED',
        'The accepted variants have not reached synced Project recovery storage.',
      )
    }
  }

  private async exclusiveSessions(
    scope: SmartPatchAcceptanceCancellationScope,
    smart: VerifiedSmartPatchWorldCandidate[],
  ): Promise<void> {
    const sessions = new Set(scope.stagingSessionIds)
    if (
      smart.some(
        (v) =>
          sessions.has(v.stagingSessionId) &&
          (v.documentId !== scope.documentId ||
            v.projectPath !== scope.projectPath ||
            v.payload.context.layerId !== scope.layerId),
      )
    ) {
      throw conflict()
    }
    const normal = await this.options.normalStaging.listVerifiedCandidates(scope.tabId)
    if (normal.some((v) => sessions.has(v.stagingSessionId))) {
      throw conflict()
    }
  }

  private async finishCancellation(tabId: string, owner: Owner): Promise<void> {
    let scope = this.cancellations.get(tabId)
    if (!scope) {
      return
    }
    if (!this.pending.has(tabId)) {
      // A physically completed sibling can be pruned while cancellation is still resolving.
      // Freshly verified staged bytes may qualify that receipt, but never broaden the reviewed
      // available set or authorize a post-intent result to be consumed.
      const all = await this.options.staging.listVerifiedCandidates(tabId)
      await this.exclusiveSessions(scope, all)
      const identities = new Map(scope.verifiedCandidates.map((v) => [v.candidateId, v]))
      for (const candidate of forTarget(all, scope.projectPath, scope.documentId, scope.layerId)) {
        if (!scope.stagingSessionIds.includes(candidate.stagingSessionId)) {
          continue
        }
        const identity = witness(candidate)
        const previous = identities.get(candidate.candidateId)
        if (previous && !isDeepStrictEqual(previous, identity)) {
          throw conflict()
        }
        identities.set(candidate.candidateId, identity)
      }
      scope = { ...scope, verifiedCandidates: [...identities.values()] }
      this.cancellations.set(tabId, scope)
    }
    this.sameOwner(tabId, owner, scope.documentId)
    if (scope.projectPath !== owner.filePath) {
      throw conflict()
    }
    await this.options.orchestrator.cancelSmartPatchAcceptanceJobs(scope)
    const unfinished = await this.options.queue.listSmartPatchAcceptanceSessionJobs(
      queueScope(scope),
    )
    if (unfinished.length) {
      throw new ProjectSmartPatchAcceptanceError(
        'SMART_PATCH_ACCEPTANCE_UNFINISHED_JOBS',
        'Smart Patch sibling cancellation has not confirmed completion.',
      )
    }
    this.sameOwner(tabId, owner, scope.documentId)
    this.cancellations.delete(tabId)
  }

  private finishFence(tabId: string, retain: boolean): void {
    if (retain) {
      this.unresolved.add(tabId)
    } else {
      this.unresolved.delete(tabId)
      this.options.orchestrator.releaseProjectGenerationFence(tabId)
    }
  }

  private async finishHandoff(
    tabId: string,
    owner: Owner,
    handoff: SmartPatchAcceptanceHandoff,
  ): Promise<void> {
    const revision = owner.document.documentRevision
    this.sameOwner(tabId, owner, handoff.documentId, revision)
    if (projectSmartPatchVariantHandoffProof(owner.document, handoff) !== 'complete') {
      throw conflict()
    }
    await this.options.journal.complete(handoff)
    await this.options.staging.discardSessions(tabId, handoff.stagingSessionIds)
    this.sameOwner(tabId, owner, handoff.documentId, revision)
    this.pending.delete(tabId)
  }

  private owner(tabId: string): Owner {
    const owner = this.options.projects.getOpenDocumentForAcceptance(tabId)
    if (!owner) {
      throw new ProjectSmartPatchAcceptanceError(
        'PROJECT_NOT_OPEN',
        'Open the Project before Add as Variants.',
      )
    }
    if (localProjectRecoveryKey(owner.filePath) !== tabId) {
      throw conflict()
    }
    return owner
  }
  private async requireNoUnjournaledOverlap(
    tabId: string,
    document: IgsProjectDocumentV1,
  ): Promise<void> {
    const accepted = acceptedCandidateIds(document)
    const smart = await this.options.staging.listVerifiedCandidates(tabId)
    const normal = await this.options.normalStaging.listVerifiedCandidates(tabId)
    if ([...smart, ...normal].some((v) => accepted.has(v.candidateId))) {
      throw new ProjectSmartPatchAcceptanceError(
        'SMART_PATCH_ACCEPTANCE_PENDING',
        'An accepted result still exists in temporary recovery without its handoff journal. Keep the Project open for repair.',
      )
    }
  }
  private async resolvePending(tabId: string, owner: Owner): Promise<'cleaned' | 'none'> {
    await this.finishCancellation(tabId, owner)
    const document = owner.document
    const epoch = owner.documentEpoch
    const durable = await this.options.journal.read(tabId, document.documentId)
    this.sameOwner(tabId, owner, document.documentId, document.documentRevision)
    const local = this.pending.get(tabId)
    if (durable && local && !isDeepStrictEqual(durable, local)) {
      throw conflict()
    }
    const handoff = durable ?? local
    if (!handoff) {
      await this.requireNoUnjournaledOverlap(tabId, document)
      this.sameOwner(tabId, owner, document.documentId, document.documentRevision)
      return 'none'
    }
    this.pending.set(tabId, handoff)
    if (handoff.projectPath !== owner.filePath) {
      throw conflict()
    }
    const proof = projectSmartPatchVariantHandoffProof(document, handoff)
    if (proof === 'absent') {
      await this.options.journal.abandon(handoff)
      try {
        this.sameOwner(tabId, owner, document.documentId, document.documentRevision, epoch)
        if (projectSmartPatchVariantHandoffProof(owner.document, handoff) !== 'absent') {
          throw conflict()
        }
      } catch (error) {
        // An in-process owner changed during the SQL acknowledgement. Keep the original intent
        // recoverable rather than turning a newly restored variant into an unjournaled overlap.
        await this.options.journal.record(handoff)
        throw error
      }
      this.pending.delete(tabId)
      return 'none'
    }
    if (proof !== 'complete') {
      throw conflict()
    }
    const scope = handoffScope(handoff)
    await this.exclusiveSessions(scope, await this.options.staging.listVerifiedCandidates(tabId))
    this.sameOwner(tabId, owner, document.documentId, document.documentRevision)
    this.cancellations.set(tabId, scope)
    await this.finishCancellation(tabId, owner)
    await this.durable(tabId, owner, document.documentRevision, true)
    await this.finishHandoff(tabId, owner, handoff)
    return 'cleaned'
  }

  private sameOwner(
    tabId: string,
    owner: Owner,
    documentId: string,
    revision?: string,
    epoch?: number,
  ): void {
    const current = this.options.projects.getOpenDocumentForAcceptance(tabId)
    if (
      current !== owner ||
      current.document.documentId !== documentId ||
      (revision !== undefined && current.document.documentRevision !== revision) ||
      (epoch !== undefined && current.documentEpoch !== epoch)
    ) {
      throw new ProjectSmartPatchAcceptanceError(
        'PROJECT_DOCUMENT_CHANGED',
        'The Project changed during Add. Review the results again.',
      )
    }
  }
}

function acceptedCandidateIds(document: IgsProjectDocumentV1): Set<string> {
  return new Set(
    document.layers.flatMap((layer) =>
      layer.kind === 'smart-patch'
        ? layer.rasterSubLayers.map(
            (v) => v.generationProvenance.executionResultContext.candidateId,
          )
        : layer.generationProvenance
          ? [layer.generationProvenance.executionResultContext.candidateId]
          : [],
    ),
  )
}

function witness(candidate: VerifiedSmartPatchWorldCandidate) {
  return {
    candidateId: candidate.candidateId,
    frozenPayloadSha256: candidate.frozenPayloadSha256,
    stagingSessionId: candidate.stagingSessionId,
  }
}
function handoffScope(handoff: SmartPatchAcceptanceHandoff): SmartPatchAcceptanceCancellationScope {
  return {
    documentId: handoff.documentId,
    expectedUnfinishedJobIds: [],
    layerId: handoff.targetLayerId,
    projectPath: handoff.projectPath,
    stagingSessionIds: [...handoff.stagingSessionIds],
    tabId: handoff.localProjectKey,
    verifiedCandidates: handoff.reviewedCandidates.map((v) => ({ ...v })),
  }
}
function existingSelection(
  document: IgsProjectDocumentV1,
  candidateIds: readonly string[],
): { layerId: string; variants: IgsSmartPatchVariantV1[] } | null {
  const all = document.layers.flatMap((layer) =>
    layer.kind === 'smart-patch'
      ? layer.rasterSubLayers.map((variant) => ({ layerId: layer.id, variant }))
      : [],
  )
  const selected = all.filter((v) => {
    const provenance = v.variant.generationProvenance
    return (
      candidateIds.includes(provenance.executionResultContext.candidateId) &&
      provenance.layerSourceContext.sourceDocumentId === document.documentId &&
      provenance.layerSourceContext.layerId === v.layerId
    )
  })
  if (!selected.length) {
    return null
  }
  if (
    selected.length !== candidateIds.length ||
    new Set(selected.map((v) => v.layerId)).size !== 1 ||
    new Set(selected.map((v) => v.variant.generationProvenance.executionResultContext.candidateId))
      .size !== candidateIds.length
  ) {
    throw conflict()
  }
  const selection = { layerId: selected[0].layerId, variants: selected.map((v) => v.variant) }
  if (
    projectSmartPatchVariantHandoffProof(document, {
      acceptedVariants: selection.variants,
      documentId: document.documentId,
      targetLayerId: selection.layerId,
    }) !== 'complete'
  ) {
    throw conflict()
  }
  return selection
}
function requireAvailable(
  candidates: VerifiedSmartPatchWorldCandidate[],
  expected: readonly string[],
): void {
  if (
    candidates.length !== expected.length ||
    candidates.some((v) => !expected.includes(v.candidateId))
  ) {
    throw stale('Smart Patch results changed. Review the completed set again.')
  }
}
function requireJobs(jobs: readonly { id: string }[], expected: readonly string[]): void {
  if (jobs.length !== expected.length || jobs.some((v) => !expected.includes(v.id))) {
    throw stale('Smart Patch unfinished jobs changed. Review them again.')
  }
}
function forTarget(
  candidates: VerifiedSmartPatchWorldCandidate[],
  projectPath: string,
  documentId: string,
  layerId: string,
) {
  return candidates.filter(
    (v) =>
      v.projectPath === projectPath &&
      v.documentId === documentId &&
      v.payload.context.layerId === layerId,
  )
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
function validateProjectKey(tabId: string): void {
  if (!/^project-v1-[a-f0-9]{64}$/.test(tabId)) {
    throw new ProjectSmartPatchAcceptanceError(
      'SMART_PATCH_ACCEPTANCE_INPUT_INVALID',
      'The Project key is invalid.',
    )
  }
}
function snapshotRequest(tabId: string, input: SmartPatchAcceptRequest): SmartPatchAcceptRequest {
  validateProjectKey(tabId)
  if (
    !input ||
    !Array.isArray(input.candidateIds) ||
    !Array.isArray(input.expectedAvailableIds) ||
    !Array.isArray(input.expectedUnfinishedJobIds) ||
    typeof input.worker?.composeTarget !== 'function'
  ) {
    throw invalidInput()
  }
  let expectedOwner: SmartPatchAcceptRequest['expectedOwner']
  try {
    expectedOwner =
      input.expectedOwner === undefined ? undefined : structuredClone(input.expectedOwner)
  } catch {
    throw invalidInput()
  }
  if (
    expectedOwner !== undefined &&
    (typeof expectedOwner !== 'object' ||
      expectedOwner === null ||
      Object.keys(expectedOwner).length !== 4 ||
      typeof expectedOwner.documentEpoch !== 'number' ||
      !Number.isSafeInteger(expectedOwner.documentEpoch) ||
      expectedOwner.documentEpoch < 0 ||
      [expectedOwner.documentId, expectedOwner.documentRevision, expectedOwner.layerId].some(
        (id) => typeof id !== 'string' || !UUID.test(id),
      ))
  ) {
    throw invalidInput()
  }
  const request = {
    candidateIds: [...input.candidateIds],
    expectedAvailableIds: [...input.expectedAvailableIds],
    expectedUnfinishedJobIds: [...input.expectedUnfinishedJobIds],
    focusedCandidateId: input.focusedCandidateId,
    ...(expectedOwner === undefined ? {} : { expectedOwner }),
    worker: { composeTarget: input.worker.composeTarget.bind(input.worker) },
  }
  if (
    request.candidateIds.length < 1 ||
    request.candidateIds.length > 64 ||
    [request.candidateIds, request.expectedAvailableIds, request.expectedUnfinishedJobIds].some(
      (ids) =>
        ids.length > IGS_SAFETY_CEILINGS.archiveEntries ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => typeof id !== 'string' || !UUID.test(id)),
    ) ||
    (request.focusedCandidateId !== null &&
      (typeof request.focusedCandidateId !== 'string' || !UUID.test(request.focusedCandidateId)))
  ) {
    throw invalidInput()
  }
  return request
}
function queueScope(scope: SmartPatchAcceptanceCancellationScope) {
  return {
    documentId: scope.documentId,
    layerId: scope.layerId,
    localProjectKey: scope.tabId,
    projectPath: scope.projectPath,
    stagingSessionIds: scope.stagingSessionIds,
    verifiedCandidates: scope.verifiedCandidates,
  }
}
function invalidInput() {
  return new ProjectSmartPatchAcceptanceError(
    'SMART_PATCH_ACCEPTANCE_INPUT_INVALID',
    'Review a valid Smart Patch selection before Add.',
  )
}

function conflict() {
  return new ProjectSmartPatchAcceptanceError(
    'SMART_PATCH_ACCEPTANCE_CONFLICT',
    'Smart Patch ownership or immutable acceptance lineage changed. Temporary results were kept.',
  )
}
function stale(message: string) {
  return new ProjectSmartPatchAcceptanceError('SMART_PATCH_ACCEPTANCE_SELECTION_STALE', message)
}
