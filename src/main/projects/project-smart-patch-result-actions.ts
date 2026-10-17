import type { ProjectCandidateExportResult, ProjectTab } from '../../shared/api.js'
import {
  isProjectSmartPatchAcceptRequest,
  isProjectSmartPatchCandidateExportRequest,
  isProjectSmartPatchDiscardRequest,
  type ProjectSmartPatchAcceptRequest,
  type ProjectSmartPatchCandidateExportRequest,
  type ProjectSmartPatchDiscardRequest,
  type ProjectSmartPatchGenerationTargetState,
} from '../../shared/projects/smart-patch-public-generation.js'

import path from 'node:path'

import type { GenerationOrchestrator } from './generation-orchestrator.js'
import type { GenerationQueueRepository } from './generation-queue.js'
import type { GenerationStagingRepository } from './generation-staging.js'
import type { CandidateImageDestinationSelection } from './project-candidate-image-export.js'
import type { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import type { ProjectService } from './project-service.js'
import type { ProjectSmartPatchAcceptance } from './project-smart-patch-acceptance.js'
import type {
  SmartPatchGenerationStagingRepository,
  VerifiedSmartPatchWorldCandidate,
} from './smart-patch-generation-staging.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { writeCandidateImageCreateOnly } from './project-candidate-image-export.js'
import { SmartPatchPublicResultError } from './project-smart-patch-result-resource.js'

export interface SmartPatchResultActionOptions {
  acceptance: Pick<ProjectSmartPatchAcceptance, 'accept'>
  chooseDestination: (name: string) => Promise<CandidateImageDestinationSelection>
  gate: ProjectGenerationOperationGate
  normalStaging: Pick<GenerationStagingRepository, 'listVerifiedCandidates'>
  orchestrator: Pick<
    GenerationOrchestrator,
    | 'cancelGenerationJob'
    | 'fenceProjectGeneration'
    | 'quiesceSmartPatchForProject'
    | 'releaseProjectGenerationFence'
  >
  projects: Pick<
    ProjectService,
    'getOpenDocumentForAcceptance' | 'getOpenTabs' | 'withCapturedSmartPatchGenerationInput'
  >
  queue: Pick<
    GenerationQueueRepository,
    'listSmartPatchAcceptanceSessionJobs' | 'listUnfinishedSmartPatchJobsByProject'
  >
  staging: Pick<
    SmartPatchGenerationStagingRepository,
    'discardSessions' | 'listVerifiedCandidates' | 'readVerifiedCandidate'
  >
  withWorker: <T>(use: (worker: ProjectWorkerClient) => Promise<T>) => Promise<T | null>
}

/** Public commands carry reviewed identities only; the existing journal remains the Add owner. */
export class ProjectSmartPatchResultActions {
  constructor(private readonly options: SmartPatchResultActionOptions) {}

  async accept(tabId: string, input: ProjectSmartPatchAcceptRequest): Promise<ProjectTab> {
    if (!isProjectSmartPatchAcceptRequest(input)) {
      throw invalid()
    }
    const request = structuredClone(input)
    const owner = this.owner(tabId, request)
    const epoch = owner.documentEpoch
    const candidates = await this.options.staging.listVerifiedCandidates(tabId)
    this.current(tabId, request, owner, epoch)
    if (
      request.candidateIds.some(
        (id) =>
          !candidates.some(
            (candidate) =>
              candidate.candidateId === id &&
              belongs(candidate, tabId, owner.filePath, request.documentId, request.layerId),
          ),
      )
    ) {
      throw stale()
    }
    this.current(tabId, request, owner, epoch)
    const accepted = await this.options.acceptance.accept(tabId, {
      candidateIds: request.candidateIds,
      expectedAvailableIds: request.expectedAvailableIds,
      expectedOwner: {
        documentEpoch: epoch,
        documentId: request.documentId,
        documentRevision: request.documentRevision,
        layerId: request.layerId,
      },
      expectedUnfinishedJobIds: request.expectedUnfinishedJobIds,
      focusedCandidateId: request.focusedCandidateId,
      // The private owner holds the Project gate before it calls this proxy. Save uses the
      // same gate -> image lease order; holding an image lease while awaiting that gate deadlocks.
      worker: {
        composeTarget: async (input) => {
          const composed = await this.options.withWorker((worker) => worker.composeTarget(input))
          if (!composed) {
            throw new SmartPatchPublicResultError(
              'GENERATION_RUNTIME_UNAVAILABLE',
              'The image engine is unavailable for verifying Add. Temporary results were kept; Save Candidate Image and discard remain available.',
            )
          }
          return composed
        },
      },
    })
    if (accepted.layerId !== request.layerId) {
      throw stale()
    }
    const tab = this.options.projects.getOpenTabs().find((entry) => entry.id === tabId)
    if (!tab || tab.documentId !== request.documentId) {
      throw changed()
    }
    return tab
  }

  async discard(tabId: string, input: ProjectSmartPatchDiscardRequest) {
    if (!isProjectSmartPatchDiscardRequest(input)) {
      throw invalid()
    }
    const request = structuredClone(input)
    return await this.options.gate.run(tabId, async () => {
      const owner = this.owner(tabId, request)
      const epoch = owner.documentEpoch
      let fenced = false
      let release = true
      const read = async () => {
        const all = await this.options.staging.listVerifiedCandidates(tabId)
        this.current(tabId, request, owner, epoch)
        const candidates = all.filter((candidate) =>
          belongs(candidate, tabId, owner.filePath, request.sourceDocumentId, request.layerId),
        )
        const jobs = (await this.options.queue.listUnfinishedSmartPatchJobsByProject(tabId)).filter(
          (job) =>
            job.projectPath === owner.filePath &&
            job.documentId === request.sourceDocumentId &&
            job.layerId === request.layerId,
        )
        this.current(tabId, request, owner, epoch)
        return { all, candidates, jobs }
      }
      try {
        let snapshot = await read()
        requireIds(
          snapshot.candidates.map((candidate) => candidate.candidateId),
          request.expectedAvailableIds,
        )
        requireIds(
          snapshot.jobs.map((job) => job.id),
          request.expectedUnfinishedJobIds,
        )
        await this.options.orchestrator.fenceProjectGeneration(tabId)
        fenced = true
        snapshot = await read()
        requireIds(
          snapshot.candidates.map((candidate) => candidate.candidateId),
          request.expectedAvailableIds,
        )
        requireIds(
          snapshot.jobs.map((job) => job.id),
          request.expectedUnfinishedJobIds,
        )
        const sessions = [
          ...new Set([
            ...snapshot.candidates.map((candidate) => candidate.stagingSessionId),
            ...snapshot.jobs.map((job) => job.stagingSessionId),
          ]),
        ]
        if (
          snapshot.all.some(
            (candidate) =>
              sessions.includes(candidate.stagingSessionId) &&
              !belongs(candidate, tabId, owner.filePath, request.sourceDocumentId, request.layerId),
          )
        ) {
          throw stale()
        }
        const normal = await this.options.normalStaging.listVerifiedCandidates(tabId)
        if (normal.some((candidate) => sessions.includes(candidate.stagingSessionId))) {
          throw stale()
        }
        this.current(tabId, request, owner, epoch)
        await this.options.queue.listSmartPatchAcceptanceSessionJobs({
          documentId: request.sourceDocumentId,
          layerId: request.layerId,
          localProjectKey: tabId,
          projectPath: owner.filePath,
          stagingSessionIds: sessions,
          verifiedCandidates: snapshot.candidates.map((candidate) => ({
            candidateId: candidate.candidateId,
            frozenPayloadSha256: candidate.frozenPayloadSha256,
            stagingSessionId: candidate.stagingSessionId,
          })),
        })
        // A cancellation/publication error must retain the Project fence until explicit retry.
        release = false
        for (const job of snapshot.jobs) {
          await this.options.orchestrator.cancelGenerationJob(job.id)
        }
        await this.options.orchestrator.quiesceSmartPatchForProject(tabId, sessions)
        release = true
        const settled = await read()
        requireIds(
          settled.candidates.map((candidate) => candidate.candidateId),
          request.expectedAvailableIds,
        )
        if (settled.jobs.length > 0) {
          throw stale()
        }
        release = false
        const discarded = await this.options.staging.discardSessions(tabId, sessions)
        release = true
        return discarded
      } finally {
        if (fenced && release) {
          this.options.orchestrator.releaseProjectGenerationFence(tabId)
        }
      }
    })
  }

  async save(
    tabId: string,
    input: ProjectSmartPatchCandidateExportRequest,
  ): Promise<ProjectCandidateExportResult> {
    if (!isProjectSmartPatchCandidateExportRequest(input)) {
      throw invalid()
    }
    const request = structuredClone(input)
    const owner = this.open(tabId)
    const documentId = owner.document.documentId
    const find = async () => {
      const candidate = (await this.options.staging.listVerifiedCandidates(tabId)).find(
        (entry) =>
          entry.candidateId === request.candidateId &&
          entry.documentId === request.documentId &&
          entry.payload.context.layerId === request.layerId &&
          entry.stagingSessionId === request.stagingSessionId &&
          entry.projectPath === owner.filePath,
      )
      if (!candidate || this.open(tabId) !== owner || owner.document.documentId !== documentId) {
        throw stale()
      }
      return candidate
    }
    const initial = await find()
    const destination = await this.options.chooseDestination(
      `smart-patch-${request.candidateId.slice(0, 8)}.png`,
    )
    if (destination.canceled) {
      return { kind: 'canceled' }
    }
    const filePath = destination.filePath
    if (
      !filePath ||
      !path.isAbsolute(filePath) ||
      path.resolve(filePath) !== filePath ||
      !['', '.png'].includes(path.extname(filePath).toLowerCase())
    ) {
      throw new SmartPatchPublicResultError(
        'CANDIDATE_EXPORT_DESTINATION_INVALID',
        'Choose an absolute .png filename for the candidate image.',
      )
    }
    const current = await find()
    if (
      initial.image.sha256 !== current.image.sha256 ||
      initial.frozenPayloadSha256 !== current.frozenPayloadSha256
    ) {
      throw stale()
    }
    const read = await this.options.staging.readVerifiedCandidate({
      candidateId: current.candidateId,
      documentId: current.documentId,
      frozenPayloadSha256: current.frozenPayloadSha256,
      imageSha256: current.image.sha256,
      localProjectKey: tabId,
      stagingSessionId: current.stagingSessionId,
    })
    if (!read || this.open(tabId) !== owner || owner.document.documentId !== documentId) {
      throw stale()
    }
    const target = path.extname(filePath) ? filePath : `${filePath}.png`
    await writeCandidateImageCreateOnly(target, read.imagePngBytes)
    return { fileName: path.basename(target), kind: 'saved' }
  }

  async targetState(
    tabId: string,
    documentId: string,
    documentRevision: string,
    layerId: string,
  ): Promise<ProjectSmartPatchGenerationTargetState> {
    const request = { documentId, documentRevision, layerId }
    const owner = this.owner(tabId, request)
    const epoch = owner.documentEpoch
    const result: ProjectSmartPatchGenerationTargetState = {
      ...request,
      kind: 'smart-patch-target',
      mode: null,
      unavailableReason: 'The image engine is unavailable for inspecting this Smart Patch.',
    }
    const layer = owner.document.layers.find((entry) => entry.id === layerId)
    if (layer?.kind !== 'smart-patch') {
      return { ...result, unavailableReason: 'The original Smart Patch is missing.' }
    }
    if (layer.locked || !layer.visible) {
      return { ...result, unavailableReason: 'Unlock and show this Smart Patch before generating.' }
    }
    try {
      const inspected = await this.options.withWorker(
        async (worker) =>
          await this.options.projects.withCapturedSmartPatchGenerationInput(
            tabId,
            layerId,
            async (capture) => {
              this.current(tabId, request, owner, epoch)
              const prepared = await capture.prepareInput(worker)
              this.current(tabId, request, owner, epoch)
              return prepared.mode
            },
          ),
      )
      this.current(tabId, request, owner, epoch)
      return inspected ? { ...result, mode: inspected, unavailableReason: null } : result
    } catch (error) {
      this.current(tabId, request, owner, epoch)
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'WORKER_EXIT_UNCONFIRMED'
      ) {
        throw error
      }
      return {
        ...result,
        unavailableReason:
          'This Smart Patch source or mask could not be inspected. Review its bounds, internal resolution and image engine before generating.',
      }
    }
  }

  private current(
    tabId: string,
    request: { documentId: string; documentRevision: string },
    owner: ReturnType<ProjectSmartPatchResultActions['open']>,
    epoch: number,
  ) {
    if (this.owner(tabId, request) !== owner || owner.documentEpoch !== epoch) {
      throw changed()
    }
  }

  private open(tabId: string) {
    const owner = this.options.projects.getOpenDocumentForAcceptance(tabId)
    if (!owner) {
      throw new SmartPatchPublicResultError(
        'PROJECT_NOT_OPEN',
        'Open the Project before using Smart Patch results.',
      )
    }
    return owner
  }

  private owner(tabId: string, request: { documentId: string; documentRevision: string }) {
    const owner = this.open(tabId)
    if (
      owner.document.documentId !== request.documentId ||
      owner.document.documentRevision !== request.documentRevision
    ) {
      throw changed()
    }
    return owner
  }
}

function belongs(
  candidate: VerifiedSmartPatchWorldCandidate,
  tabId: string,
  filePath: string,
  documentId: string,
  layerId: string,
) {
  return (
    candidate.localProjectKey === tabId &&
    candidate.projectPath === filePath &&
    candidate.documentId === documentId &&
    candidate.payload.context.layerId === layerId
  )
}
function requireIds(actual: string[], expected: string[]) {
  const reviewed = new Set(expected)
  if (actual.length !== expected.length || actual.some((id) => !reviewed.has(id))) {
    throw stale()
  }
}
function changed() {
  return new SmartPatchPublicResultError(
    'PROJECT_DOCUMENT_CHANGED',
    'The Project changed. Review the current Smart Patch and retry the action.',
  )
}
function stale() {
  return new SmartPatchPublicResultError(
    'SMART_PATCH_SELECTION_STALE',
    'Smart Patch results or unfinished jobs changed. Review them again; temporary results were kept.',
  )
}
function invalid() {
  return new SmartPatchPublicResultError(
    'SMART_PATCH_SELECTION_INVALID',
    'Review a valid Smart Patch request before continuing.',
  )
}
