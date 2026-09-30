import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'

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

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

interface AcceptanceCancellationScope {
  documentId: string
  expectedJobIds: readonly string[]
  stagingSessionIds: readonly string[]
}

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
  private readonly acceptanceCanceled = new Map<string, AcceptanceCancellationScope>()
  private readonly acceptanceCancelingProjects = new Map<
    string,
    { operation: Promise<void>; scope: AcceptanceCancellationScope }
  >()
  private readonly cancelingProjects = new Map<string, Promise<void>>()
  private readonly cancellationStarted = new Set<string>()
  private readonly completedProjectCloses = new Set<string>()
  private enqueueBarrier: Promise<void> = Promise.resolve()
  private readonly fencedProjects = new Set<string>()

  constructor(
    private readonly projects: Pick<
      ProjectService,
      'getOpenDocumentId' | 'getOpenTabs' | 'prepareNormalTxt2ImgContext'
    >,
    private readonly projectIndex: Pick<ProjectIndexRepository, 'getProject'>,
    private readonly models: Pick<ModelService, 'resolveVerifiedGenerationCheckpointForPlan'>,
    private readonly queue: GenerationQueueRepository,
    private readonly staging: GenerationStagingRepository,
    private readonly processor: GenerationProcessor,
    private readonly scratchBasePath: string,
  ) {}

  /** Cancel only the document/session/job set whose loss was explicitly confirmed for Add. */
  async cancelAcceptanceJobs(
    tabId: string,
    documentId: string,
    stagingSessionIds: readonly string[],
    expectedJobIds: readonly string[],
  ): Promise<void> {
    if (!this.fencedProjects.has(tabId)) {
      throw new GenerationOrchestratorError(
        'PROJECT_NOT_FENCED',
        'Fence Project generation before canceling acceptance jobs.',
      )
    }
    this.assertAcceptanceDocument(tabId, documentId)
    const scope: AcceptanceCancellationScope = {
      documentId,
      expectedJobIds: snapshotAcceptanceIds(expectedJobIds),
      stagingSessionIds: snapshotAcceptanceIds(stagingSessionIds),
    }
    if (this.cancelingProjects.has(tabId) || this.cancellationStarted.has(tabId)) {
      throw new GenerationOrchestratorError(
        'PROJECT_GENERATION_CLOSING',
        'Project generation close has already begun.',
      )
    }
    const active = this.acceptanceCancelingProjects.get(tabId)
    if (active) {
      if (
        !sameAcceptanceScope(active.scope, scope) ||
        !sameIds(active.scope.expectedJobIds, scope.expectedJobIds)
      ) {
        throw cancellationUncertain('Another acceptance cancellation scope is still active.')
      }
      await active.operation
      return
    }
    const unresolved = this.acceptanceCanceled.get(tabId)
    if (unresolved && !sameAcceptanceScope(unresolved, scope)) {
      throw cancellationUncertain('Resolve the previous acceptance cancellation scope first.')
    }
    // Keep this marker on every failure. A later explicit retry must confirm that this scope has
    // stopped before its fence can be released, even after the active operation has rejected.
    this.acceptanceCanceled.set(tabId, scope)
    const operation = (async () => {
      await this.enqueueBarrier
      for (;;) {
        await this.readAcceptanceJobs(tabId, scope)
        // Re-read after the confirmation snapshot and before either mutation or completion.
        // A job that finished naturally may disappear; a new unconfirmed job is never canceled.
        const current = await this.readAcceptanceJobs(tabId, scope)
        if (current.length === 0) {
          this.acceptanceCanceled.delete(tabId)
          return
        }
        await this.processor.cancelAndWait(current[0].id)
      }
    })()
    this.acceptanceCancelingProjects.set(tabId, { operation, scope })
    try {
      await operation
    } finally {
      if (this.acceptanceCancelingProjects.get(tabId)?.operation === operation) {
        this.acceptanceCancelingProjects.delete(tabId)
      }
    }
  }

  /** Cancel only this Project's unfinished rows; running work needs confirmed worker exit. */
  async cancelProjectJobs(tabId: string): Promise<void> {
    if (!this.fencedProjects.has(tabId)) {
      throw new GenerationOrchestratorError(
        'PROJECT_NOT_FENCED',
        'Fence Project generation before canceling its jobs.',
      )
    }
    if (this.acceptanceCancelingProjects.has(tabId)) {
      throw cancellationUncertain('Acceptance cancellation is still waiting for worker exit.')
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
          // A confirmed whole-Project close may resolve a previous acceptance cancellation.
          this.acceptanceCanceled.delete(tabId)
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
      this.acceptanceCancelingProjects.has(tabId) ||
      this.acceptanceCanceled.has(tabId) ||
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
    if (this.acceptanceCancelingProjects.has(tabId) || this.acceptanceCanceled.has(tabId)) {
      throw cancellationUncertain('Acceptance cancellation has not confirmed all worker exits.')
    }
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
      this.acceptanceCancelingProjects.has(tabId) ||
      this.acceptanceCanceled.has(tabId) ||
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

  private assertAcceptanceDocument(tabId: string, documentId: string): void {
    this.assertOpen(tabId)
    if (
      typeof documentId !== 'string' ||
      !UUID_PATTERN.test(documentId) ||
      this.projects.getOpenDocumentId(tabId) !== documentId
    ) {
      throw new GenerationOrchestratorError(
        'PROJECT_DOCUMENT_CHANGED',
        'The open Project document no longer matches the acceptance cancellation.',
      )
    }
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

  private async readAcceptanceJobs(
    tabId: string,
    scope: AcceptanceCancellationScope,
  ): Promise<QueuedGenerationItem[]> {
    this.assertAcceptanceDocument(tabId, scope.documentId)
    const sessions = new Set(scope.stagingSessionIds)
    const expected = new Set(scope.expectedJobIds)
    const scoped = (
      await this.queue.listUnfinishedByProjectDocument(tabId, scope.documentId)
    ).filter((item) => sessions.has(item.stagingSessionId))
    const confirmed = await this.queue.listUnfinishedByIds(scope.expectedJobIds)
    this.assertAcceptanceDocument(tabId, scope.documentId)
    const scopedIds = new Set(scoped.map((item) => item.id))
    if (
      scoped.some((item) => !expected.has(item.id)) ||
      confirmed.some((item) => !scopedIds.has(item.id))
    ) {
      throw cancellationUncertain('The unfinished acceptance jobs changed after confirmation.')
    }
    return scoped
  }
}

function cancellationUncertain(message: string): GenerationOrchestratorError {
  return new GenerationOrchestratorError('CANCELLATION_UNCERTAIN', message)
}

function snapshotAcceptanceIds(ids: readonly string[]): readonly string[] {
  if (!Array.isArray(ids) || ids.length > IGS_SAFETY_CEILINGS.archiveEntries) {
    throw cancellationUncertain('The acceptance cancellation selection is invalid.')
  }
  const snapshot = [...ids]
  if (
    snapshot.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id)) ||
    new Set(snapshot).size !== snapshot.length
  ) {
    throw cancellationUncertain('Acceptance cancellation IDs must be valid and unique.')
  }
  return snapshot.sort()
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function sameAcceptanceScope(
  left: AcceptanceCancellationScope,
  right: AcceptanceCancellationScope,
): boolean {
  return (
    left.documentId === right.documentId && sameIds(left.stagingSessionIds, right.stagingSessionIds)
  )
}
