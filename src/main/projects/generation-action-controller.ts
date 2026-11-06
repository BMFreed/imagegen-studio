import { AnimaFlowSamplingPlanError } from '../../shared/projects/anima-flow-sampling-plan.js'
import {
  AnimaPromptWeightingError,
  compileAnimaPromptWeighting,
} from '../../shared/projects/anima-prompt-weighting.js'
import { AnimaWorkerRequestError } from '../../shared/projects/anima-worker-request.js'
import { planGenerationBatch } from '../../shared/projects/generation-batch-plan.js'
import { GenerationBatchPlanError } from '../../shared/projects/generation-batch-plan.js'
import { GENERATION_BATCH_JOB_LIMIT } from '../../shared/projects/generation-batch-policy.js'
import { getEffectiveDynamicPromptSettings } from '../../shared/projects/generation-dynamic-settings.js'
import type {
  GenerationQueueCursor,
  GenerationQueuePage,
  GenerationQueueReview,
  GenerationQueueTerminalStatus,
} from '../../shared/projects/generation-queue-manager.js'
import {
  defaultIllustriousNoiseProfile,
  isDefaultIllustriousNoiseProfile,
  supportsIllustriousNoiseProfile,
} from '../../shared/projects/illustrious-noise-profile.js'
import { resolveIllustriousScheduler } from '../../shared/projects/illustrious-scheduler.js'
import {
  isQualifiedInferenceWorkerReady,
  supportsInferenceAnima,
  supportsInferenceAnimaOutpaint,
  supportsInferenceCFGRescale,
  supportsInferenceEmbeddings,
  supportsInferenceEuler,
  supportsInferenceExternalVae,
  supportsInferenceIllustriousNoiseProfile,
  supportsInferenceImg2Img,
  supportsInferenceLora,
  supportsInferenceOutpaint,
  supportsInferenceRegionalDpm,
  supportsInferenceRegionalInvokeInitialization,
  supportsInferenceRegionalLoras,
  supportsInferenceRegionalVae,
  supportsInferenceVaePrecision,
} from '../../shared/projects/inference-worker-capabilities.js'
import type {
  ProjectGenerateOptions,
  ProjectGenerateResult,
  ProjectGenerationActionState,
} from '../../shared/projects/project-generation-actions.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import {
  assertRegionalGuidanceGenerationAvailable,
  RegionalGuidanceGenerationError,
} from '../../shared/projects/regional-guidance.js'
import {
  getInvokeRegionalGenerationUnavailableReason,
  hasActiveGlobalPromptEmbeddings,
  hasEnabledRegionalGuidance,
} from '../../shared/projects/regional-invoke-generation.js'

import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import path from 'node:path'

import type { OutpaintInfillResolver } from '../runtime/inference-auxiliary-resources.js'
import type { AnimaGenerationModelResolver } from './anima-generation-preparation.js'
import type { PreparedAnimaGeneration } from './anima-generation-preparation.js'
import type { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import type { GenerationOrchestrator } from './generation-orchestrator.js'
import type { PreparedBatchAdmissionResult } from './generation-orchestrator.js'
import type { GenerationProcessor } from './generation-processor.js'
import type {
  GenerationQueueRepository,
  GenerationQueueRetryPreflightInput,
  QueuedGenerationItem,
} from './generation-queue.js'
import type { GenerationStagingRepository } from './generation-staging.js'
import type { GenerationModelResolver } from './illustrious-generation-loras.js'
import type { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import type { PreparedNormalGeneration } from './project-generation-preparation.js'
import type { FrozenGenerationTarget } from './project-generation-target.js'
import type { ProjectService } from './project-service.js'
import type { SmartPatchExecutionModelResolver } from './project-smart-patch-execution.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { InferenceAuxiliaryResourceError } from '../runtime/inference-auxiliary-resources.js'
import { AnimaGenerationBatchError, prepareAnimaGenerationBatch } from './anima-generation-batch.js'
import {
  prepareAnimaGeneration,
  prepareAnimaOutpaintGeneration,
  validateAnimaGenerationDraft,
} from './anima-generation-preparation.js'
import { AnimaGenerationRequestError } from './anima-generation-request.js'
import { AnimaQueuedGenerationError } from './anima-queued-generation.js'
import { withQueuedAnimaGenerationRequest } from './anima-queued-request.js'
import { isQueuedOutpaint, type PreparedOutpaintGeneration } from './generation-queue.js'
import {
  IllustriousJobError,
  type InferenceWorkerReady,
  withIllustriousGenerationRequest,
} from './illustrious-txt2img-job.js'
import { buildQueuedOutpaintWorkerRequest } from './outpaint-worker-request.js'
import {
  GenerationPreparationError,
  prepareNormalGeneration,
  prepareNormalOutpaintGeneration,
} from './project-generation-preparation.js'
import {
  type ProjectRegionalGenerationCoordinator,
  ProjectRegionalGenerationError,
} from './project-regional-generation-coordinator.js'

type CapturedNormalInput = {
  composeTarget: (
    worker: Pick<ProjectWorkerClient, 'composeTarget'>,
  ) => Promise<FrozenGenerationTarget>
  document: IgsProjectDocumentV1
}

interface CapturedProjectService {
  getOpenDocumentForAcceptance?: ProjectService['getOpenDocumentForAcceptance']
  getOpenDocumentId: (tabId: string) => string | null
  withCapturedNormalGenerationInput: <T>(
    tabId: string,
    use: (capture: CapturedNormalInput) => Promise<T>,
  ) => Promise<T>
}

interface GenerationActionRuntime {
  getStatus: () => Promise<unknown>
  readQualifiedInferenceReady: () => Promise<InferenceWorkerReady | null>
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
  dispatch: Partial<Pick<GenerationDispatchCoordinator, 'onChanged'>> &
    Pick<GenerationDispatchCoordinator, 'runNext' | 'shutdown'>
  gate: ProjectGenerationOperationGate
  infillResolver?: OutpaintInfillResolver
  models: GenerationModelResolver & Partial<AnimaGenerationModelResolver>
  orchestrator: Partial<
    Pick<
      GenerationOrchestrator,
      | 'cancelGenerationJob'
      | 'enqueuePreparedAnimaBatch'
      | 'enqueuePreparedOutpaintBatch'
      | 'retryRegional'
    >
  > &
    Pick<GenerationOrchestrator, 'enqueuePreparedBatch'>
  processor: Pick<GenerationProcessor, 'cancelAndWait' | 'onChanged'>
  projects: CapturedProjectService
  queue: Partial<
    Pick<
      GenerationQueueRepository,
      | 'listUnfinishedNormalByProjectDocument'
      | 'loadVerifiedRegionalInput'
      | 'loadVerifiedSmartPatchInput'
      | 'retryPreparedOutpaintTerminal'
      | 'retryPreparedSmartPatchTerminal'
    >
  > &
    Pick<
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
  regional?: Pick<ProjectRegionalGenerationCoordinator, 'submitInvokeBatchUnderGate'>
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
      | 'GENERATION_MODEL_UNAVAILABLE'
      | 'GENERATION_NO_CURRENT_JOB'
      | 'GENERATION_REPLACEMENT_UNCERTAIN'
      | 'GENERATION_RUNTIME_UNAVAILABLE'
      | 'GENERATION_SEED_INVALID'
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
    const ordinary = options.processor.onChanged(() => this.emitChanged())
    const smart = options.dispatch.onChanged?.(() => this.emitChanged())
    this.unsubscribeProcessor = () => {
      ordinary()
      smart?.()
    }
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
      const canceled = await this.cancelQueuedItem(current.id)
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
    await this.options.queue.getManagerEntry(review.id)
    // The repository CAS rejects a pending→running race before any cancel is requested.
    const item = await this.options.queue.cancel(review.id, review.statusSequence)
    if (item.status === 'running') {
      try {
        const stopped = await this.cancelQueuedItem(item.id)
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
    await this.options.queue.getManagerEntry(review.id)
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
    let ready: InferenceWorkerReady | null = null
    if (!this.blocked && !this.closed) {
      try {
        // Reuse the ordinary status qualifier/cache. While inference is active it inspects its
        // existing lease, and cannot start a competing CUDA process for this advisory UI state.
        await this.options.runtime.getStatus()
        ready = await this.options.runtime.readQualifiedInferenceReady()
      } catch {
        // Optional controls fail closed while durable queue metadata remains inspectable.
      }
    }
    this.assertDocument(tabId, documentId)
    return {
      animaOutpaintSupported:
        !this.blocked && !this.closed && supportsInferenceAnimaOutpaint(ready),
      animaSupported: !this.blocked && !this.closed && supportsInferenceAnima(ready),
      cfgRescaleSupported: !this.blocked && !this.closed && supportsInferenceCFGRescale(ready),
      documentId,
      embeddingsSupported: !this.blocked && !this.closed && supportsInferenceEmbeddings(ready),
      error: this.error,
      externalVaeSupported: !this.blocked && !this.closed && supportsInferenceExternalVae(ready),
      img2imgSupported: !this.blocked && !this.closed && supportsInferenceImg2Img(ready),
      jobs,
      outpaintSupported: !this.blocked && !this.closed && supportsInferenceOutpaint(ready),
      phase: this.blocked
        ? 'blocked'
        : this.closed
          ? 'closed'
          : this.admission
            ? 'preparing'
            : this.drain
              ? 'processing'
              : 'idle',
      regionalDpmSupported:
        !this.blocked &&
        !this.closed &&
        !!this.options.regional &&
        supportsInferenceRegionalDpm(ready),
      regionalInvokeInitializationSupported:
        !this.blocked &&
        !this.closed &&
        !!this.options.regional &&
        supportsRegional(ready) &&
        supportsInferenceRegionalInvokeInitialization(ready),
      regionalLoraSupported:
        !this.blocked &&
        !this.closed &&
        !!this.options.regional &&
        supportsInferenceRegionalLoras(ready),
      regionalSupported:
        !this.blocked && !this.closed && !!this.options.regional && supportsRegional(ready),
      regionalVaeSupported:
        !this.blocked &&
        !this.closed &&
        !!this.options.regional &&
        supportsInferenceRegionalVae(ready),
      runningJobId: jobs.find((job) => job.status === 'running')?.id ?? null,
      smartPatchSupported:
        !this.blocked &&
        !this.closed &&
        ready?.workerVersion === '0.14.0' &&
        ready.capabilities.includes('smart-patch-execution') &&
        ready.capabilities.includes('smart-patch-seed-confirmation'),
      vaePrecisionSupported: !this.blocked && !this.closed && supportsInferenceVaePrecision(ready),
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

  requestDrain(): void {
    this.startDrain()
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

  /** Share app-wide admission and the existing serial drain with the Smart Patch action owner. */
  async withExternalAdmission<T>(tabId: string, prepare: () => Promise<T>): Promise<T> {
    this.assertAdmissionOpen()
    if (this.admission) {
      throw new ProjectGenerationActionError(
        'GENERATION_BUSY',
        'Another generation is being prepared.',
      )
    }
    const operation = this.options.gate.run(tabId, prepare)
    this.admission = operation
    this.admittingTabId = tabId
    this.error = null
    this.emitChanged()
    try {
      return await operation
    } catch (error) {
      this.rememberError(error)
      throw error
    } finally {
      if (this.admission === operation) {
        this.admission = null
        this.admittingTabId = null
      }
      this.startDrain()
      this.emitChanged()
    }
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

  private async cancelPublishedJobs(
    tabId: string,
    items: readonly QueuedGenerationItem[],
  ): Promise<void> {
    try {
      for (const item of items) {
        const stopped = await this.cancelQueuedItem(item.id)
        if (stopped.status !== 'canceled') {
          throw new Error('A newly admitted job has not stopped.')
        }
      }
    } catch {
      this.options.queue.fenceProject(tabId)
      throw replacementUncertain()
    }
  }

  private async cancelQueuedItem(id: string): Promise<QueuedGenerationItem> {
    return this.options.orchestrator.cancelGenerationJob
      ? await this.options.orchestrator.cancelGenerationJob(id)
      : await this.options.processor.cancelAndWait(id)
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

  /** Invoke Canvas composition uses the same reviewed replacement and durable admission owners. */
  private async generateInvokeUnlocked(
    tabId: string,
    request: ProjectGenerateOptions,
    document: IgsProjectDocumentV1,
  ): Promise<ProjectGenerateResult> {
    const unavailable = getInvokeRegionalGenerationUnavailableReason({
      document,
      dpmSupported: true,
      embeddingsSupported: true,
      initializationSupported: true,
      iterations: request.iterations,
      loraSupported: true,
      runtimeSupported: true,
      vaeSupported: true,
    })
    if (unavailable || !this.options.regional) {
      throw new ProjectGenerationActionError(
        'GENERATION_INVALID_REQUEST',
        unavailable ?? 'Regional Guidance is unavailable in this application.',
      )
    }
    let cleanupStarted = false
    let truncated = false
    const assertAction = () => {
      this.assertAdmissionOpen()
      this.assertDocument(tabId, request.documentId)
    }
    const review = async (exclude: readonly string[] = []) => {
      assertAction()
      const impact = await this.readImpact(tabId, request.documentId, exclude)
      assertAction()
      if (!confirmationMatches(impact, request.confirmation)) {
        throw new ConfirmationChanged(impact)
      }
      return impact
    }
    try {
      const items = await this.options.regional.submitInvokeBatchUnderGate(tabId, {
        afterPublication: async (queued, assertCurrent) => {
          assertCurrent()
          const current = await review(queued.map((item) => item.id))
          assertCurrent()
          if (request.confirmation && hasImpact(current)) {
            for (const old of current.unfinished) {
              assertAction()
              assertCurrent()
              cleanupStarted = true
              const stopped = await this.cancelQueuedItem(old.id)
              if (stopped.status !== 'canceled') {
                throw replacementUncertain()
              }
            }
            assertAction()
            assertCurrent()
            cleanupStarted = true
            await this.options.staging.discardSessions(tabId, current.sessions)
            assertCurrent()
            this.emitChanged()
          }
        },
        beforePublication: async () => {
          await review()
        },
        documentId: request.documentId,
        documentRevision: document.documentRevision,
        iterations: request.iterations,
        onPlanned: (info) => {
          truncated = info.truncated
        },
        withPreparation: async (use) => {
          await review()
          return await this.options.runtime.withGenerationPreparation(
            this.options.scratchBasePath,
            async (preparation) => {
              assertAction()
              if (
                !supportsRegional(preparation.inferenceReady) ||
                (document.generationDraft.sampling.sampler === 'DPM++ 2M' &&
                  !supportsInferenceRegionalDpm(preparation.inferenceReady)) ||
                (document.generationDraft.loras.some((entry) => entry.enabled) &&
                  !supportsInferenceRegionalLoras(preparation.inferenceReady)) ||
                ((document.generationDraft.vae !== null ||
                  (document.generationDraft.vaePrecision ?? 'Auto') !== 'FP16') &&
                  !supportsInferenceRegionalVae(preparation.inferenceReady)) ||
                (hasActiveGlobalPromptEmbeddings(document) &&
                  !supportsInferenceEmbeddings(preparation.inferenceReady)) ||
                (document.generationDraft.sampling.sampler === 'Euler a' &&
                  !supportsInferenceRegionalInvokeInitialization(preparation.inferenceReady))
              ) {
                throw new ProjectGenerationActionError(
                  'GENERATION_RUNTIME_UNAVAILABLE',
                  'Repair or update the image engine to generate with Regional Guidance. Existing jobs and results were kept.',
                )
              }
              return await use(preparation)
            },
          )
        },
      })
      assertAction()
      return {
        batchId: items[0].batchId,
        documentId: request.documentId,
        jobIds: items.map((item) => item.id),
        kind: 'queued',
        truncated,
      }
    } catch (error) {
      if (cleanupStarted) {
        this.options.queue.fenceProject(tabId)
        throw replacementUncertain()
      }
      throw error
    }
  }

  private async generateUnlocked(
    tabId: string,
    request: ProjectGenerateOptions,
  ): Promise<ProjectGenerateResult> {
    this.assertAdmissionOpen()
    this.assertDocument(tabId, request.documentId)
    const owner = this.options.projects.getOpenDocumentForAcceptance?.(tabId)
    if (owner && this.options.regional && hasEnabledRegionalGuidance(owner.document)) {
      return await this.generateInvokeUnlocked(tabId, request, owner.document)
    }
    if (owner) {
      assertRegionalGuidanceGenerationAvailable(owner.document)
    }
    const outpaintPublication: { admission: PreparedBatchAdmissionResult | null } = {
      admission: null,
    }
    let outpaintOldCleanupStarted = false
    try {
      const result =
        await this.options.projects.withCapturedNormalGenerationInput<ProjectGenerateResult>(
          tabId,
          async (capture) => {
            this.assertAdmissionOpen()
            assertRegionalGuidanceGenerationAvailable(capture.document)
            if (capture.document.documentId !== request.documentId) {
              throw documentChanged()
            }
            const initial = await this.readImpact(tabId, request.documentId)
            this.assertAdmissionOpen()
            if (!confirmationMatches(initial, request.confirmation)) {
              return toConfirmationResult(initial)
            }
            const hasEmbeddings =
              capture.document.generationDraft.positivePrompt.embeddingRefs.length > 0 ||
              capture.document.generationDraft.negativePrompt.embeddingRefs.length > 0
            const anima = capture.document.generationDraft.model?.baseModelFamily === 'anima'
            const euler = !anima && capture.document.generationDraft.sampling.sampler === 'Euler'
            let animaModels: AnimaGenerationModelResolver | null = null
            if (anima) {
              const models = this.options.models
              const resolveBundle = models.resolveVerifiedGenerationAnimaBundleForPlan
              const resolveLora = models.resolveVerifiedAnimaGenerationLoraForPlan
              if (
                typeof resolveBundle !== 'function' ||
                typeof resolveLora !== 'function' ||
                typeof this.options.orchestrator.enqueuePreparedAnimaBatch !== 'function'
              ) {
                throw new ProjectGenerationActionError(
                  'GENERATION_MODEL_UNAVAILABLE',
                  'The selected Anima resources cannot be verified for generation.',
                )
              }
              animaModels = {
                resolveVerifiedAnimaGenerationLoraForPlan: resolveLora.bind(models),
                resolveVerifiedGenerationAnimaBundleForPlan: resolveBundle.bind(models),
              }
              // Validate the complete authored envelope and concrete weighted prompt pairs without
              // choosing Random or disguising unavailable Reuse. The real cursor is checked below.
              validateAnimaGenerationDraft(capture.document.generationDraft, {
                bbox: capture.document.primaryBbox,
                lastActualSeed:
                  capture.document.generationDraft.seed.policy === 'reuse' ? 0 : undefined,
                lastActualSeedSnapshot: capture.document.lastActualSeedSnapshot,
              })
              const dynamic = getEffectiveDynamicPromptSettings(
                capture.document.generationDraft.dynamicPrompt,
              )
              const preflight = planGenerationBatch({
                baseSeed: 0,
                iterations: request.iterations,
                maxJobs: GENERATION_BATCH_JOB_LIMIT,
                maxPrompts: dynamic.maxPrompts,
                negativePrompt: capture.document.generationDraft.negativePrompt.text,
                positivePrompt: capture.document.generationDraft.positivePrompt.text,
                seedBehavior: dynamic.seedBehavior,
              })
              for (const item of preflight.items) {
                compileAnimaPromptWeighting(item.prompts.positive)
                compileAnimaPromptWeighting(item.prompts.negative)
              }
            }
            const checkpointPolicy =
              !anima && capture.document.generationDraft.model
                ? await this.options.models.resolveVerifiedGenerationCheckpointForPlan(
                    capture.document.generationDraft.model,
                  )
                : null
            const noiseProfile = checkpointPolicy?.noiseProfile ?? defaultIllustriousNoiseProfile()
            const requiresNoiseProfile = !anima && !isDefaultIllustriousNoiseProfile(noiseProfile)
            const pair = resolveIllustriousScheduler(
              capture.document.generationDraft.sampling.sampler,
              capture.document.generationDraft.sampling.scheduler,
            )
            if (
              !anima &&
              pair.kind === 'supported' &&
              !supportsIllustriousNoiseProfile(pair.key, noiseProfile)
            ) {
              throw new GenerationPreparationError(
                'GENERATION_SAMPLING_UNSUPPORTED',
                'DPM++ SDE does not support ZTSNR in this image engine. Choose another sampler or disable ZTSNR in Model Manager.',
              )
            }
            // Refuse known legacy peers before reserving a worker or composing target pixels.
            const ready =
              hasEmbeddings || anima || euler || requiresNoiseProfile
                ? await this.options.runtime.readQualifiedInferenceReady()
                : null
            if (requiresNoiseProfile && ready && !supportsInferenceIllustriousNoiseProfile(ready)) {
              throw new IllustriousJobError(
                'INFERENCE_UNAVAILABLE',
                'The active worker has not qualified the checkpoint noise profile.',
              )
            }
            if (euler && ready && !supportsInferenceEuler(ready)) {
              throw new IllustriousJobError(
                'INFERENCE_UNAVAILABLE',
                'The active worker has not qualified ordinary Illustrious Euler.',
              )
            }
            if (anima && ready && !supportsInferenceAnima(ready)) {
              throw new AnimaGenerationRequestError(
                'INFERENCE_UNAVAILABLE',
                'The active image engine has not qualified the original Anima pipeline.',
              )
            }
            if (!anima && hasEmbeddings && ready && !supportsInferenceEmbeddings(ready)) {
              throw new GenerationPreparationError(
                'GENERATION_EMBEDDING_UNSUPPORTED',
                'The active image engine has not qualified Illustrious prompt embeddings.',
              )
            }
            if (!anima) {
              await this.options.models.assertNoUnboundGenerationEmbeddings({
                modelFamily: capture.document.generationDraft.model?.baseModelFamily ?? null,
                negativePrompt: capture.document.generationDraft.negativePrompt,
                positivePrompt: capture.document.generationDraft.positivePrompt,
              })
            }
            this.assertAdmissionOpen()
            const dynamic = getEffectiveDynamicPromptSettings(
              capture.document.generationDraft.dynamicPrompt,
            )
            const admitted = await this.options.runtime.withGenerationPreparation(
              this.options.scratchBasePath,
              async ({ inferenceReady, targetWorker }) => {
                this.assertAdmissionOpen()
                if (
                  requiresNoiseProfile &&
                  !supportsInferenceIllustriousNoiseProfile(inferenceReady)
                ) {
                  throw new IllustriousJobError(
                    'INFERENCE_UNAVAILABLE',
                    'The active worker has not qualified the checkpoint noise profile.',
                  )
                }
                if (euler && !supportsInferenceEuler(inferenceReady)) {
                  throw new IllustriousJobError(
                    'INFERENCE_UNAVAILABLE',
                    'The active worker has not qualified ordinary Illustrious Euler.',
                  )
                }
                if (anima && !supportsInferenceAnima(inferenceReady)) {
                  throw new AnimaGenerationRequestError(
                    'INFERENCE_UNAVAILABLE',
                    'The active image engine has not qualified the original Anima pipeline.',
                  )
                }
                if (!anima && hasEmbeddings && !supportsInferenceEmbeddings(inferenceReady)) {
                  throw new GenerationPreparationError(
                    'GENERATION_EMBEDDING_UNSUPPORTED',
                    'The active image engine has not qualified Illustrious prompt embeddings.',
                  )
                }
                if (
                  !anima &&
                  capture.document.generationDraft.vae &&
                  !supportsInferenceExternalVae(inferenceReady)
                ) {
                  throw new IllustriousJobError(
                    'INFERENCE_UNAVAILABLE',
                    'The active worker has not qualified external Illustrious VAE loading.',
                  )
                }
                if (
                  !anima &&
                  capture.document.generationDraft.vaePrecision !== undefined &&
                  capture.document.generationDraft.vaePrecision !== 'Auto' &&
                  !supportsInferenceVaePrecision(inferenceReady)
                ) {
                  throw new IllustriousJobError(
                    'INFERENCE_UNAVAILABLE',
                    'The active worker has not qualified manual Illustrious VAE Precision.',
                  )
                }
                if (
                  !anima &&
                  (capture.document.generationDraft.cfgRescale ?? 0) !== 0 &&
                  !supportsInferenceCFGRescale(inferenceReady)
                ) {
                  throw new IllustriousJobError(
                    'INFERENCE_UNAVAILABLE',
                    'The active worker has not qualified Illustrious CFG Rescale.',
                  )
                }
                if (
                  !anima &&
                  capture.document.generationDraft.loras.some((entry) => entry.enabled) &&
                  !supportsInferenceLora(inferenceReady)
                ) {
                  throw new IllustriousJobError(
                    'INFERENCE_UNAVAILABLE',
                    'The active worker has not qualified Illustrious LoRA.',
                  )
                }
                const target = await capture.composeTarget(targetWorker)
                this.assertAdmissionOpen()
                if (target.mode === 'outpaint') {
                  if (
                    !supportsInferenceOutpaint(inferenceReady) ||
                    (anima && !supportsInferenceAnimaOutpaint(inferenceReady))
                  ) {
                    throw new ProjectGenerationActionError(
                      'GENERATION_RUNTIME_UNAVAILABLE',
                      'The active image engine has not qualified this outpaint operation. Existing jobs and results were kept.',
                    )
                  }
                  if (
                    !this.options.infillResolver ||
                    typeof this.options.orchestrator.enqueuePreparedOutpaintBatch !== 'function'
                  ) {
                    throw new ProjectGenerationActionError(
                      'GENERATION_RUNTIME_UNAVAILABLE',
                      'The exact local outpaint infill resource is unavailable. Existing jobs and results were kept.',
                    )
                  }
                }
                if (
                  !anima &&
                  target.mode === 'img2img' &&
                  !supportsInferenceImg2Img(inferenceReady)
                ) {
                  throw new IllustriousJobError(
                    'INFERENCE_UNAVAILABLE',
                    'The active worker has not qualified opaque Illustrious img2img.',
                  )
                }
                const lastActualSeed = await this.options.staging.readLastActualSeed(
                  tabId,
                  request.documentId,
                )
                this.assertAdmissionOpen()
                const prepared =
                  target.mode === 'outpaint'
                    ? anima
                      ? await prepareAnimaOutpaintGeneration({
                          lastActualSeed,
                          modelService: animaModels!,
                          target,
                        })
                      : await prepareNormalOutpaintGeneration({
                          lastActualSeed,
                          modelService: this.options.models,
                          target,
                        })
                    : anima
                      ? await prepareAnimaGeneration({
                          lastActualSeed,
                          modelService: animaModels!,
                          target,
                        })
                      : await prepareNormalGeneration({
                          lastActualSeed,
                          modelService: this.options.models,
                          target,
                        })
                this.assertAdmissionOpen()
                this.assertDocument(tabId, request.documentId)
                const beforePublication = async () => {
                  this.assertAdmissionOpen()
                  const current = await this.readImpact(tabId, request.documentId)
                  this.assertAdmissionOpen()
                  if (!confirmationMatches(current, request.confirmation)) {
                    throw new ConfirmationChanged(current)
                  }
                }
                const admitted = isPreparedOutpaintGeneration(prepared)
                  ? await this.options.orchestrator.enqueuePreparedOutpaintBatch!(
                      tabId,
                      prepared,
                      {
                        iterations: request.iterations,
                        maxPrompts: dynamic.maxPrompts,
                        seedBehavior: dynamic.seedBehavior,
                      },
                      { ready: inferenceReady },
                      beforePublication,
                      () => {
                        this.assertAdmissionOpen()
                        this.assertDocument(tabId, request.documentId)
                      },
                    )
                  : isPreparedAnimaGeneration(prepared)
                    ? await this.options.orchestrator.enqueuePreparedAnimaBatch!(
                        tabId,
                        prepareAnimaGenerationBatch({
                          iterations: request.iterations,
                          prepared,
                        }),
                        { ready: inferenceReady },
                        beforePublication,
                      )
                    : await this.options.orchestrator.enqueuePreparedBatch(
                        tabId,
                        prepared,
                        {
                          iterations: request.iterations,
                          maxPrompts: dynamic.maxPrompts,
                          seedBehavior: dynamic.seedBehavior,
                        },
                        { ready: inferenceReady },
                        beforePublication,
                      )
                if (target.mode === 'outpaint') {
                  // Retain ownership beyond both the runtime's worker exit and the Project's raster
                  // lease cleanup. Neither wrapper may discard reviewed old work before it succeeds.
                  outpaintPublication.admission = admitted
                  return admitted
                }
                // The new batch is durable before any reviewed old result is discarded. Dispatch is
                // still held by admission; a failure below cancels only these newly admitted job IDs.
                let oldCleanupStarted = false
                try {
                  this.assertAdmissionOpen()
                  await admitted.assertCurrent?.()
                  const current = await this.readImpact(
                    tabId,
                    request.documentId,
                    admitted.items.map((item) => item.id),
                  )
                  this.assertAdmissionOpen()
                  await admitted.assertCurrent?.()
                  this.assertAdmissionOpen()
                  if (!confirmationMatches(current, request.confirmation)) {
                    throw new ConfirmationChanged(current)
                  }
                  if (request.confirmation && hasImpact(current)) {
                    for (const item of current.unfinished) {
                      await admitted.assertCurrent?.()
                      this.assertAdmissionOpen()
                      oldCleanupStarted = true
                      const stopped = await this.cancelQueuedItem(item.id)
                      if (stopped.status !== 'canceled') {
                        throw new ProjectGenerationActionError(
                          'GENERATION_WORKER_EXIT_UNCONFIRMED',
                          'An old generation job has not stopped.',
                        )
                      }
                    }
                    this.assertAdmissionOpen()
                    await admitted.assertCurrent?.()
                    this.assertAdmissionOpen()
                    oldCleanupStarted = true
                    await this.options.staging.discardSessions(tabId, current.sessions)
                    this.emitChanged()
                  }
                } catch (error) {
                  try {
                    for (const item of admitted.items) {
                      const canceled = await this.cancelQueuedItem(item.id)
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
          },
        )
      const admitted = outpaintPublication.admission
      if (admitted) {
        // Both child exit and frozen-raster lease cleanup have completed. Dispatch remains held
        // by the public admission while identity and the exact reviewed impact are refreshed.
        this.assertAdmissionOpen()
        await admitted.assertCurrent?.()
        const current = await this.readImpact(
          tabId,
          request.documentId,
          admitted.items.map((item) => item.id),
        )
        this.assertAdmissionOpen()
        await admitted.assertCurrent?.()
        this.assertAdmissionOpen()
        if (!confirmationMatches(current, request.confirmation)) {
          throw new ConfirmationChanged(current)
        }
        if (request.confirmation && hasImpact(current)) {
          for (const item of current.unfinished) {
            await admitted.assertCurrent?.()
            this.assertAdmissionOpen()
            outpaintOldCleanupStarted = true
            const stopped = await this.cancelQueuedItem(item.id)
            if (stopped.status !== 'canceled') {
              throw new ProjectGenerationActionError(
                'GENERATION_WORKER_EXIT_UNCONFIRMED',
                'An old generation job has not stopped.',
              )
            }
          }
          this.assertAdmissionOpen()
          await admitted.assertCurrent?.()
          this.assertAdmissionOpen()
          outpaintOldCleanupStarted = true
          await this.options.staging.discardSessions(tabId, current.sessions)
          this.emitChanged()
        }
        this.assertAdmissionOpen()
        await admitted.assertCurrent?.()
        this.assertAdmissionOpen()
        this.assertDocument(tabId, request.documentId)
      }
      return result
    } catch (error) {
      if (outpaintPublication.admission) {
        await this.cancelPublishedJobs(tabId, outpaintPublication.admission.items)
      }
      if (outpaintOldCleanupStarted) {
        this.options.queue.fenceProject(tabId)
        throw replacementUncertain()
      }
      throw error
    }
  }

  private async readImpact(
    tabId: string,
    documentId: string,
    excludedJobIds: readonly string[] = [],
  ): Promise<Impact> {
    this.assertDocument(tabId, documentId)
    const [allCandidates, unfinished] = await Promise.all([
      this.options.staging.listVerifiedCandidates(tabId),
      this.options.queue.listUnfinishedNormalByProjectDocument
        ? this.options.queue.listUnfinishedNormalByProjectDocument(tabId, documentId)
        : this.options.queue.listUnfinishedByProjectDocument(tabId, documentId),
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

  /** Replay only the reviewed concrete frozen input; no live target or draft capture. */
  private async retrySmartPatchUnlocked(
    review: GenerationQueueReview,
    tabId: string,
    documentId: string,
  ): Promise<void> {
    this.admittingTabId = tabId
    if (!this.options.projects.getOpenDocumentForAcceptance) {
      throw new ProjectGenerationActionError(
        'GENERATION_RUNTIME_UNAVAILABLE',
        'Smart Patch Retry is unavailable. The original queue item was kept.',
      )
    }
    const owner = this.options.projects.getOpenDocumentForAcceptance?.(tabId)
    const assertCurrent = () => {
      this.assertAdmissionOpen()
      this.assertDocument(tabId, documentId)
      if (!owner || this.options.projects.getOpenDocumentForAcceptance?.(tabId) !== owner) {
        throw documentChanged()
      }
    }
    assertCurrent()
    await this.options.gate.run(tabId, async () => {
      assertCurrent()
      const { models, queue } = this.options
      if (!queue.loadVerifiedSmartPatchInput || !queue.retryPreparedSmartPatchTerminal) {
        throw new ProjectGenerationActionError(
          'GENERATION_RUNTIME_UNAVAILABLE',
          'Smart Patch Retry is unavailable. The original queue item was kept.',
        )
      }
      const frozen = await queue.loadVerifiedSmartPatchInput(review.id)
      assertCurrent()
      if (
        frozen.item.statusSequence !== review.statusSequence ||
        (frozen.item.status !== 'failed' && frozen.item.status !== 'canceled')
      ) {
        throw new ProjectGenerationActionError(
          'GENERATION_INVALID_REQUEST',
          'The queue item changed. Refresh the queue before retrying.',
        )
      }
      if (frozen.payload.context.documentId !== documentId) {
        throw documentChanged()
      }
      if (
        typeof models.resolveVerifiedGenerationAnimaBundleForPlan !== 'function' ||
        typeof models.resolveVerifiedAnimaGenerationLoraForPlan !== 'function'
      ) {
        throw new ProjectGenerationActionError(
          'GENERATION_MODEL_UNAVAILABLE',
          'The saved Smart Patch resources cannot be verified. The original queue item was kept.',
        )
      }
      let published: QueuedGenerationItem | null = null
      try {
        const admitted = await this.options.runtime.withGenerationAdmission(
          this.options.scratchBasePath,
          async (ready) => {
            assertCurrent()
            if (
              !isQualifiedInferenceWorkerReady(ready) ||
              ready.workerVersion !== '0.14.0' ||
              !ready.capabilities.includes('smart-patch-execution') ||
              !ready.capabilities.includes('smart-patch-seed-confirmation') ||
              (frozen.payload.kind === 'anima-smart-patch' && !supportsInferenceAnima(ready))
            ) {
              throw new ProjectGenerationActionError(
                'GENERATION_RUNTIME_UNAVAILABLE',
                'The current image engine cannot retry this Smart Patch. The original queue item was kept.',
              )
            }
            published = await queue.retryPreparedSmartPatchTerminal!(
              review.id,
              review.statusSequence,
              { assertCurrent, modelService: models as SmartPatchExecutionModelResolver },
            )
            assertCurrent()
            return true
          },
        )
        // Admission includes physical worker exit. A late refusal must cancel its new pending row.
        assertCurrent()
        let canonicalPath: string
        try {
          canonicalPath = await realpath(frozen.item.projectPath)
        } catch {
          throw documentChanged()
        }
        assertCurrent()
        if (canonicalPath !== frozen.item.projectPath) {
          throw documentChanged()
        }
        if (admitted === null) {
          throw new ProjectGenerationActionError(
            'GENERATION_RUNTIME_UNAVAILABLE',
            'The image runtime is unavailable. The original queue item was kept.',
          )
        }
      } catch (error) {
        if (published) {
          await this.cancelPublishedJobs(tabId, [published])
        }
        throw error
      }
    })
  }

  private async retryUnlocked(review: GenerationQueueReview): Promise<void> {
    const source = await this.options.queue.getManagerEntry(review.id)
    if (source.operation === 'illustrious-regional-txt2img') {
      const retry = this.options.orchestrator.retryRegional?.bind(this.options.orchestrator)
      if (!retry || !this.options.regional) {
        throw new ProjectGenerationActionError(
          'GENERATION_RUNTIME_UNAVAILABLE',
          'Regional Retry is unavailable. The original job was kept.',
        )
      }
      this.admittingTabId = source.projectKey
      await this.options.gate.run(source.projectKey, async () => {
        this.assertAdmissionOpen()
        this.assertDocument(source.projectKey, source.documentId)
        const loadFrozen = this.options.queue.loadVerifiedRegionalInput?.bind(this.options.queue)
        if (!loadFrozen) {
          throw new ProjectGenerationActionError(
            'GENERATION_RUNTIME_UNAVAILABLE',
            'The frozen Regional Guidance job cannot be verified. The original job was kept.',
          )
        }
        const frozen = await loadFrozen(review.id)
        this.assertAdmissionOpen()
        this.assertDocument(source.projectKey, source.documentId)
        if (
          frozen.payload.kind !== 'illustrious-regional-txt2img' ||
          frozen.payload.context.documentId !== source.documentId ||
          frozen.item.localProjectKey !== source.projectKey
        ) {
          throw new ProjectGenerationActionError(
            'GENERATION_INVALID_REQUEST',
            'The frozen Regional Guidance identity differs from the reviewed job.',
          )
        }
        let published: QueuedGenerationItem | null = null
        try {
          const admitted = await this.options.runtime.withGenerationAdmission(
            this.options.scratchBasePath,
            async (ready) => {
              this.assertAdmissionOpen()
              this.assertDocument(source.projectKey, source.documentId)
              if (
                !supportsRegional(ready) ||
                ((frozen.payload.workerJob.sampling.scheduler === 'dpmpp_2m' ||
                  frozen.payload.workerJob.sampling.scheduler === 'dpmpp_2m_k') &&
                  !supportsInferenceRegionalDpm(ready)) ||
                ((frozen.payload.workerJob.loras?.length ?? 0) > 0 &&
                  !supportsInferenceRegionalLoras(ready)) ||
                ((frozen.payload.workerJob.vae != null ||
                  (frozen.payload.workerJob.vaePrecision ?? 'Auto') !== 'FP16') &&
                  !supportsInferenceRegionalVae(ready)) ||
                (((frozen.payload.workerJob.embeddings?.positive.length ?? 0) > 0 ||
                  (frozen.payload.workerJob.embeddings?.negative.length ?? 0) > 0) &&
                  !supportsInferenceEmbeddings(ready)) ||
                (frozen.payload.initializationProfile !== undefined &&
                  !supportsInferenceRegionalInvokeInitialization(ready))
              ) {
                throw new ProjectGenerationActionError(
                  'GENERATION_RUNTIME_UNAVAILABLE',
                  'Repair or update the image engine to retry Regional Guidance. The original job was kept.',
                )
              }
              published = await retry(
                source.projectKey,
                review.id,
                review.statusSequence,
                'invoke-canvas-v1',
              )
              this.assertAdmissionOpen()
              return true
            },
          )
          this.assertAdmissionOpen()
          this.assertDocument(source.projectKey, source.documentId)
          if (admitted === null) {
            throw new ProjectGenerationActionError(
              'GENERATION_RUNTIME_UNAVAILABLE',
              'The image runtime is unavailable. The original job was kept.',
            )
          }
        } catch (error) {
          if (published) {
            await this.cancelPublishedJobs(source.projectKey, [published])
          }
          throw error
        }
      })
      return
    }
    if (
      source.operation === 'illustrious-smart-patch' ||
      source.operation === 'anima-smart-patch'
    ) {
      return await this.retrySmartPatchUnlocked(review, source.projectKey, source.documentId)
    }
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
      const payload = frozen.payload
      const euler =
        (payload.kind === 'illustrious-txt2img' ||
          payload.kind === 'illustrious-img2img' ||
          payload.kind === 'illustrious-outpaint') &&
        payload.context.sampling.invokeScheduler === 'euler'
      const requiresNoiseProfile =
        (payload.kind === 'illustrious-txt2img' ||
          payload.kind === 'illustrious-img2img' ||
          payload.kind === 'illustrious-outpaint') &&
        !isDefaultIllustriousNoiseProfile(
          payload.context.sampling.noiseProfile ?? defaultIllustriousNoiseProfile(),
        )
      if (euler || requiresNoiseProfile) {
        const ready = await this.options.runtime.readQualifiedInferenceReady()
        this.assertAdmissionOpen()
        this.assertDocument(tabId, documentId)
        if (requiresNoiseProfile && ready && !supportsInferenceIllustriousNoiseProfile(ready)) {
          throw new IllustriousJobError(
            'INFERENCE_UNAVAILABLE',
            'The active worker has not qualified the checkpoint noise profile. The original queue item was kept.',
          )
        }
        if (euler && ready && !supportsInferenceEuler(ready)) {
          throw new IllustriousJobError(
            'INFERENCE_UNAVAILABLE',
            'The active worker has not qualified ordinary Illustrious Euler.',
          )
        }
      }
      if (isQueuedOutpaint(payload)) {
        const ready = await this.options.runtime.readQualifiedInferenceReady()
        this.assertAdmissionOpen()
        this.assertDocument(tabId, documentId)
        if (
          ready &&
          (!supportsInferenceOutpaint(ready) ||
            (payload.kind === 'anima-outpaint' && !supportsInferenceAnimaOutpaint(ready)))
        ) {
          throw new ProjectGenerationActionError(
            'GENERATION_RUNTIME_UNAVAILABLE',
            'The active image engine has not qualified this outpaint operation. The original queue item and temporary results were kept.',
          )
        }
        if (
          !this.options.infillResolver ||
          typeof this.options.queue.retryPreparedOutpaintTerminal !== 'function'
        ) {
          throw new ProjectGenerationActionError(
            'GENERATION_RUNTIME_UNAVAILABLE',
            'The exact local outpaint infill resource is unavailable. The original queue item and temporary results were kept.',
          )
        }
      }
      let publishedOutpaintRetry: QueuedGenerationItem | null = null
      let admitted: boolean | null
      try {
        admitted = await this.options.runtime.withGenerationAdmission(
          this.options.scratchBasePath,
          async (ready) => {
            this.assertAdmissionOpen()
            this.assertDocument(tabId, documentId)
            if (requiresNoiseProfile && !supportsInferenceIllustriousNoiseProfile(ready)) {
              throw new IllustriousJobError(
                'INFERENCE_UNAVAILABLE',
                'The active worker has not qualified the checkpoint noise profile. The original queue item was kept.',
              )
            }
            if (euler && !supportsInferenceEuler(ready)) {
              throw new IllustriousJobError(
                'INFERENCE_UNAVAILABLE',
                'The active worker has not qualified ordinary Illustrious Euler.',
              )
            }
            const preflight = async (input: GenerationQueueRetryPreflightInput) => {
              this.assertAdmissionOpen()
              this.assertDocument(tabId, documentId)
              await this.options.staging.preflightBatchCapacity({
                entries: [
                  { frozenPayloadJson: input.frozenPayloadJson, queueItemId: input.queueItemId },
                ],
                localProjectKey: tabId,
                projectPath: input.source.projectPath,
                stagingSessionId: input.stagingSessionId,
              })
              this.assertAdmissionOpen()
              this.assertDocument(tabId, documentId)
            }
            const publish = async () => {
              this.assertAdmissionOpen()
              this.assertDocument(tabId, documentId)
              const queued = isQueuedOutpaint(payload)
                ? await this.options.queue.retryPreparedOutpaintTerminal!(
                    review.id,
                    review.statusSequence,
                    {
                      assertCurrent: () => {
                        this.assertAdmissionOpen()
                        this.assertDocument(tabId, documentId)
                      },
                      infillResolver: this.options.infillResolver!,
                      modelService: this.options.models as AnimaGenerationModelResolver &
                        GenerationModelResolver,
                      preflight,
                    },
                  )
                : await this.options.queue.retryTerminal(
                    review.id,
                    review.statusSequence,
                    preflight,
                  )
              if (isQueuedOutpaint(payload)) {
                publishedOutpaintRetry = queued
              }
              try {
                this.assertAdmissionOpen()
                this.assertDocument(tabId, documentId)
              } catch (error) {
                // A late identity/shutdown refusal cannot leave this newly published retry live.
                if (isQueuedOutpaint(payload)) {
                  await this.cancelPublishedJobs(tabId, [queued])
                  publishedOutpaintRetry = null
                } else {
                  await this.cancelQueuedItem(queued.id)
                }
                throw error
              }
            }
            if (isQueuedOutpaint(payload)) {
              if (
                !supportsInferenceOutpaint(ready) ||
                (payload.kind === 'anima-outpaint' && !supportsInferenceAnimaOutpaint(ready))
              ) {
                throw new ProjectGenerationActionError(
                  'GENERATION_RUNTIME_UNAVAILABLE',
                  'The active image engine has not qualified this outpaint operation. The original queue item and temporary results were kept.',
                )
              }
              if (
                payload.kind === 'anima-outpaint' &&
                (typeof this.options.models.resolveVerifiedGenerationAnimaBundleForPlan !==
                  'function' ||
                  typeof this.options.models.resolveVerifiedAnimaGenerationLoraForPlan !==
                    'function')
              ) {
                throw new ProjectGenerationActionError(
                  'GENERATION_MODEL_UNAVAILABLE',
                  'The saved Anima resources cannot be verified. The original queue item was kept.',
                )
              }
              const infill = await this.options.infillResolver!.resolveVerifiedOutpaintInfill()
              this.assertAdmissionOpen()
              this.assertDocument(tabId, documentId)
              const provisionalRoot = path.join(
                path.resolve(this.options.scratchBasePath),
                `outpaint-admission-${randomUUID()}`,
              )
              buildQueuedOutpaintWorkerRequest({
                infill,
                outputPath: path.join(provisionalRoot, 'result.png'),
                payload,
                provisionalRoot,
                ready,
                requestId: randomUUID(),
                targetPath: path.join(provisionalRoot, 'target.png'),
              })
              await publish()
            } else if (payload.kind === 'anima-txt2img' || payload.kind === 'anima-img2img') {
              const { models } = this.options
              const resolveBundle = models.resolveVerifiedGenerationAnimaBundleForPlan
              const resolveLora = models.resolveVerifiedAnimaGenerationLoraForPlan
              if (typeof resolveBundle !== 'function' || typeof resolveLora !== 'function') {
                throw new ProjectGenerationActionError(
                  'GENERATION_MODEL_UNAVAILABLE',
                  'The saved Anima resources cannot be verified. The original queue item was kept.',
                )
              }
              await withQueuedAnimaGenerationRequest({
                modelService: {
                  resolveVerifiedAnimaGenerationLoraForPlan: resolveLora.bind(models),
                  resolveVerifiedGenerationAnimaBundleForPlan: resolveBundle.bind(models),
                },
                payload,
                ready,
                scratchBasePath: this.options.scratchBasePath,
                targetPngBytes: frozen.targetPngBytes,
                use: publish,
              })
            } else if (
              payload.kind === 'illustrious-txt2img' ||
              payload.kind === 'illustrious-img2img'
            ) {
              await withIllustriousGenerationRequest({
                modelService: this.options.models,
                prepared: {
                  context: payload.context,
                  targetPngBytes: frozen.targetPngBytes,
                },
                ready,
                scratchBasePath: this.options.scratchBasePath,
                use: publish,
              })
            } else {
              throw new ProjectGenerationActionError(
                'GENERATION_INVALID_REQUEST',
                'The frozen generation operation is unsupported.',
              )
            }
            return true
          },
        )
        if (admitted === null) {
          throw new ProjectGenerationActionError(
            'GENERATION_RUNTIME_UNAVAILABLE',
            'The image runtime is unavailable. The original queue item and temporary results were kept.',
          )
        }
        if (isQueuedOutpaint(payload)) {
          this.assertAdmissionOpen()
          this.assertDocument(tabId, documentId)
        }
      } catch (error) {
        if (publishedOutpaintRetry) {
          await this.cancelPublishedJobs(tabId, [publishedOutpaintRetry])
        }
        throw error
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
  if (error instanceof ProjectRegionalGenerationError) {
    const codes = {
      CLOSED: 'GENERATION_CLOSED',
      INFERENCE_UNAVAILABLE: 'GENERATION_RUNTIME_UNAVAILABLE',
      INPUT_INVALID: 'GENERATION_INVALID_REQUEST',
      PROJECT_CHANGED: 'GENERATION_DOCUMENT_CHANGED',
      UNSUPPORTED: 'GENERATION_REGIONAL_GUIDANCE_UNSUPPORTED',
    }
    return { code: codes[error.code], message: error.message.slice(0, 512) }
  }
  if (error instanceof InferenceAuxiliaryResourceError) {
    return {
      code: 'GENERATION_RESOURCE_CHANGED',
      message:
        'The exact local LaMa resource is unavailable or changed. Repair the image engine resources before outpaint. Ordinary generation and Save remain available.',
    }
  }
  const rawCode =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'GENERATION_FAILED'
  const knownLiteral =
    error instanceof GenerationBatchPlanError ||
    error instanceof AnimaGenerationBatchError ||
    error instanceof AnimaFlowSamplingPlanError ||
    error instanceof AnimaPromptWeightingError ||
    error instanceof IllustriousJobError ||
    error instanceof AnimaGenerationRequestError ||
    error instanceof AnimaWorkerRequestError
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
    error instanceof RegionalGuidanceGenerationError ||
    error instanceof GenerationPreparationError ||
    error instanceof GenerationBatchPlanError ||
    error instanceof AnimaGenerationBatchError ||
    error instanceof AnimaFlowSamplingPlanError ||
    error instanceof AnimaPromptWeightingError ||
    error instanceof IllustriousJobError ||
    error instanceof AnimaGenerationRequestError ||
    error instanceof AnimaWorkerRequestError ||
    error instanceof AnimaQueuedGenerationError
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
  if (code === 'MODEL_FILE_MISSING' || code === 'MODEL_FILE_CORRUPT') {
    return 'The selected model resource could not be verified for generation. Review it in Model Manager.'
  }
  if (code === 'MODEL_LORA_INCOMPATIBLE') {
    return 'The selected LoRA is incompatible with this image engine. Review this component in Model Manager.'
  }
  if (code === 'MODEL_EMBEDDING_INCOMPATIBLE') {
    return 'The selected embedding is incompatible with this image engine. Review this component in Model Manager.'
  }
  if (code === 'MODEL_VAE_INCOMPATIBLE') {
    return 'The selected external VAE is incompatible with this image engine. Review this component in Model Manager.'
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

/** Preserve each family's complete preparation, including the legacy dynamic embedding pool. */
function isPreparedAnimaGeneration(
  prepared: PreparedAnimaGeneration | PreparedNormalGeneration,
): prepared is PreparedAnimaGeneration {
  return prepared.context.kind === 'anima-generation-preparation'
}

function isPreparedOutpaintGeneration(
  prepared: PreparedAnimaGeneration | PreparedNormalGeneration | PreparedOutpaintGeneration,
): prepared is PreparedOutpaintGeneration {
  return (
    prepared.context.kind === 'normal-outpaint-preparation' ||
    prepared.context.kind === 'anima-outpaint-preparation'
  )
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

function supportsRegional(ready: InferenceWorkerReady | null): boolean {
  return (
    isQualifiedInferenceWorkerReady(ready) &&
    ready.capabilities.includes('illustrious-regional-invoke-v1')
  )
}
