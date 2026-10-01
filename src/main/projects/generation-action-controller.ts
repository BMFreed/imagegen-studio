import { GenerationBatchPlanError } from '../../shared/projects/generation-batch-plan.js'
import { getEffectiveDynamicPromptSettings } from '../../shared/projects/generation-dynamic-settings.js'
import type {
  GenerationQueueCursor,
  GenerationQueuePage,
  GenerationQueueReview,
  GenerationQueueTerminalStatus,
} from '../../shared/projects/generation-queue-manager.js'
import type {
  ProjectGenerateOptions,
  ProjectGenerateResult,
  ProjectGenerationActionState,
} from '../../shared/projects/project-generation-actions.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import type { ModelService } from '../models/model-service.js'
import type { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import type { GenerationOrchestrator } from './generation-orchestrator.js'
import type { GenerationProcessor } from './generation-processor.js'
import type { GenerationQueueRepository, QueuedGenerationItem } from './generation-queue.js'
import type { GenerationStagingRepository } from './generation-staging.js'
import type { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import type { FrozenGenerationTarget } from './project-generation-target.js'
import type { ProjectWorkerClient } from './worker-client.js'

import {
  IllustriousJobError,
  type InferenceWorkerReady,
  withIllustriousTxt2ImgRequest,
} from './illustrious-txt2img-job.js'
import {
  GenerationPreparationError,
  prepareNormalTxt2Img,
} from './project-generation-preparation.js'

type CapturedNormalInput = {
  composeTarget: (
    worker: Pick<ProjectWorkerClient, 'composeTarget'>,
  ) => Promise<FrozenGenerationTarget>
  document: IgsProjectDocumentV1
}

interface CapturedProjectService {
  getOpenDocumentId: (tabId: string) => string | null
  withCapturedNormalGenerationInput: <T>(
    tabId: string,
    use: (capture: CapturedNormalInput) => Promise<T>,
  ) => Promise<T>
}

interface GenerationActionRuntime {
  withGenerationAdmission: <T>(
    scratchBasePath: string,
    use: (ready: InferenceWorkerReady) => Promise<T>,
  ) => Promise<T | null>
  withGenerationPreparation: <T>(
    scratchBasePath: string,
    use: (preparation: {
      inferenceReady: InferenceWorkerReady
      targetWorker: Pick<ProjectWorkerClient, 'composeTarget'>
    }) => Promise<T>,
  ) => Promise<T | null>
}

interface GenerationActionDependencies {
  dispatch: Pick<GenerationDispatchCoordinator, 'runNext' | 'shutdown'>
  gate: ProjectGenerationOperationGate
  models: Pick<ModelService, 'resolveVerifiedGenerationCheckpointForPlan'>
  orchestrator: Pick<GenerationOrchestrator, 'enqueuePreparedBatch'>
  processor: Pick<GenerationProcessor, 'cancelAndWait' | 'onChanged'>
  projects: CapturedProjectService
  queue: Pick<
    GenerationQueueRepository,
    | 'cancel'
    | 'deleteTerminal'
    | 'fenceProject'
    | 'getManagerEntry'
    | 'listManagerPage'
    | 'listUnfinishedActionJobsByProjectDocument'
    | 'listUnfinishedByProjectDocument'
    | 'loadVerifiedRetryInput'
    | 'pruneTerminal'
    | 'retryTerminal'
  >
  runtime: GenerationActionRuntime
  scratchBasePath: string
  staging: Pick<
    GenerationStagingRepository,
    'discardSessions' | 'listVerifiedCandidates' | 'preflightBatchCapacity' | 'readLastActualSeed'
  >
}

type Impact = {
  candidateIds: string[]
  documentId: string
  sessions: string[]
  unfinished: QueuedGenerationItem[]
  unfinishedJobIds: string[]
}

class ConfirmationChanged extends Error {
  constructor(readonly impact: Impact) {
    super('The temporary results changed. Review them again before replacing.')
  }
}

export class ProjectGenerationActionError extends Error {
  constructor(
    readonly code:
      | 'GENERATION_BLOCKED'
      | 'GENERATION_BUSY'
      | 'GENERATION_CLOSED'
      | 'GENERATION_DOCUMENT_CHANGED'
      | 'GENERATION_INVALID_REQUEST'
      | 'GENERATION_NO_CURRENT_JOB'
      | 'GENERATION_REPLACEMENT_UNCERTAIN'
      | 'GENERATION_RUNTIME_UNAVAILABLE'
      | 'GENERATION_WORKER_EXIT_UNCONFIRMED',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectGenerationActionError'
  }
}

const BLOCKING_CODES = new Set([
  'CANCELLATION_UNCERTAIN',
  'GENERATION_REPLACEMENT_UNCERTAIN',
  'GENERATION_WORKER_EXIT_UNCONFIRMED',
  'PUBLICATION_UNCERTAIN',
  'QUEUE_CHANGED',
  'QUEUE_PUBLICATION_UNCERTAIN',
  'WORKER_EXIT_UNCONFIRMED',
])

/** Main-owned user action boundary; renderer inputs never supply paths, pixels, or worker jobs. */
export class ProjectGenerationActionController {
  private admission: Promise<unknown> | null = null
  private admittingTabId: string | null = null
  private blocked = false
  private closed = false
  private drain: Promise<void> | null = null
  private drainRequested = false
  private error: { code: string; message: string } | null = null
  private readonly listeners = new Set<() => void>()
  private shutdownPromise: Promise<void> | null = null
  private readonly unsubscribeProcessor: () => void

  constructor(private readonly options: GenerationActionDependencies) {
    this.unsubscribeProcessor = options.processor.onChanged(() => this.emitChanged())
  }

  async cancelCurrent(
    tabId: string,
    documentId: string,
    expectedJobId: string,
  ): Promise<ProjectGenerationActionState> {
    this.assertOpen()
    this.assertDocument(tabId, documentId)
    const unfinished = await this.options.queue.listUnfinishedByProjectDocument(tabId, documentId)
    this.assertDocument(tabId, documentId)
    const current = unfinished.find((item) => item.status === 'running')
    if (!current || current.id !== expectedJobId) {
      throw new ProjectGenerationActionError(
        'GENERATION_NO_CURRENT_JOB',
        'The current generation changed. Refresh the queue before canceling.',
      )
    }
    try {
      const canceled = await this.options.processor.cancelAndWait(current.id)
      if (canceled.status === 'running') {
        throw new ProjectGenerationActionError(
          'GENERATION_WORKER_EXIT_UNCONFIRMED',
          'The generation worker has not confirmed exit.',
        )
      }
      this.emitChanged()
      return await this.getState(tabId)
    } catch (error) {
      this.rememberError(error)
      throw error
    }
  }

  async cancelJob(review: GenerationQueueReview): Promise<void> {
    this.assertOpen()
    // The repository CAS rejects a pending→running race before any cancel is requested.
    const item = await this.options.queue.cancel(review.id, review.statusSequence)
    if (item.status === 'running') {
      try {
        const stopped = await this.options.processor.cancelAndWait(item.id)
        if (stopped.status === 'running') {
          throw new ProjectGenerationActionError(
            'GENERATION_WORKER_EXIT_UNCONFIRMED',
            'The generation worker has not confirmed exit.',
          )
        }
      } catch (error) {
        this.rememberError(error)
        throw error
      }
    }
    this.emitChanged()
  }

  async deleteJob(review: GenerationQueueReview): Promise<void> {
    this.assertOpen()
    await this.options.queue.deleteTerminal(review.id, review.statusSequence)
    this.emitChanged()
  }

  async generate(tabId: string, request: ProjectGenerateOptions): Promise<ProjectGenerateResult> {
    this.assertOpen()
    if (this.blocked) {
      throw new ProjectGenerationActionError(
        'GENERATION_BLOCKED',
        'Generation recovery needs attention before another batch can start.',
      )
    }
    if (this.admission) {
      throw new ProjectGenerationActionError(
        'GENERATION_BUSY',
        'Finish preparing the current generation before starting another batch.',
      )
    }
    if (
      !Number.isSafeInteger(request.iterations) ||
      request.iterations < 1 ||
      request.iterations > 100 ||
      typeof request.documentId !== 'string'
    ) {
      throw new ProjectGenerationActionError(
        'GENERATION_INVALID_REQUEST',
        'The generation request is invalid.',
      )
    }
    this.assertDocument(tabId, request.documentId)
    const operation = this.options.gate.run(
      tabId,
      async () => await this.generateUnlocked(tabId, request),
    )
    this.admission = operation
    this.admittingTabId = tabId
    this.error = null
    this.blocked = false
    this.emitChanged()
    let queued = false
    try {
      const result = await operation
      queued = result.kind === 'queued'
      return result
    } catch (error) {
      if (error instanceof ConfirmationChanged) {
        return toConfirmationResult(error.impact)
      }
      this.rememberError(error)
      throw error
    } finally {
      if (this.admission === operation) {
        this.admission = null
        this.admittingTabId = null
      }
      if (queued && !this.closed) {
        this.startDrain()
      }
      this.emitChanged()
    }
  }

  /** Metadata/history remain available independently of the inference runtime. */
  async getQueue(cursor?: GenerationQueueCursor | null): Promise<GenerationQueuePage> {
    this.assertOpen()
    return await this.options.queue.listManagerPage(cursor)
  }

  async getState(tabId: string): Promise<ProjectGenerationActionState> {
    const documentId = this.requireOpenDocument(tabId)
    const jobs = await this.options.queue.listUnfinishedActionJobsByProjectDocument(
      tabId,
      documentId,
    )
    this.assertDocument(tabId, documentId)
    return {
      documentId,
      error: this.error,
      jobs,
      phase: this.blocked
        ? 'blocked'
        : this.closed
          ? 'closed'
          : this.admission
            ? 'preparing'
            : this.drain
              ? 'processing'
              : 'idle',
      runningJobId: jobs.find((job) => job.status === 'running')?.id ?? null,
    }
  }

  onChanged(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async pruneQueue(statuses: readonly GenerationQueueTerminalStatus[]): Promise<number> {
    this.assertOpen()
    const removed = await this.options.queue.pruneTerminal(statuses)
    this.emitChanged()
    return removed
  }

  /** Retry copies the old operation; it never prepares from the current Project draft. */
  async retryJob(review: GenerationQueueReview): Promise<void> {
    this.assertOpen()
    if (this.blocked) {
      throw new ProjectGenerationActionError(
        'GENERATION_BLOCKED',
        'Generation recovery needs attention before another job can start.',
      )
    }
    if (this.admission) {
      throw new ProjectGenerationActionError(
        'GENERATION_BUSY',
        'Finish preparing the current generation before retrying a job.',
      )
    }
    const operation = this.retryUnlocked(review)
    this.admission = operation
    this.error = null
    this.emitChanged()
    let queued = false
    try {
      await operation
      queued = true
    } catch (error) {
      this.rememberError(error)
      throw error
    } finally {
      if (this.admission === operation) {
        this.admission = null
        this.admittingTabId = null
      }
      if (queued && !this.closed) {
        this.startDrain()
      }
      this.emitChanged()
    }
  }

  shutdown(): Promise<void> {
    this.closed = true
    if (this.admittingTabId) {
      // Queue admission may still be writing frozen files. Fence synchronously before awaiting it.
      this.options.queue.fenceProject(this.admittingTabId)
    }
    this.emitChanged()
    this.shutdownPromise ??= this.shutdownOne().catch((error: unknown) => {
      this.rememberError(error)
      this.shutdownPromise = null
      throw error
    })
    return this.shutdownPromise
  }

  private assertAdmissionOpen(): void {
    this.assertOpen()
    if (this.blocked) {
      throw new ProjectGenerationActionError(
        'GENERATION_BLOCKED',
        'Generation recovery needs attention before another job can start.',
      )
    }
  }

  private assertDocument(tabId: string, documentId: string): void {
    if (this.options.projects.getOpenDocumentId(tabId) !== documentId) {
      throw documentChanged()
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ProjectGenerationActionError('GENERATION_CLOSED', 'Generation is shutting down.')
    }
  }

  private emitChanged(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // An observer cannot interrupt admission, cancellation, or worker exit.
      }
    }
  }

  private async generateUnlocked(
    tabId: string,
    request: ProjectGenerateOptions,
  ): Promise<ProjectGenerateResult> {
    this.assertAdmissionOpen()
    this.assertDocument(tabId, request.documentId)
    return await this.options.projects.withCapturedNormalGenerationInput(tabId, async (capture) => {
      this.assertAdmissionOpen()
      if (capture.document.documentId !== request.documentId) {
        throw documentChanged()
      }
      const initial = await this.readImpact(tabId, request.documentId)
      this.assertAdmissionOpen()
      if (!confirmationMatches(initial, request.confirmation)) {
        return toConfirmationResult(initial)
      }
      const dynamic = getEffectiveDynamicPromptSettings(
        capture.document.generationDraft.dynamicPrompt,
      )
      const admitted = await this.options.runtime.withGenerationPreparation(
        this.options.scratchBasePath,
        async ({ inferenceReady, targetWorker }) => {
          this.assertAdmissionOpen()
          const target = await capture.composeTarget(targetWorker)
          this.assertAdmissionOpen()
          const lastActualSeed = await this.options.staging.readLastActualSeed(
            tabId,
            request.documentId,
          )
          this.assertAdmissionOpen()
          const prepared = await prepareNormalTxt2Img({
            lastActualSeed,
            modelService: this.options.models,
            target,
          })
          this.assertAdmissionOpen()
          this.assertDocument(tabId, request.documentId)
          const admitted = await this.options.orchestrator.enqueuePreparedBatch(
            tabId,
            prepared,
            {
              iterations: request.iterations,
              maxPrompts: dynamic.maxPrompts,
              seedBehavior: dynamic.seedBehavior,
            },
            { ready: inferenceReady },
            async () => {
              this.assertAdmissionOpen()
              const current = await this.readImpact(tabId, request.documentId)
              this.assertAdmissionOpen()
              if (!confirmationMatches(current, request.confirmation)) {
                throw new ConfirmationChanged(current)
              }
            },
          )
          // The new batch is durable before any reviewed old result is discarded. Dispatch is
          // still held by admission; a failure below cancels only these newly admitted job IDs.
          let oldCleanupStarted = false
          try {
            this.assertAdmissionOpen()
            const current = await this.readImpact(
              tabId,
              request.documentId,
              admitted.items.map((item) => item.id),
            )
            this.assertAdmissionOpen()
            if (!confirmationMatches(current, request.confirmation)) {
              throw new ConfirmationChanged(current)
            }
            if (request.confirmation && hasImpact(current)) {
              oldCleanupStarted = true
              for (const item of current.unfinished) {
                const stopped = await this.options.processor.cancelAndWait(item.id)
                if (stopped.status !== 'canceled') {
                  throw new ProjectGenerationActionError(
                    'GENERATION_WORKER_EXIT_UNCONFIRMED',
                    'An old generation job has not stopped.',
                  )
                }
              }
              this.assertAdmissionOpen()
              await this.options.staging.discardSessions(tabId, current.sessions)
              this.emitChanged()
            }
          } catch (error) {
            try {
              for (const item of admitted.items) {
                const canceled = await this.options.processor.cancelAndWait(item.id)
                if (canceled.status !== 'canceled') {
                  throw new Error('A newly admitted replacement job did not stop.')
                }
              }
            } catch {
              this.options.queue.fenceProject(tabId)
              throw replacementUncertain()
            }
            this.emitChanged()
            if (oldCleanupStarted) {
              this.options.queue.fenceProject(tabId)
              throw replacementUncertain()
            }
            throw error
          }
          return admitted
        },
      )
      if (!admitted) {
        throw new ProjectGenerationActionError(
          'GENERATION_RUNTIME_UNAVAILABLE',
          'The image runtime could not reserve a qualified generation worker.',
        )
      }
      this.assertAdmissionOpen()
      return {
        batchId: admitted.items[0].batchId,
        documentId: request.documentId,
        jobIds: admitted.items.map((item) => item.id),
        kind: 'queued',
        truncated: admitted.plan.truncated,
      }
    })
  }

  private async readImpact(
    tabId: string,
    documentId: string,
    excludedJobIds: readonly string[] = [],
  ): Promise<Impact> {
    this.assertDocument(tabId, documentId)
    const [allCandidates, unfinished] = await Promise.all([
      this.options.staging.listVerifiedCandidates(tabId),
      this.options.queue.listUnfinishedByProjectDocument(tabId, documentId),
    ])
    this.assertDocument(tabId, documentId)
    const excluded = new Set(excludedJobIds)
    const candidates = allCandidates.filter(
      (candidate) => candidate.documentId === documentId && candidate.localProjectKey === tabId,
    )
    const reviewedUnfinished = unfinished.filter((item) => !excluded.has(item.id))
    return {
      candidateIds: sortedIds(candidates.map((candidate) => candidate.candidateId)),
      documentId,
      sessions: sortedIds([
        ...candidates.map((candidate) => candidate.stagingSessionId),
        ...reviewedUnfinished.map((item) => item.stagingSessionId),
      ]),
      unfinished: reviewedUnfinished,
      unfinishedJobIds: sortedIds(reviewedUnfinished.map((item) => item.id)),
    }
  }

  private rememberError(error: unknown): void {
    const next = toProjectGenerationActionApiError(error)
    const blocks = BLOCKING_CODES.has(next.code)
    // A concurrent admission refusal cannot clear a recovery/worker-exit fence owned by the
    // app. Retain its actionable cause until restart, as with sequential blocking failures.
    if (!this.blocked || blocks) {
      this.error = next
    }
    this.blocked ||= blocks
    this.emitChanged()
  }

  private requireOpenDocument(tabId: string): string {
    const documentId = this.options.projects.getOpenDocumentId(tabId)
    if (!documentId) {
      throw documentChanged()
    }
    return documentId
  }

  private async retryUnlocked(review: GenerationQueueReview): Promise<void> {
    const source = await this.options.queue.getManagerEntry(review.id)
    const tabId = source.projectKey
    const documentId = source.documentId
    this.admittingTabId = tabId
    this.assertAdmissionOpen()
    this.assertDocument(tabId, documentId)
    await this.options.gate.run(tabId, async () => {
      this.assertAdmissionOpen()
      this.assertDocument(tabId, documentId)
      const frozen = await this.options.queue.loadVerifiedRetryInput(review.id)
      if (
        frozen.item.statusSequence !== review.statusSequence ||
        (frozen.item.status !== 'failed' && frozen.item.status !== 'canceled')
      ) {
        throw new ProjectGenerationActionError(
          'GENERATION_INVALID_REQUEST',
          'The queue item changed. Refresh the queue before retrying.',
        )
      }
      this.assertDocument(tabId, frozen.payload.context.documentId)
      const prepared = {
        context: frozen.payload.context,
        targetPngBytes: frozen.targetPngBytes,
      }
      const admitted = await this.options.runtime.withGenerationAdmission(
        this.options.scratchBasePath,
        async (ready) => {
          this.assertAdmissionOpen()
          this.assertDocument(tabId, documentId)
          await withIllustriousTxt2ImgRequest({
            modelService: this.options.models,
            prepared,
            ready,
            scratchBasePath: this.options.scratchBasePath,
            use: async () => {
              this.assertAdmissionOpen()
              this.assertDocument(tabId, documentId)
              const queued = await this.options.queue.retryTerminal(
                review.id,
                review.statusSequence,
                async (input) => {
                  this.assertAdmissionOpen()
                  this.assertDocument(tabId, documentId)
                  await this.options.staging.preflightBatchCapacity({
                    entries: [
                      {
                        frozenPayloadJson: input.frozenPayloadJson,
                        queueItemId: input.queueItemId,
                      },
                    ],
                    localProjectKey: tabId,
                    projectPath: input.source.projectPath,
                    stagingSessionId: input.stagingSessionId,
                  })
                  this.assertAdmissionOpen()
                  this.assertDocument(tabId, documentId)
                },
              )
              try {
                this.assertAdmissionOpen()
                this.assertDocument(tabId, documentId)
              } catch (error) {
                // A late identity/shutdown refusal cannot leave this newly published retry live.
                await this.options.processor.cancelAndWait(queued.id)
                throw error
              }
            },
          })
          return true
        },
      )
      if (admitted === null) {
        throw new ProjectGenerationActionError(
          'GENERATION_RUNTIME_UNAVAILABLE',
          'The image runtime is unavailable. The original queue item and temporary results were kept.',
        )
      }
    })
  }

  private async shutdownOne(): Promise<void> {
    await this.admission?.catch(() => undefined)
    await this.options.dispatch.shutdown()
    await this.drain?.catch(() => undefined)
    this.unsubscribeProcessor()
  }

  private startDrain(): void {
    if (this.closed || this.blocked) {
      return
    }
    this.drainRequested = true
    if (this.drain) {
      return
    }
    let failed = false
    const operation = (async () => {
      for (;;) {
        if (this.closed) {
          return
        }
        // Admission may prepare/copy frozen inputs while the current worker is running. Wait
        // only after runNext has settled and released that worker, before another claim. An
        // admission never waits for this loop, so shutdown cannot create a mutual wait.
        if (this.admission) {
          await this.admission.catch(() => undefined)
          continue
        }
        if (this.blocked) {
          return
        }
        this.drainRequested = false
        const result = await this.options.dispatch.runNext()
        this.emitChanged()
        if (result.kind === 'idle') {
          return
        }
      }
    })()
    this.drain = operation
    this.emitChanged()
    void operation
      .catch((error: unknown) => {
        failed = true
        this.drainRequested = false
        this.rememberError(error)
      })
      .finally(() => {
        if (this.drain === operation) {
          this.drain = null
        }
        // Publication can finish after runNext observed an empty queue but before this owner
        // detaches. Its successful wake must not leave newly durable work stranded.
        if (!failed && this.drainRequested && !this.closed && !this.blocked) {
          this.startDrain()
        }
        this.emitChanged()
      })
  }
}

/** Safe projection for the Generate IPC channels and state notifications alike. */
export function toProjectGenerationActionApiError(error: unknown): {
  code: string
  message: string
} {
  const rawCode =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'GENERATION_FAILED'
  const knownLiteral =
    error instanceof GenerationBatchPlanError || error instanceof IllustriousJobError
  const code =
    /^[A-Z][A-Z0-9_]{0,127}$/.test(rawCode) && (knownLiteral || isGenerationErrorCode(rawCode))
      ? rawCode
      : 'GENERATION_FAILED'
  return { code, message: safeGenerationErrorMessage(error, code) }
}

function isGenerationErrorCode(code: string): boolean {
  return (
    code.startsWith('GENERATION_') ||
    code.startsWith('MODEL_') ||
    code.startsWith('PROJECT_') ||
    code.startsWith('QUEUE_') ||
    code.startsWith('STAGING_') ||
    code.startsWith('WORKER_') ||
    code === 'BUSY' ||
    code === 'CANCELLATION_UNCERTAIN' ||
    code === 'CLOSED' ||
    code === 'PUBLICATION_UNCERTAIN' ||
    code === 'RUNTIME_UNAVAILABLE'
  )
}

/** Only local, literal validation messages may enter the typed renderer state. */
function safeGenerationErrorMessage(error: unknown, code: string): string {
  if (
    error instanceof ProjectGenerationActionError ||
    error instanceof GenerationPreparationError ||
    error instanceof GenerationBatchPlanError ||
    error instanceof IllustriousJobError
  ) {
    return error.message.slice(0, 512)
  }
  if (BLOCKING_CODES.has(code)) {
    return 'Generation recovery needs attention. Save your work and restart the app before generating again.'
  }
  if (code === 'QUEUE_STATUS_CONFLICT' || code === 'QUEUE_CHANGED') {
    return 'The queue item changed. Refresh the queue and review the action again.'
  }
  if (code === 'QUEUE_ITEM_NOT_FOUND') {
    return 'The queue item is no longer available. Refresh the queue.'
  }
  if (code.startsWith('MODEL_')) {
    return 'The selected checkpoint could not be verified for generation.'
  }
  if (code.startsWith('QUEUE_') || code.startsWith('STAGING_')) {
    return 'Generation storage could not be verified. Reopen the Project and try again.'
  }
  if (code.startsWith('WORKER_') || code === 'RUNTIME_UNAVAILABLE') {
    return 'The image runtime could not complete this generation request.'
  }
  return 'Generation could not continue. Review the settings and try again.'
}

function hasImpact(impact: Impact): boolean {
  return impact.candidateIds.length > 0 || impact.unfinishedJobIds.length > 0
}

function confirmationMatches(
  impact: Impact,
  confirmation: ProjectGenerateOptions['confirmation'],
): boolean {
  if (!hasImpact(impact)) {
    return true
  }
  if (!confirmation) {
    return false
  }
  return (
    sameIds(impact.candidateIds, confirmation.candidateIds) &&
    sameIds(impact.unfinishedJobIds, confirmation.unfinishedJobIds)
  )
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (!Array.isArray(right) || left.length !== right.length) {
    return false
  }
  const sorted = sortedIds(right)
  return sorted.length === left.length && sorted.every((id, index) => id === left[index])
}

function sortedIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort()
}

function toConfirmationResult(impact: Impact): ProjectGenerateResult {
  return {
    candidateIds: impact.candidateIds,
    documentId: impact.documentId,
    kind: 'confirmation-required',
    unfinishedJobIds: impact.unfinishedJobIds,
  }
}

function documentChanged(): ProjectGenerationActionError {
  return new ProjectGenerationActionError(
    'GENERATION_DOCUMENT_CHANGED',
    'The Project document changed before generation could continue.',
  )
}

function replacementUncertain(): ProjectGenerationActionError {
  return new ProjectGenerationActionError(
    'GENERATION_REPLACEMENT_UNCERTAIN',
    'The replacement could not be confirmed. Save your work and restart the app before generating again.',
  )
}
