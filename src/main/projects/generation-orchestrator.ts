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
      | 'PROJECT_IDENTITY_CHANGED'
      | 'PROJECT_INDEX_UNAVAILABLE'
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
  private enqueueBarrier: Promise<void> = Promise.resolve()

  constructor(
    private readonly projects: Pick<ProjectService, 'getOpenTabs' | 'prepareNormalTxt2ImgContext'>,
    private readonly projectIndex: Pick<ProjectIndexRepository, 'getProject'>,
    private readonly models: Pick<ModelService, 'resolveVerifiedGenerationCheckpointForPlan'>,
    private readonly queue: GenerationQueueRepository,
    private readonly staging: GenerationStagingRepository,
    private readonly processor: GenerationProcessor,
    private readonly scratchBasePath: string,
  ) {}

  async enqueueOne(
    tabId: string,
    compositionWorker: Pick<ProjectWorkerClient, 'composeTarget'>,
    inferenceWorker: GenerationWorkerTransport,
  ): Promise<QueuedGenerationItem> {
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

  async runNext(inferenceWorker: GenerationWorkerTransport): Promise<GenerationProcessorResult> {
    await this.enqueueBarrier
    // The processor also asserts these gates before claiming. Keep them here to make this
    // orchestrator's dependency on successful startup recovery explicit to future callers.
    this.queue.assertReadyForDispatch()
    this.staging.assertReadyForPublication()
    return await this.processor.runOne(inferenceWorker)
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
    this.assertOpen(tabId)
    const project = await this.indexedProject(tabId)
    const prepared = await this.projects.prepareNormalTxt2ImgContext(
      tabId,
      compositionWorker,
      this.models,
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
        this.assertOpen(tabId)
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
        this.assertOpen(tabId)
        const queued = await this.queue.enqueueIllustriousTxt2Img({
          prepared,
          projectPath: project.canonicalPath,
          request,
          stagingSessionId: randomUUID(),
        })
        try {
          this.assertOpen(tabId)
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
          this.assertOpen(tabId)
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
