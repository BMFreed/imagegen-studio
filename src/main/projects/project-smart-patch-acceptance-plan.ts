import {
  IGS_SAFETY_CEILINGS,
  type IgsSmartPatchVariantV1,
} from '../../shared/projects/project-schema.js'

import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type { ProjectService } from './project-service.js'
import type { SmartPatchVariantState } from './project-smart-patch-variant-state.js'
import type {
  SmartPatchCandidateReadIdentity,
  SmartPatchGenerationStagingRepository,
  VerifiedSmartPatchWorldCandidate,
} from './smart-patch-generation-staging.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { localProjectRecoveryKey } from './project-identity.js'
import { projectVerifiedSmartPatchVariant } from './project-smart-patch-variant-projection.js'
import { assessSmartPatchVariantState } from './project-smart-patch-variant-state.js'

export interface SmartPatchAcceptancePlanInput {
  /** Proposed operation timestamp; preparing this plan does not accept any result. */
  acceptedAt: string
  candidateIds: readonly string[]
  /** Exact reviewed set for this target, excluding candidates for other targets/documents. */
  expectedAvailableIds: readonly string[]
  focusedCandidateId: string | null
  staging: Pick<
    SmartPatchGenerationStagingRepository,
    'listVerifiedCandidates' | 'readVerifiedCandidate'
  >
  worker: Pick<ProjectWorkerClient, 'composeTarget'>
}

export interface SmartPatchAcceptancePlan {
  activeVariantId: string
  candidateReads: SmartPatchCandidateReadIdentity[]
  documentId: string
  documentRevision: string
  kind: 'smart-patch-acceptance-plan'
  layerId: string
  /** This is a read-only proposal, never a durable handoff or a later commit capability. */
  proposedVariants: { state: SmartPatchVariantState; variant: IgsSmartPatchVariantV1 }[]
  tabId: string
}

type Projects = Pick<
  ProjectService,
  'getOpenDocumentForAcceptance' | 'withCapturedSmartPatchGenerationInput'
>

export class SmartPatchAcceptancePlanError extends Error {
  constructor(
    readonly code:
      | 'PROJECT_DOCUMENT_CHANGED'
      | 'PROJECT_NOT_OPEN'
      | 'SMART_PATCH_CANDIDATE_UNAVAILABLE'
      | 'SMART_PATCH_SELECTION_INVALID'
      | 'SMART_PATCH_SELECTION_STALE'
      | 'SMART_PATCH_TARGET_BLOCKED'
      | 'SMART_PATCH_TARGET_ORPHANED',
    message: string,
  ) {
    super(message)
    this.name = 'SmartPatchAcceptancePlanError'
  }
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const validIds = (ids: readonly string[], max: number) =>
  Array.isArray(ids) &&
  ids.length <= max &&
  new Set(ids).size === ids.length &&
  ids.every((id) => typeof id === 'string' && UUID.test(id))

/** Private Main preflight. No queue cancellation, journal, mutation, Save or discard is admitted. */
export async function prepareSmartPatchAcceptancePlan(
  projectsInput: Projects,
  tabId: string,
  input: SmartPatchAcceptancePlanInput,
): Promise<SmartPatchAcceptancePlan> {
  const acceptedAt = input.acceptedAt
  const candidateIds = Array.isArray(input.candidateIds) ? [...input.candidateIds] : []
  const expectedAvailableIds = Array.isArray(input.expectedAvailableIds)
    ? [...input.expectedAvailableIds]
    : []
  const focusedCandidateId = input.focusedCandidateId
  const list = input.staging.listVerifiedCandidates.bind(input.staging)
  const read = input.staging.readVerifiedCandidate.bind(input.staging)
  const worker = { composeTarget: input.worker.composeTarget.bind(input.worker) }
  const projects: Projects = {
    getOpenDocumentForAcceptance: projectsInput.getOpenDocumentForAcceptance.bind(projectsInput),
    withCapturedSmartPatchGenerationInput:
      projectsInput.withCapturedSmartPatchGenerationInput.bind(projectsInput),
  }
  if (
    !validIds(candidateIds, 64) ||
    candidateIds.length === 0 ||
    !validIds(expectedAvailableIds, IGS_SAFETY_CEILINGS.archiveEntries) ||
    (focusedCandidateId !== null &&
      (typeof focusedCandidateId !== 'string' || !UUID.test(focusedCandidateId))) ||
    typeof acceptedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(acceptedAt) ||
    !Number.isFinite(Date.parse(acceptedAt)) ||
    new Date(acceptedAt).toISOString() !== acceptedAt
  ) {
    throw new SmartPatchAcceptancePlanError(
      'SMART_PATCH_SELECTION_INVALID',
      'Review a valid Smart Patch selection before Add.',
    )
  }
  const owner = projects.getOpenDocumentForAcceptance(tabId)
  if (!owner) {
    throw new SmartPatchAcceptancePlanError(
      'PROJECT_NOT_OPEN',
      'Open the Project before preparing Add.',
    )
  }
  const initial = structuredClone(owner.document)
  const filePath = owner.filePath
  if (localProjectRecoveryKey(filePath) !== tabId) {
    throw new SmartPatchAcceptancePlanError(
      'PROJECT_DOCUMENT_CHANGED',
      'The Project path no longer owns this tab.',
    )
  }
  const assertCurrent = () => {
    const current = projects.getOpenDocumentForAcceptance(tabId)
    if (
      current !== owner ||
      current.filePath !== filePath ||
      current.document.documentId !== initial.documentId ||
      current.document.documentRevision !== initial.documentRevision
    ) {
      throw new SmartPatchAcceptancePlanError(
        'PROJECT_DOCUMENT_CHANGED',
        'The Project changed while preparing Add. Review it again.',
      )
    }
  }
  const all = await list(tabId)
  assertCurrent()
  const selected = all.filter((candidate) => candidateIds.includes(candidate.candidateId))
  if (selected.length !== candidateIds.length) {
    throw new SmartPatchAcceptancePlanError(
      'SMART_PATCH_SELECTION_STALE',
      'A selected Smart Patch result is unavailable.',
    )
  }
  const layerId = selected[0].payload.context.layerId
  for (const candidate of selected) {
    if (
      candidate.localProjectKey !== tabId ||
      candidate.projectPath !== filePath ||
      candidate.documentId !== initial.documentId ||
      candidate.payload.context.layerId !== layerId
    ) {
      throw new SmartPatchAcceptancePlanError(
        'SMART_PATCH_SELECTION_INVALID',
        'Selected results must belong to this exact Project document and Smart Patch.',
      )
    }
  }
  const target = initial.layers.find((layer) => layer.id === layerId)
  if (target?.kind !== 'smart-patch') {
    throw new SmartPatchAcceptancePlanError(
      'SMART_PATCH_TARGET_ORPHANED',
      'The exact Smart Patch target is absent. Temporary results were kept.',
    )
  }
  if (target.locked || !target.visible) {
    throw new SmartPatchAcceptancePlanError(
      'SMART_PATCH_TARGET_BLOCKED',
      'Unlock and show the Smart Patch before Add. Temporary results were kept.',
    )
  }
  const forTarget = (candidates: VerifiedSmartPatchWorldCandidate[]) =>
    candidates.filter(
      (candidate) =>
        candidate.localProjectKey === tabId &&
        candidate.documentId === initial.documentId &&
        candidate.projectPath === filePath &&
        candidate.payload.context.layerId === layerId,
    )
  const requireReviewed = (available: VerifiedSmartPatchWorldCandidate[]) => {
    const ids = new Set(forTarget(available).map((candidate) => candidate.candidateId))
    if (
      ids.size !== expectedAvailableIds.length ||
      expectedAvailableIds.some((id) => !ids.has(id))
    ) {
      throw new SmartPatchAcceptancePlanError(
        'SMART_PATCH_SELECTION_STALE',
        'Smart Patch results changed. Review the available set again.',
      )
    }
  }
  requireReviewed(all)
  selected.sort(
    (a, b) => a.completionOrder - b.completionOrder || a.candidateId.localeCompare(b.candidateId),
  )
  const occupied = new Set(
    initial.layers.flatMap((layer) =>
      layer.kind === 'smart-patch' ? [layer.id, layer.mask.id] : [layer.id],
    ),
  )
  const proposed: IgsSmartPatchVariantV1[] = []
  const candidateReads: SmartPatchCandidateReadIdentity[] = []
  for (const candidate of selected) {
    const identity = nomination(candidate)
    const current = await read(identity)
    assertCurrent()
    if (!current || !isDeepStrictEqual(nomination(current.candidate), identity)) {
      throw new SmartPatchAcceptancePlanError(
        'SMART_PATCH_CANDIDATE_UNAVAILABLE',
        'A selected image or frozen input changed. Temporary results were kept.',
      )
    }
    let variantId = randomUUID()
    while (occupied.has(variantId)) {
      variantId = randomUUID()
    }
    occupied.add(variantId)
    proposed.push(await projectVerifiedSmartPatchVariant({ acceptedAt, read: current, variantId }))
    assertCurrent()
    candidateReads.push(identity)
  }
  // The existing capture owns actual below-target files and drains CPU operations before cleanup.
  const sourceTarget = await projects.withCapturedSmartPatchGenerationInput(
    tabId,
    layerId,
    async (capture) => {
      if (capture.document.documentRevision !== initial.documentRevision) {
        throw new SmartPatchAcceptancePlanError(
          'PROJECT_DOCUMENT_CHANGED',
          'The captured Project changed before source composition.',
        )
      }
      const source = (await capture.composeSource(worker)).source
      return {
        byteSize: source.byteSize,
        height: source.height,
        sha256: source.sha256,
        width: source.width,
      }
    },
  )
  assertCurrent()
  const finalAvailable = await list(tabId)
  assertCurrent()
  requireReviewed(finalAvailable)
  for (const identity of candidateReads) {
    const candidate = finalAvailable.find((item) => item.candidateId === identity.candidateId)
    if (!candidate || !isDeepStrictEqual(nomination(candidate), identity)) {
      throw new SmartPatchAcceptancePlanError(
        'SMART_PATCH_CANDIDATE_UNAVAILABLE',
        'A selected result changed while preparing Add.',
      )
    }
  }
  const anchor = candidateIds.includes(focusedCandidateId ?? '')
    ? focusedCandidateId
    : selected[0].candidateId
  const activeIndex = selected.findIndex((candidate) => candidate.candidateId === anchor)
  return {
    activeVariantId: proposed[activeIndex].id,
    candidateReads,
    documentId: initial.documentId,
    documentRevision: initial.documentRevision,
    kind: 'smart-patch-acceptance-plan',
    layerId,
    proposedVariants: proposed.map((variant) => ({
      state: assessSmartPatchVariantState(variant.generationProvenance, initial, sourceTarget),
      variant,
    })),
    tabId,
  }
}

function nomination(candidate: VerifiedSmartPatchWorldCandidate): SmartPatchCandidateReadIdentity {
  return {
    candidateId: candidate.candidateId,
    documentId: candidate.documentId,
    frozenPayloadSha256: candidate.frozenPayloadSha256,
    imageSha256: candidate.image.sha256,
    localProjectKey: candidate.localProjectKey,
    stagingSessionId: candidate.stagingSessionId,
  }
}
