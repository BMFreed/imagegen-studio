import { randomUUID } from 'node:crypto'

import type { ModelService } from '../models/model-service.js'
import type { GenerationWorkerTransport } from './generation-processor.js'
import type { GenerationProcessorResult } from './generation-processor.js'
import type { GenerationProcessor } from './generation-processor.js'
import type { QueuedGenerationItem } from './generation-queue.js'
import type { GenerationQueueRepository } from './generation-queue.js'
import type { GenerationStagingRepository } from './generation-staging.js'
import type { ProjectIndexRepository } from './project-index.js'
import type { ProjectService } from './project-service.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { withIllustriousTxt2ImgRequest } from './illustrious-txt2img-job.js'
import { canonicalProjectPath, localProjectRecoveryKey } from './project-identity.js'

export class GenerationOrchestratorError extends Error {
  constructor(
    readonly code:
      | 'CANCELLATION_UNCERTAIN'
      | 'PROJECT_DOCUMENT_CHANGED'
      | 'PROJECT_GENERATION_CLOSING'
      | 'PROJECT_IDENTITY_CHANGED'
      | 'PROJECT_INDEX_UNAVAILABLE'
      | 'PROJECT_NOT_FENCED'
      | 'PROJECT_NOT_OPEN',
    message: string,
  ) {
    super(message)
    this.name = 'GenerationOrchestratorError'
  }
}

/**
 * Main-only handoff from one open Project to the durable queue. It deliberately exposes enqueue and
 * dispatch separately: runOne claims the oldest pending job, which need not be the job a concurrent
 * caller just enqueued. The caller owns both worker processes and their shutdown.
 */
export class GenerationOrchestrator {
  private readonly cancelingProjects = new Map<string, Promise<void>>()
  private readonly cancellationStarted = new Set<string>()
  private readonly completedProjectCloses = new Set<string>()
  private enqueueBarrier: Promise<void> = Promise.resolve()
  private readonly fencedProjects = new Set<string>()

  constructor(
    private readonly projects: Pick<ProjectService, 'getOpenTabs' | 'prepareNormalTxt2ImgContext'>,
    private readonly projectIndex: Pick<ProjectIndexRepository, 'getProject'>,
    private readonly models: Pick<ModelService, 'resolveVerifiedGenerationCheckpointForPlan'>,
    private readonly queue: GenerationQueueRepository,
    private readonly staging: GenerationStagingRepository,
    private readonly processor: GenerationProcessor,
    private readonly scratchBasePath: string,
  ) {}

  /** Cancel only this Project's unfinished rows; running work needs confirmed worker exit. */
  async cancelProjectJobs(tabId: string): Promise<void> {
    if (!this.fencedProjects.has(tabId)) {
      throw new GenerationOrchestratorError(
        'PROJECT_NOT_FENCED',
        'Fence Project generation before canceling its jobs.',
      )
    }
    const existing = this.cancelingProjects.get(tabId)
    if (existing) {
      await existing
      return
    }
    this.cancellationStarted.add(tabId)
    const operation = (async () => {
      await this.enqueueBarrier
      for (;;) {
        const unfinished = await this.queue.listUnfinishedByProject(tabId)
        if (unfinished.length === 0) {
          return
        }
        for (const item of unfinished) {
          await this.processor.cancelAndWait(item.id)
        }
      }
    })()
    this.cancelingProjects.set(tabId, operation)
    try {
      await operation
    } finally {
      if (this.cancelingProjects.get(tabId) === operation) {
        this.cancelingProjects.delete(tabId)
      }
    }
  }

  /** Convenience for callers that already obtained close confirmation. */
  async closeProjectGeneration(tabId: string): Promise<void> {
    await this.fenceProjectGeneration(tabId)
    await this.cancelProjectJobs(tabId)
  }

  /** Call only after the document owner has actually detached the closed Project tab. */
  completeProjectGenerationClose(tabId: string): void {
    if (
      !this.fencedProjects.has(tabId) ||
      !this.cancellationStarted.has(tabId) ||
      this.cancelingProjects.has(tabId) ||
      this.projects.getOpenTabs().some((tab) => tab.id === tabId)
    ) {
      throw new GenerationOrchestratorError(
        'PROJECT_GENERATION_CLOSING',
        'The Project document has not completed closing.',
      )
    }
    this.completedProjectCloses.add(tabId)
  }

  async enqueueOne(
    tabId: string,
    compositionWorker: Pick<ProjectWorkerClient, 'composeTarget'>,
    inferenceWorker: GenerationWorkerTransport,
  ): Promise<QueuedGenerationItem> {
    this.assertGenerationOpen(tabId)
    // Keep dispatch behind the post-publication Project check, even if a caller schedules it
    // while durable queue insertion is still waiting on I/O.
    const operation = this.enqueueBarrier.then(
      async () => await this.enqueueOneUnlocked(tabId, compositionWorker, inferenceWorker),
    )
    this.enqueueBarrier = operation.then(
      () => undefined,
      () => undefined,
    )
    return await operation
  }

  /**
   * Fence admission before the first await, then wait for all already-admitted preparations. The
   * caller can inspect queue/staging impact and release this fence if the user declines close.
   */
  async fenceProjectGeneration(tabId: string): Promise<void> {
    this.queue.fenceProject(tabId)
    this.fencedProjects.add(tabId)
    await this.enqueueBarrier
  }

  /** Only valid before destructive Project-close cancellation has begun. */
  releaseProjectGenerationFence(tabId: string): void {
    if (this.cancelingProjects.has(tabId) || this.cancellationStarted.has(tabId)) {
      throw new GenerationOrchestratorError(
        'PROJECT_GENERATION_CLOSING',
        'Project generation close has already begun.',
      )
    }
    this.queue.releaseProjectFence(tabId)
    this.fencedProjects.delete(tabId)
    this.completedProjectCloses.delete(tabId)
  }

  /** A fresh open may admit a new session after the previous close fully committed. */
  reopenProjectGeneration(tabId: string): void {
    this.assertOpen(tabId)
    if (
      this.cancelingProjects.has(tabId) ||
      (this.fencedProjects.has(tabId) && !this.completedProjectCloses.has(tabId))
    ) {
      throw new GenerationOrchestratorError(
        'PROJECT_GENERATION_CLOSING',
        'Project generation close has not committed.',
      )
    }
    // Initial/fresh opens without a prior close have no fence to lift.
    this.queue.releaseProjectFence(tabId)
    this.fencedProjects.delete(tabId)
    this.cancellationStarted.delete(tabId)
    this.completedProjectCloses.delete(tabId)
  }

  async runNext(inferenceWorker: GenerationWorkerTransport): Promise<GenerationProcessorResult> {
    await this.enqueueBarrier
    // The processor also asserts these gates before claiming. Keep them here to make this
    // orchestrator's dependency on successful startup recovery explicit to future callers.
    this.queue.assertReadyForDispatch()
    this.staging.assertReadyForPublication()
    return await this.processor.runOne(inferenceWorker)
  }

  private assertGenerationOpen(tabId: string): void {
    if (this.fencedProjects.has(tabId)) {
      throw new GenerationOrchestratorError(
        'PROJECT_GENERATION_CLOSING',
        'The Project is closing and cannot accept generation jobs.',
      )
    }
    this.assertOpen(tabId)
  }

  private assertOpen(tabId: string): void {
    if (!this.projects.getOpenTabs().some((tab) => tab.id === tabId)) {
      throw new GenerationOrchestratorError(
        'PROJECT_NOT_OPEN',
        'Open the Project before preparing a generation.',
      )
    }
  }

  private async enqueueOneUnlocked(
    tabId: string,
    compositionWorker: Pick<ProjectWorkerClient, 'composeTarget'>,
    inferenceWorker: GenerationWorkerTransport,
  ): Promise<QueuedGenerationItem> {
    // The same instances must have completed startup recovery. A failed recovery blocks new
    // durable input before image composition or a model-file read can begin.
    this.queue.assertReadyForDispatch()
    this.staging.assertReadyForPublication()
    this.assertGenerationOpen(tabId)
    const project = await this.indexedProject(tabId)
    const lastActualSeed = await this.staging.readLastActualSeed(tabId, project.documentId)
    const prepared = await this.projects.prepareNormalTxt2ImgContext(
      tabId,
      compositionWorker,
      this.models,
      undefined,
      lastActualSeed,
    )
    if (project.documentId !== prepared.context.documentId) {
      throw new GenerationOrchestratorError(
        'PROJECT_DOCUMENT_CHANGED',
        'The open Project no longer matches its indexed document.',
      )
    }

    return await withIllustriousTxt2ImgRequest({
      modelService: this.models,
      prepared,
      ready: inferenceWorker.ready,
      scratchBasePath: this.scratchBasePath,
      use: async (request) => {
        // Preparation and request qualification both await workers and file verification. A tab
        // closed or an index reassigned during either step must not enqueue an orphaned job.
        this.assertGenerationOpen(tabId)
        const current = await this.indexedProject(tabId)
        if (
          current.canonicalPath !== project.canonicalPath ||
          current.documentId !== prepared.context.documentId
        ) {
          throw new GenerationOrchestratorError(
            'PROJECT_DOCUMENT_CHANGED',
            'The indexed Project changed while generation was being prepared.',
          )
        }
        this.assertGenerationOpen(tabId)
        const queued = await this.queue.enqueueIllustriousTxt2Img({
          prepared,
          projectPath: project.canonicalPath,
          request,
          stagingSessionId: randomUUID(),
        })
        try {
          this.assertGenerationOpen(tabId)
          const after = await this.indexedProject(tabId)
          if (
            after.canonicalPath !== project.canonicalPath ||
            after.documentId !== prepared.context.documentId
          ) {
            throw new GenerationOrchestratorError(
              'PROJECT_DOCUMENT_CHANGED',
              'The indexed Project changed after generation was queued.',
            )
          }
          this.assertGenerationOpen(tabId)
          return queued
        } catch (error) {
          // The file-first queue entry already exists. Cancel exactly that row before reporting
          // failure; do not delete its durable input or assume an uncertain cancellation worked.
          let canceled: QueuedGenerationItem
          try {
            canceled = await this.processor.cancel(queued.id)
          } catch {
            throw new GenerationOrchestratorError(
              'CANCELLATION_UNCERTAIN',
              'The Project closed after enqueue, and cancellation needs recovery.',
            )
          }
          if (canceled.status !== 'canceled') {
            throw new GenerationOrchestratorError(
              'CANCELLATION_UNCERTAIN',
              'The Project closed after enqueue, but the job has not stopped.',
            )
          }
          throw error
        }
      },
    })
  }

  private async indexedProject(tabId: string): Promise<{
    canonicalPath: string
    documentId: string
  }> {
    const record = await this.projectIndex.getProject(tabId)
    if (!record || record.fileHealth !== 'ready' || !record.documentId) {
      throw new GenerationOrchestratorError(
        'PROJECT_INDEX_UNAVAILABLE',
        'The open Project has no healthy indexed file.',
      )
    }
    const canonicalPath = await canonicalProjectPath(record.canonicalPath)
    if (
      canonicalPath !== record.canonicalPath ||
      record.localProjectKey !== tabId ||
      localProjectRecoveryKey(canonicalPath) !== tabId
    ) {
      throw new GenerationOrchestratorError(
        'PROJECT_IDENTITY_CHANGED',
        'The indexed Project path changed before generation.',
      )
    }
    return { canonicalPath, documentId: record.documentId }
  }
}
