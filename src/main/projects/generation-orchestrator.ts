import { planGenerationBatch } from '../../shared/projects/generation-batch-plan.js'
import type {
  GenerationBatchPlan,
  GenerationBatchPlanInput,
} from '../../shared/projects/generation-batch-plan.js'
import { GENERATION_BATCH_JOB_LIMIT } from '../../shared/projects/generation-batch-policy.js'
import {
  supportsInferenceAnimaOutpaint,
  supportsInferenceOutpaint,
} from '../../shared/projects/inference-worker-capabilities.js'
import {
  IGS_GENERATION_PNG_MAX_BYTES,
  IGS_SAFETY_CEILINGS,
} from '../../shared/projects/project-schema.js'
import { assertRegionalGuidanceGenerationAvailable } from '../../shared/projects/regional-guidance.js'

import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type { OutpaintInfillResolver } from '../runtime/inference-auxiliary-resources.js'
import type { PreparedAnimaGenerationBatch } from './anima-generation-batch.js'
import type { AnimaGenerationModelResolver } from './anima-generation-preparation.js'
import type { GenerationWorkerTransport } from './generation-processor.js'
import type { GenerationProcessorResult } from './generation-processor.js'
import type { GenerationProcessor } from './generation-processor.js'
import type { QueuedGenerationItem, SmartPatchAcceptanceSessionScope } from './generation-queue.js'
import type { GenerationQueueRepository } from './generation-queue.js'
import type { PreparedOutpaintGeneration } from './generation-queue.js'
import type { GenerationStagingRepository } from './generation-staging.js'
import type { GenerationModelResolver } from './illustrious-generation-loras.js'
import type { IllustriousGenerationRequestV1 } from './illustrious-txt2img-job.js'
import type { IllustriousTxt2ImgRequestV1 } from './illustrious-txt2img-job.js'
import type {
  FrozenNormalGenerationPreparationV1,
  PreparedNormalGeneration,
} from './project-generation-preparation.js'
import type { PreparedNormalTxt2Img } from './project-generation-preparation.js'
import type { ProjectIndexRepository } from './project-index.js'
import type { ProjectService } from './project-service.js'
import type { SmartPatchExecutionModelResolver } from './project-smart-patch-execution.js'
import type {
  RegionalGenerationProcessorResult,
  RegionalGenerationTransport,
} from './regional-generation-processor.js'
import type { RegionalWorkerInput } from './regional-worker-request.js'
import type { SmartPatchInputMaterial } from './smart-patch-frozen-input.js'
import type {
  SmartPatchInferenceTransport,
  SmartPatchOutputWorkerOwner,
  SmartPatchProcessorResult,
} from './smart-patch-generation-processor.js'
import type { SmartPatchGenerationStagingRepository } from './smart-patch-generation-staging.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { withAnimaGenerationBatchRequests } from './anima-generation-request.js'
import { buildFrozenQueuedOutpaintV1 } from './generation-queue.js'
import { GENERATION_STAGING_LIMITS } from './generation-staging-limits.js'
import {
  effectiveGenerationEmbeddings,
  type FrozenGenerationEmbeddings,
  reverifyFrozenGenerationEmbeddings,
  workerEmbeddings,
} from './illustrious-generation-embeddings.js'
import {
  frozenLoraFieldsAgree,
  reverifyFrozenGenerationLoras,
} from './illustrious-generation-loras.js'
import { frozenVaeFieldsAgree, reverifyFrozenGenerationVae } from './illustrious-generation-vae.js'
import {
  assertIllustriousTxt2ImgRequestFitsTransport,
  withIllustriousGenerationRequest,
} from './illustrious-txt2img-job.js'
import { buildQueuedOutpaintWorkerRequest } from './outpaint-worker-request.js'
import { canonicalProjectPath, localProjectRecoveryKey } from './project-identity.js'
import { captureSmartPatchModelResolver } from './project-smart-patch-execution.js'
import { RegionalGenerationProcessor } from './regional-generation-processor.js'
import { captureRegionalWorkerInput } from './regional-worker-request.js'
import { SmartPatchGenerationProcessor } from './smart-patch-generation-processor.js'

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

/** Concrete jobs whose caller retains the qualified target lease until enqueue resolves. */
export interface QualifiedGenerationBatchItem {
  prepared: PreparedNormalGeneration
  request: IllustriousGenerationRequestV1
}

export type GenerationPreparedBatchOptions = Pick<
  GenerationBatchPlanInput,
  'iterations' | 'maxPrompts' | 'seedBehavior'
>

export interface PreparedBatchAdmissionResult {
  /** Native captured identity remains verifiable after request-lease cleanup awaits. */
  assertCurrent?: () => Promise<void>
  items: QueuedGenerationItem[]
  plan: GenerationBatchPlan
}

/** Main-only execution handle. Its caller must stop/drain it before Project or runtime close. */
export interface PrivateSmartPatchExecution {
  cancelAndWait: SmartPatchGenerationProcessor['cancelAndWait']
  getProgressSnapshot: SmartPatchGenerationProcessor['getProgressSnapshot']
  onChanged?: SmartPatchGenerationProcessor['onChanged']
  onProgress: SmartPatchGenerationProcessor['onProgress']
  quiesceForProject: SmartPatchGenerationProcessor['quiesceForProject']
  runNext: (worker: SmartPatchInferenceTransport) => Promise<SmartPatchProcessorResult>
  stopAndCancelActive: SmartPatchGenerationProcessor['stopAndCancelActive']
}

/** Explicit Main-only owner; public queue discovery and automatic dispatch remain separate. */
export interface PrivateRegionalExecution {
  cancelAndWait: RegionalGenerationProcessor['cancelAndWait']
  getProgressSnapshot: RegionalGenerationProcessor['getProgressSnapshot']
  onChanged: RegionalGenerationProcessor['onChanged']
  onProgress: RegionalGenerationProcessor['onProgress']
  quiesceForProject: RegionalGenerationProcessor['quiesceForProject']
  runNext: (worker: RegionalGenerationTransport) => Promise<RegionalGenerationProcessorResult>
  stopAndCancelActive: () => Promise<void>
}

export interface SmartPatchAcceptanceCancellationScope extends Omit<
  SmartPatchAcceptanceSessionScope,
  'localProjectKey'
> {
  expectedUnfinishedJobIds: readonly string[]
  /** Main verified these immutable attempts before cancellation; a missing row still needs drain. */
  reviewedJobs?: readonly {
    frozenPayloadSha256: string
    jobId: string
    stagingSessionId: string
  }[]
  tabId: string
}

interface AcceptanceCancellationScope {
  documentId: string
  expectedJobIds: readonly string[]
  stagingSessionIds: readonly string[]
}

export class GenerationOrchestratorError extends Error {
  constructor(
    readonly code:
      | 'CANCELLATION_UNCERTAIN'
      | 'GENERATION_BATCH_INVALID'
      | 'GENERATION_PROMPT_UNSUPPORTED'
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
  private readonly batchCleanupUnconfirmed = new Set<string>()
  private readonly cancelingProjects = new Map<string, Promise<void>>()
  private readonly cancellationStarted = new Set<string>()
  private readonly completedProjectCloses = new Set<string>()
  private enqueueBarrier: Promise<void> = Promise.resolve()
  private readonly fencedProjects = new Set<string>()
  private readonly regionalProcessors = new Set<RegionalGenerationProcessor>()
  private regionalStopping = false
  private readonly smartPatchAcceptanceCanceled = new Map<
    string,
    SmartPatchAcceptanceCancellationScope
  >()
  private readonly smartPatchAcceptanceCanceling = new Map<
    string,
    { operation: Promise<void>; scope: SmartPatchAcceptanceCancellationScope }
  >()
  private readonly smartPatchProcessors = new Set<SmartPatchGenerationProcessor>()

  constructor(
    private readonly projects: Partial<
      Pick<ProjectService, 'assertSmartPatchGenerationAdmission' | 'getOpenDocumentForAcceptance'>
    > &
      Pick<ProjectService, 'getOpenDocumentId' | 'getOpenTabs' | 'prepareNormalGenerationContext'>,
    private readonly projectIndex: Pick<ProjectIndexRepository, 'getProject'>,
    private readonly models: GenerationModelResolver & Partial<AnimaGenerationModelResolver>,
    private readonly queue: GenerationQueueRepository,
    private readonly staging: GenerationStagingRepository,
    private readonly processor: GenerationProcessor,
    private readonly scratchBasePath: string,
    private readonly infillResolver?: OutpaintInfillResolver,
  ) {}

  /** Cancel only the document/session/job set whose loss was explicitly confirmed for Add. */
  async cancelAcceptanceJobs(
    tabId: string,
    documentId: string,
    stagingSessionIds: readonly string[],
    expectedJobIds: readonly string[],
  ): Promise<void> {
    if (
      this.smartPatchAcceptanceCanceled.has(tabId) ||
      this.smartPatchAcceptanceCanceling.has(tabId)
    ) {
      throw cancellationUncertain('Resolve the Smart Patch acceptance cancellation first.')
    }
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

  async cancelFailedRegionalAdmission(tabId: string, id: string): Promise<void> {
    try {
      await this.cancelRegionalQueueItem(id)
      const row = await this.queue.getRegionalQueueItem(id)
      if (row?.status !== 'canceled') {
        throw cancellationUncertain('The refused regional job has not stopped.')
      }
    } catch {
      this.batchCleanupUnconfirmed.add(tabId)
      this.fencedProjects.add(tabId)
      this.queue.fenceProject(tabId)
      throw cancellationUncertain('Regional admission cancellation needs worker/restart recovery.')
    }
  }

  /** Route cancellation by the durable operation discriminator, never by current UI selection. */
  async cancelGenerationJob(id: string): Promise<QueuedGenerationItem> {
    const entry = await this.queue.getManagerEntry(id)
    if (entry.operation === 'illustrious-regional-txt2img') {
      await this.cancelRegionalQueueItem(id)
      return await this.queue.cancel(id)
    }
    if (entry.operation === 'illustrious-smart-patch' || entry.operation === 'anima-smart-patch') {
      await this.cancelSmartPatchQueueItem(id)
      for (const processor of this.smartPatchProcessors) {
        await processor.quiesceForProject({
          localProjectKey: entry.projectKey,
          stagingSessionIds: [entry.stagingSessionId],
        })
      }
      return await this.queue.cancel(id)
    }
    return await this.processor.cancelAndWait(id)
  }

  /** Cancel only this Project's unfinished rows; running work needs confirmed worker exit. */
  async cancelProjectJobs(tabId: string): Promise<void> {
    if (!this.fencedProjects.has(tabId)) {
      throw new GenerationOrchestratorError(
        'PROJECT_NOT_FENCED',
        'Fence Project generation before canceling its jobs.',
      )
    }
    if (
      this.acceptanceCancelingProjects.has(tabId) ||
      this.smartPatchAcceptanceCanceling.has(tabId) ||
      this.smartPatchAcceptanceCanceled.has(tabId)
    ) {
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
          for (const processor of this.smartPatchProcessors) {
            await processor.quiesceForProject({ localProjectKey: tabId })
          }
          for (const processor of this.regionalProcessors) {
            await processor.quiesceForProject({ localProjectKey: tabId })
          }
          // A confirmed whole-Project close may resolve a previous acceptance cancellation.
          this.acceptanceCanceled.delete(tabId)
          this.batchCleanupUnconfirmed.delete(tabId)
          return
        }
        for (const item of unfinished) {
          await ((await this.queue.getRegionalQueueItem(item.id))
            ? this.cancelRegionalQueueItem(item.id)
            : this.cancelGenerationJob(item.id))
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

  /** Main-only exact Smart Patch Add cancellation; ordinary Raster processors never receive it. */
  async cancelSmartPatchAcceptanceJobs(
    input: SmartPatchAcceptanceCancellationScope,
  ): Promise<void> {
    const scope = snapshotSmartPatchAcceptanceCancellationScope(input)
    const tabId = scope.tabId
    if (!this.fencedProjects.has(tabId)) {
      throw new GenerationOrchestratorError(
        'PROJECT_NOT_FENCED',
        'Fence Project generation before canceling Smart Patch acceptance jobs.',
      )
    }
    const owner = this.assertSmartPatchAcceptanceDocument(scope)
    const assertCurrent = () => {
      if (this.assertSmartPatchAcceptanceDocument(scope) !== owner) {
        throw new GenerationOrchestratorError(
          'PROJECT_DOCUMENT_CHANGED',
          'The Smart Patch cancellation document owner changed.',
        )
      }
    }
    if (this.cancelingProjects.has(tabId) || this.cancellationStarted.has(tabId)) {
      throw new GenerationOrchestratorError(
        'PROJECT_GENERATION_CLOSING',
        'Project generation close has already begun.',
      )
    }
    if (this.acceptanceCanceled.has(tabId) || this.acceptanceCancelingProjects.has(tabId)) {
      throw cancellationUncertain('Resolve the Raster acceptance cancellation first.')
    }
    const active = this.smartPatchAcceptanceCanceling.get(tabId)
    if (active) {
      if (!sameSmartPatchAcceptanceScope(active.scope, scope, true)) {
        throw cancellationUncertain('Another Smart Patch cancellation scope is still active.')
      }
      await active.operation
      return
    }
    const unresolved = this.smartPatchAcceptanceCanceled.get(tabId)
    if (unresolved && !sameSmartPatchAcceptanceScope(unresolved, scope, false)) {
      throw cancellationUncertain('Resolve the previous Smart Patch cancellation scope first.')
    }
    this.smartPatchAcceptanceCanceled.set(tabId, scope)
    const operation = (async () => {
      await this.enqueueBarrier
      for (;;) {
        assertCurrent()
        await this.readSmartPatchAcceptanceJobs(scope)
        const current = await this.readSmartPatchAcceptanceJobs(scope)
        assertCurrent()
        if (current.length === 0) {
          for (const processor of this.smartPatchProcessors) {
            await processor.quiesceForProject({
              localProjectKey: tabId,
              stagingSessionIds: scope.stagingSessionIds,
            })
            assertCurrent()
          }
          if ((await this.readSmartPatchAcceptanceJobs(scope)).length !== 0) {
            continue
          }
          assertCurrent()
          this.smartPatchAcceptanceCanceled.delete(tabId)
          return
        }
        await this.cancelSmartPatchQueueItem(current[0].id)
      }
    })()
    this.smartPatchAcceptanceCanceling.set(tabId, { operation, scope })
    try {
      await operation
    } finally {
      if (this.smartPatchAcceptanceCanceling.get(tabId)?.operation === operation) {
        this.smartPatchAcceptanceCanceling.delete(tabId)
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
      this.smartPatchAcceptanceCanceling.has(tabId) ||
      this.smartPatchAcceptanceCanceled.has(tabId) ||
      this.batchCleanupUnconfirmed.has(tabId) ||
      this.projects.getOpenTabs().some((tab) => tab.id === tabId)
    ) {
      throw new GenerationOrchestratorError(
        'PROJECT_GENERATION_CLOSING',
        'The Project document has not completed closing.',
      )
    }
    this.completedProjectCloses.add(tabId)
  }

  /** Register the exact private owner with the same admission and Project-close barriers. */
  createRegionalExecution(compositionProfile?: 'invoke-canvas-v1'): PrivateRegionalExecution {
    if (this.regionalStopping) {
      throw new GenerationOrchestratorError(
        'PROJECT_GENERATION_CLOSING',
        'Regional dispatch is stopping.',
      )
    }
    const processor = new RegionalGenerationProcessor(
      this.queue,
      this.staging,
      this.models,
      compositionProfile,
    )
    this.regionalProcessors.add(processor)
    return {
      cancelAndWait: processor.cancelAndWait.bind(processor),
      getProgressSnapshot: processor.getProgressSnapshot.bind(processor),
      onChanged: processor.onChanged.bind(processor),
      onProgress: processor.onProgress.bind(processor),
      quiesceForProject: processor.quiesceForProject.bind(processor),
      runNext: async (worker) => {
        const captured: RegionalGenerationTransport = {
          close: worker.close.bind(worker),
          executeCurrentCanvasRegional: worker.executeCurrentCanvasRegional.bind(worker),
          ready: structuredClone(worker.ready),
        }
        await this.enqueueBarrier
        this.queue.assertReadyForDispatch()
        this.staging.assertReadyForPublication()
        return await processor.runOne(captured)
      },
      stopAndCancelActive: async () => {
        await processor.stopAndCancelActive()
        this.regionalProcessors.delete(processor)
      },
    }
  }

  /** Dedicated private composition; normal public dispatch and lifecycle remain unchanged. */
  createSmartPatchExecution(
    staging: SmartPatchGenerationStagingRepository,
    outputOwner: SmartPatchOutputWorkerOwner,
  ): PrivateSmartPatchExecution {
    if (
      typeof this.models.resolveVerifiedAnimaGenerationLoraForPlan !== 'function' ||
      typeof this.models.resolveVerifiedGenerationAnimaBundleForPlan !== 'function'
    ) {
      throw new GenerationOrchestratorError(
        'GENERATION_BATCH_INVALID',
        'Private Smart Patch execution requires the complete model resolver.',
      )
    }
    const processor = new SmartPatchGenerationProcessor(
      this.queue,
      staging,
      this.models as SmartPatchExecutionModelResolver,
      this.scratchBasePath,
      outputOwner,
    )
    this.smartPatchProcessors.add(processor)
    return {
      cancelAndWait: processor.cancelAndWait.bind(processor),
      getProgressSnapshot: processor.getProgressSnapshot.bind(processor),
      onChanged: processor.onChanged.bind(processor),
      onProgress: processor.onProgress.bind(processor),
      quiesceForProject: processor.quiesceForProject.bind(processor),
      runNext: async (worker) => {
        const captured: SmartPatchInferenceTransport = {
          close: worker.close.bind(worker),
          executeSmartPatch: worker.executeSmartPatch.bind(worker),
          ready: structuredClone(worker.ready),
        }
        await this.enqueueBarrier
        this.queue.assertReadyForDispatch()
        staging.assertReadyForPublication()
        return await processor.runOne(captured)
      },
      stopAndCancelActive: async () => {
        await processor.stopAndCancelActive()
        this.smartPatchProcessors.delete(processor)
      },
    }
  }

  /** Atomically admit a concrete planned group; prompt expansion and seed scheduling are upstream. */
  async enqueueBatch(
    tabId: string,
    items: readonly QualifiedGenerationBatchItem[],
  ): Promise<QueuedGenerationItem[]> {
    this.assertNewGenerationAllowed(tabId)
    const frozen = snapshotQualifiedBatch(items)
    const operation = this.enqueueBarrier.then(
      async () => await this.enqueueBatchUnlocked(tabId, frozen),
    )
    this.enqueueBarrier = operation.then(
      () => undefined,
      () => undefined,
    )
    return await operation
  }

  async enqueueOne(
    tabId: string,
    compositionWorker: Pick<ProjectWorkerClient, 'composeTarget'>,
    inferenceWorker: GenerationWorkerTransport,
  ): Promise<QueuedGenerationItem> {
    this.assertNewGenerationAllowed(tabId)
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

  /** Admit the complete captured native batch under the same Project/dispatch barrier. */
  async enqueuePreparedAnimaBatch(
    tabId: string,
    prepared: PreparedAnimaGenerationBatch,
    inferenceWorker: Pick<GenerationWorkerTransport, 'ready'>,
    beforePublication?: () => Promise<void>,
  ): Promise<PreparedBatchAdmissionResult> {
    this.assertNewGenerationAllowed(tabId)
    const preparedBatch: PreparedAnimaGenerationBatch = {
      context: structuredClone(prepared.context),
      items: structuredClone(prepared.items),
      iterations: prepared.iterations,
      targetPngBytes: Buffer.from(prepared.targetPngBytes),
      truncated: prepared.truncated,
    }
    const ready = structuredClone(inferenceWorker.ready)
    const operation = this.enqueueBarrier.then(async () => {
      this.queue.assertReadyForDispatch()
      this.staging.assertReadyForPublication()
      this.assertNewGenerationAllowed(tabId)
      const project = await this.indexedProject(tabId)
      const assertDocument = () => {
        this.assertGenerationOpen(tabId)
        if (
          this.projects.getOpenDocumentId(tabId) !== project.documentId ||
          preparedBatch.context.documentId !== project.documentId
        ) {
          throw new GenerationOrchestratorError(
            'PROJECT_DOCUMENT_CHANGED',
            'The captured Anima batch no longer belongs to the open Project document.',
          )
        }
      }
      const assertIdentity = async () => {
        assertDocument()
        const current = await this.indexedProject(tabId)
        assertDocument()
        if (
          current.canonicalPath !== project.canonicalPath ||
          current.documentId !== project.documentId
        ) {
          throw new GenerationOrchestratorError(
            'PROJECT_DOCUMENT_CHANGED',
            'The indexed Project changed while the Anima batch was being prepared.',
          )
        }
      }
      assertDocument()
      const models = this.models
      const resolveBundle = models.resolveVerifiedGenerationAnimaBundleForPlan
      const resolveLora = models.resolveVerifiedAnimaGenerationLoraForPlan
      if (typeof resolveBundle !== 'function' || typeof resolveLora !== 'function') {
        throw new GenerationOrchestratorError(
          'GENERATION_BATCH_INVALID',
          'The exact Anima bundle and adapters cannot be verified.',
        )
      }
      return await withAnimaGenerationBatchRequests({
        modelService: {
          resolveVerifiedAnimaGenerationLoraForPlan: resolveLora.bind(models),
          resolveVerifiedGenerationAnimaBundleForPlan: resolveBundle.bind(models),
        },
        prepared: preparedBatch,
        ready,
        scratchBasePath: this.scratchBasePath,
        use: async (requests) => {
          await assertIdentity()
          await beforePublication?.()
          const stagingSessionId = randomUUID()
          const queued = await this.queue.enqueuePreparedAnimaGenerationBatch({
            beforeCommit: async () => {
              // This callback runs inside the queue's serialized SQL transaction. Reentering
              // either queue reads or the database connection here would deadlock the owner.
              // Tab/close identity is synchronous; index identity is checked after publication,
              // with exact new-batch cancellation on a late refusal.
              assertDocument()
              this.assertNewGenerationAllowed(tabId)
            },
            preflight: async (entries) => {
              await assertIdentity()
              await this.staging.preflightBatchCapacity({
                entries,
                localProjectKey: tabId,
                projectPath: project.canonicalPath,
                stagingSessionId,
              })
              await assertIdentity()
            },
            preparedBatch,
            projectPath: project.canonicalPath,
            requests,
            stagingSessionId,
          })
          try {
            await assertIdentity()
          } catch (error) {
            try {
              for (const item of queued) {
                const stopped = await this.processor.cancelAndWait(item.id)
                if (stopped.status !== 'canceled') {
                  throw cancellationUncertain('A failed Anima batch job has not stopped.')
                }
              }
            } catch {
              this.batchCleanupUnconfirmed.add(tabId)
              this.fencedProjects.add(tabId)
              this.queue.fenceProject(tabId)
              throw cancellationUncertain(
                'The Project changed after Anima batch enqueue, and its cancellation needs recovery.',
              )
            }
            throw error
          }
          return {
            assertCurrent: assertIdentity,
            items: queued,
            plan: { items: preparedBatch.items, truncated: preparedBatch.truncated },
          }
        },
      })
    })
    this.enqueueBarrier = operation.then(
      () => undefined,
      () => undefined,
    )
    return await operation
  }

  /** Plan one already-frozen Project preparation; its caller owns base-seed resolution. */
  async enqueuePreparedBatch(
    tabId: string,
    prepared: PreparedNormalGeneration,
    options: GenerationPreparedBatchOptions,
    inferenceWorker: Pick<GenerationWorkerTransport, 'ready'>,
    beforePublication?: () => Promise<void>,
  ): Promise<PreparedBatchAdmissionResult> {
    this.assertNewGenerationAllowed(tabId)
    if (
      !Buffer.isBuffer(prepared?.targetPngBytes) ||
      prepared.targetPngBytes.length < 1 ||
      prepared.targetPngBytes.length > IGS_GENERATION_PNG_MAX_BYTES
    ) {
      throw new GenerationOrchestratorError(
        'GENERATION_BATCH_INVALID',
        'The frozen batch target is invalid.',
      )
    }
    // Freeze before the admission barrier and before any model verification await. The caller
    // retains its original preparation; the plan can never reread later Project edits.
    const context = structuredClone(prepared.context)
    const embeddingPool = structuredClone(prepared.embeddingPool ?? context.embeddings)
    const targetPngBytes = Buffer.from(prepared.targetPngBytes)
    const plannedOptions = { ...options }
    const ready = {
      ...inferenceWorker.ready,
      capabilities: [...inferenceWorker.ready.capabilities],
    }
    const plan = planGenerationBatch({
      ...plannedOptions,
      baseSeed: context.sampling.seed,
      maxJobs: GENERATION_BATCH_JOB_LIMIT,
      negativePrompt: context.prompts.negative,
      positivePrompt: context.prompts.positive,
    })
    // Current Python/Compel qualification rejects literal braces, even escaped ones. The pure
    // planner preserves them; admission must explicitly refuse that remaining worker limitation.
    if (
      plan.items.some(
        (item) => /[{}]/.test(item.prompts.positive) || /[{}]/.test(item.prompts.negative),
      )
    ) {
      throw new GenerationOrchestratorError(
        'GENERATION_PROMPT_UNSUPPORTED',
        'The active Illustrious pipeline does not support literal brace text yet.',
      )
    }
    const operation = this.enqueueBarrier.then(async () => {
      this.queue.assertReadyForDispatch()
      this.staging.assertReadyForPublication()
      this.assertNewGenerationAllowed(tabId)
      const project = await this.indexedProject(tabId)
      this.requireBatchDocument(tabId, project.documentId, [
        { prepared: { context, targetPngBytes } },
      ])
      const first = plan.items[0]
      const firstContext = variedContext(
        context,
        first.prompts,
        first.seed,
        plannedOptions.seedBehavior,
        embeddingPool,
      )
      return await withIllustriousGenerationRequest({
        modelService: this.models,
        prepared: { context: firstContext, targetPngBytes },
        ready,
        scratchBasePath: this.scratchBasePath,
        use: async (request) => {
          const concrete: QualifiedGenerationBatchItem[] = []
          for (const [index, item] of plan.items.entries()) {
            const jobContext = variedContext(
              context,
              item.prompts,
              item.seed,
              plannedOptions.seedBehavior,
              embeddingPool,
            )
            const job = variedRequest(
              request,
              item.prompts,
              item.seed,
              index === 0 ? request.requestId : randomUUID(),
              jobContext,
            )
            assertIllustriousTxt2ImgRequestFitsTransport(job)
            await this.models.assertNoUnboundGenerationEmbeddings({
              modelFamily: jobContext.model.reference.baseModelFamily,
              negativePrompt: {
                embeddingRefs:
                  jobContext.embeddings?.negative.map((entry) => ({
                    resource: entry.reference,
                    token: entry.token,
                  })) ?? [],
                text: item.prompts.negative,
              },
              positivePrompt: {
                embeddingRefs:
                  jobContext.embeddings?.positive.map((entry) => ({
                    resource: entry.reference,
                    token: entry.token,
                  })) ?? [],
                text: item.prompts.positive,
              },
            })
            concrete.push({ prepared: { context: jobContext, targetPngBytes }, request: job })
          }
          // Replacement is allowed only after the prepared request and every varied envelope
          // qualify, while admission still owns the barrier and before any new queue publication.
          await beforePublication?.()
          return { items: await this.enqueueBatchUnlocked(tabId, concrete), plan }
        },
      })
    })
    this.enqueueBarrier = operation.then(
      () => undefined,
      () => undefined,
    )
    return await operation
  }

  /** Admit explicit alpha outpaint operations under the same capture and dispatch barrier. */
  async enqueuePreparedOutpaintBatch(
    tabId: string,
    prepared: PreparedOutpaintGeneration,
    options: GenerationPreparedBatchOptions,
    inferenceWorker: Pick<GenerationWorkerTransport, 'ready'>,
    beforePublication?: () => Promise<void>,
    assertAdmissionCurrent?: () => void,
  ): Promise<PreparedBatchAdmissionResult> {
    this.assertNewGenerationAllowed(tabId)
    if (
      !Buffer.isBuffer(prepared?.targetPngBytes) ||
      prepared.targetPngBytes.length < 1 ||
      prepared.targetPngBytes.length > IGS_GENERATION_PNG_MAX_BYTES
    ) {
      throw new GenerationOrchestratorError(
        'GENERATION_BATCH_INVALID',
        'The frozen outpaint target is invalid.',
      )
    }
    const context = structuredClone(prepared.context)
    const targetPngBytes = Buffer.from(prepared.targetPngBytes)
    const embeddingPool = structuredClone(
      'embeddingPool' in prepared
        ? (prepared.embeddingPool ?? ('embeddings' in context ? context.embeddings : undefined))
        : undefined,
    )
    const plannedOptions = { ...options }
    const ready = structuredClone(inferenceWorker.ready)
    const anima = context.kind === 'anima-outpaint-preparation'
    if (
      context.kind === 'anima-outpaint-preparation' &&
      (plannedOptions.maxPrompts !== context.dynamic.maxPrompts ||
        plannedOptions.seedBehavior !== context.dynamic.seedBehavior)
    ) {
      throw new GenerationOrchestratorError(
        'GENERATION_BATCH_INVALID',
        'The outpaint batch options differ from the captured Anima settings.',
      )
    }
    if (!supportsInferenceOutpaint(ready) || (anima && !supportsInferenceAnimaOutpaint(ready))) {
      throw new GenerationOrchestratorError(
        'GENERATION_BATCH_INVALID',
        'The active worker has not qualified this outpaint operation.',
      )
    }
    const infillResolver = this.infillResolver
    if (!infillResolver) {
      throw new GenerationOrchestratorError(
        'GENERATION_BATCH_INVALID',
        'The exact local outpaint infill resource is unavailable.',
      )
    }
    if (
      anima &&
      (typeof this.models.resolveVerifiedGenerationAnimaBundleForPlan !== 'function' ||
        typeof this.models.resolveVerifiedAnimaGenerationLoraForPlan !== 'function')
    ) {
      throw new GenerationOrchestratorError(
        'GENERATION_BATCH_INVALID',
        'The exact Anima resources cannot be verified.',
      )
    }
    // The repository resolves only the captured family. Ordinary Illustrious installations do
    // not need Anima resolvers; the Anima branch above proves them before entering that path.
    const models = this.models as AnimaGenerationModelResolver & GenerationModelResolver
    const plan = planGenerationBatch({
      ...plannedOptions,
      baseSeed: context.sampling.seed,
      maxJobs: GENERATION_BATCH_JOB_LIMIT,
      negativePrompt: context.prompts.negative,
      positivePrompt: context.prompts.positive,
    })
    if (
      !anima &&
      plan.items.some(
        (item) => /[{}]/.test(item.prompts.positive) || /[{}]/.test(item.prompts.negative),
      )
    ) {
      throw new GenerationOrchestratorError(
        'GENERATION_PROMPT_UNSUPPORTED',
        'The active Illustrious pipeline does not support literal brace text yet.',
      )
    }
    const concrete: PreparedOutpaintGeneration[] = plan.items.map((item) => {
      if (context.kind === 'anima-outpaint-preparation') {
        const generationDraft = structuredClone(context.generationDraft)
        generationDraft.positivePrompt.text = item.prompts.positive
        generationDraft.negativePrompt.text = item.prompts.negative
        if (generationDraft.seed.policy === 'fixed') {
          generationDraft.seed.value = item.seed
        }
        return {
          context: {
            ...context,
            generationDraft,
            prompts: { ...item.prompts },
            sampling: { ...context.sampling, seed: item.seed },
          },
          targetPngBytes,
        }
      }
      const embeddings =
        context.embeddingRefs && embeddingPool
          ? effectiveGenerationEmbeddings(item.prompts, context.embeddingRefs, embeddingPool)
          : context.embeddings
      return {
        context: {
          ...context,
          ...(embeddings !== undefined ? { embeddings } : {}),
          prompts: { ...item.prompts },
          sampling: {
            ...context.sampling,
            seed: item.seed,
            seedBehavior: plannedOptions.seedBehavior,
          },
        },
        targetPngBytes,
      }
    })
    const operation = this.enqueueBarrier.then(async () => {
      this.queue.assertReadyForDispatch()
      this.staging.assertReadyForPublication()
      this.assertNewGenerationAllowed(tabId)
      const project = await this.indexedProject(tabId)
      const assertDocument = () => {
        this.assertGenerationOpen(tabId)
        assertAdmissionCurrent?.()
        if (
          this.projects.getOpenDocumentId(tabId) !== project.documentId ||
          context.documentId !== project.documentId
        ) {
          throw new GenerationOrchestratorError(
            'PROJECT_DOCUMENT_CHANGED',
            'The captured outpaint batch no longer belongs to the open Project document.',
          )
        }
      }
      const assertIdentity = async () => {
        assertDocument()
        const current = await this.indexedProject(tabId)
        assertDocument()
        if (
          current.canonicalPath !== project.canonicalPath ||
          current.documentId !== project.documentId
        ) {
          throw new GenerationOrchestratorError(
            'PROJECT_DOCUMENT_CHANGED',
            'The indexed Project changed while the outpaint batch was being prepared.',
          )
        }
      }
      assertDocument()
      const infill = await infillResolver.resolveVerifiedOutpaintInfill()
      assertDocument()
      // This detached envelope is qualified without starting inference or publishing scratch.
      // Dispatch later supplies its own disposable paths and independently verifies all files.
      const provisionalRoot = path.join(
        path.resolve(this.scratchBasePath),
        `outpaint-admission-${randomUUID()}`,
      )
      for (const item of concrete) {
        const payload = buildFrozenQueuedOutpaintV1(item, randomUUID())
        buildQueuedOutpaintWorkerRequest({
          infill,
          outputPath: path.join(provisionalRoot, 'result.png'),
          payload,
          provisionalRoot,
          ready,
          requestId: randomUUID(),
          targetPath: path.join(provisionalRoot, 'target.png'),
        })
      }
      await assertIdentity()
      await beforePublication?.()
      assertDocument()
      const stagingSessionId = randomUUID()
      const queued = await this.queue.enqueuePreparedOutpaintBatch({
        assertCurrent: () => {
          assertDocument()
          this.assertNewGenerationAllowed(tabId)
        },
        beforeCommit: assertIdentity,
        infillResolver,
        items: concrete,
        modelService: models,
        preflight: async (entries) => {
          await assertIdentity()
          await this.staging.preflightBatchCapacity({
            entries,
            localProjectKey: tabId,
            projectPath: project.canonicalPath,
            stagingSessionId,
          })
          await assertIdentity()
        },
        projectPath: project.canonicalPath,
        stagingSessionId,
      })
      try {
        await assertIdentity()
      } catch (error) {
        try {
          for (const item of queued) {
            const stopped = await this.processor.cancelAndWait(item.id)
            if (stopped.status !== 'canceled') {
              throw cancellationUncertain('A failed outpaint batch job has not stopped.')
            }
          }
        } catch {
          this.batchCleanupUnconfirmed.add(tabId)
          this.fencedProjects.add(tabId)
          this.queue.fenceProject(tabId)
          throw cancellationUncertain(
            'The Project changed after outpaint batch enqueue, and its cancellation needs recovery.',
          )
        }
        throw error
      }
      return { assertCurrent: assertIdentity, items: queued, plan }
    })
    this.enqueueBarrier = operation.then(
      () => undefined,
      () => undefined,
    )
    return await operation
  }

  /** Consume a genuine Service-produced private job while both capture/request leases are held. */
  async enqueuePreparedRegional(
    tabId: string,
    input: {
      afterPublication?: (item: QueuedGenerationItem, assertCurrent: () => void) => Promise<void>
      assertCurrent: () => void
      beforePublication?: () => Promise<void>
      prepared: PreparedNormalTxt2Img
      regional: Omit<RegionalWorkerInput, 'request'>
      request: IllustriousTxt2ImgRequestV1
    },
  ): Promise<QueuedGenerationItem> {
    const afterPublication = input.afterPublication
    const items = await this.enqueuePreparedRegionalGroup(
      tabId,
      {
        ...(afterPublication
          ? {
              afterPublication: async (
                items: readonly QueuedGenerationItem[],
                assertCurrent: () => void,
              ) => await afterPublication(items[0], assertCurrent),
            }
          : {}),
        assertCurrent: input.assertCurrent,
        beforePublication: input.beforePublication,
        items: [{ prepared: input.prepared, regional: input.regional, request: input.request }],
      },
      false,
    )
    return items[0]
  }

  /** A public static batch adapts Invoke's all-or-none enqueue to our existing admission owner. */
  async enqueuePreparedRegionalBatch(
    tabId: string,
    input: {
      afterPublication?: (
        items: readonly QueuedGenerationItem[],
        assertCurrent: () => void,
      ) => Promise<void>
      assertCurrent: () => void
      beforePublication?: () => Promise<void>
      items: readonly {
        prepared: PreparedNormalTxt2Img
        regional: Omit<RegionalWorkerInput, 'request'>
        request: IllustriousTxt2ImgRequestV1
      }[]
    },
  ): Promise<QueuedGenerationItem[]> {
    return await this.enqueuePreparedRegionalGroup(tabId, input, true)
  }

  /** Private durable admission only. Smart Patch execution remains outside the normal dispatcher. */
  async enqueuePreparedSmartPatchBatch(
    tabId: string,
    material: SmartPatchInputMaterial,
  ): Promise<QueuedGenerationItem[]> {
    this.assertNewGenerationAllowed(tabId)
    const assertAdmission = this.projects.assertSmartPatchGenerationAdmission?.bind(this.projects)
    if (!assertAdmission) {
      throw new GenerationOrchestratorError(
        'GENERATION_BATCH_INVALID',
        'The current Smart Patch owner cannot be checked.',
      )
    }
    const snapshot: SmartPatchInputMaterial = {
      files: Object.fromEntries(
        Object.entries(material.files).map(([name, bytes]) => [name, Buffer.from(bytes)]),
      ),
      manifest: structuredClone(material.manifest),
    }
    const models = captureSmartPatchModelResolver(this.models as SmartPatchExecutionModelResolver)
    const context = snapshot.manifest.context
    let regionalAdmissionComplete = false
    const assertCurrent = (): void => {
      this.assertGenerationOpen(tabId)
      if (!regionalAdmissionComplete) {
        this.assertNewGenerationAllowed(tabId)
      }
      if (
        context.projectKey !== tabId ||
        this.projects.getOpenDocumentId(tabId) !== context.documentId
      ) {
        throw new GenerationOrchestratorError(
          'PROJECT_DOCUMENT_CHANGED',
          'The captured Smart Patch no longer belongs to the open Project.',
        )
      }
      assertAdmission(tabId, context.documentId, context.layerId)
    }
    assertCurrent()
    const operation = this.enqueueBarrier.then(async () => {
      this.queue.assertReadyForDispatch()
      assertCurrent()
      const project = await this.indexedProject(tabId)
      const assertIdentity = async (): Promise<void> => {
        assertCurrent()
        const current = await this.indexedProject(tabId)
        assertCurrent()
        if (
          current.canonicalPath !== project.canonicalPath ||
          current.documentId !== context.documentId
        ) {
          throw new GenerationOrchestratorError(
            'PROJECT_DOCUMENT_CHANGED',
            'The indexed Project changed while the Smart Patch batch was being queued.',
          )
        }
      }
      await assertIdentity()
      const queued = await this.queue.enqueuePreparedSmartPatchBatch({
        assertCurrent,
        material: snapshot,
        modelService: models,
        projectPath: project.canonicalPath,
        stagingSessionId: randomUUID(),
      })
      regionalAdmissionComplete = true
      try {
        await assertIdentity()
      } catch (error) {
        try {
          for (const item of queued) {
            const stopped = await this.cancelGenerationJob(item.id)
            if (stopped.status !== 'canceled') {
              throw cancellationUncertain('A refused Smart Patch batch job has not stopped.')
            }
          }
        } catch {
          this.batchCleanupUnconfirmed.add(tabId)
          this.fencedProjects.add(tabId)
          this.queue.fenceProject(tabId)
          throw cancellationUncertain('The Smart Patch batch cancellation needs recovery.')
        }
        throw error
      }
      return queued
    })
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

  /** Advisory metadata preflight; the later verified queue claim remains the dispatch authority. */
  async hasDispatchablePending(): Promise<boolean> {
    await this.enqueueBarrier
    this.queue.assertReadyForDispatch()
    this.staging.assertReadyForPublication()
    return await this.queue.hasDispatchablePending()
  }

  async nextDispatchableKind(): Promise<'normal' | 'regional' | 'smart-patch' | null> {
    await this.enqueueBarrier
    return await this.queue.nextDispatchableKind()
  }

  async quiesceSmartPatchForProject(
    tabId: string,
    stagingSessionIds?: readonly string[],
  ): Promise<void> {
    for (const processor of this.smartPatchProcessors) {
      await processor.quiesceForProject({ localProjectKey: tabId, stagingSessionIds })
    }
  }

  /** Frozen Retry reads no current prompts, regions, masks, model choices or seed settings. */
  async readRegionalOperationalSeed(tabId: string, documentId: string): Promise<number | null> {
    this.assertGenerationOpen(tabId)
    if (this.regionalStopping) {
      throw new GenerationOrchestratorError(
        'PROJECT_GENERATION_CLOSING',
        'Regional dispatch is stopping.',
      )
    }
    return await this.staging.readLastActualSeed(tabId, documentId)
  }

  /** Only valid before destructive Project-close cancellation has begun. */
  releaseProjectGenerationFence(tabId: string): void {
    if (this.batchCleanupUnconfirmed.has(tabId)) {
      throw cancellationUncertain(
        'The failed batch has not confirmed cancellation. Close the Project or restart to recover.',
      )
    }
    if (
      this.acceptanceCancelingProjects.has(tabId) ||
      this.acceptanceCanceled.has(tabId) ||
      this.smartPatchAcceptanceCanceling.has(tabId) ||
      this.smartPatchAcceptanceCanceled.has(tabId)
    ) {
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
      this.smartPatchAcceptanceCanceling.has(tabId) ||
      this.smartPatchAcceptanceCanceled.has(tabId) ||
      this.batchCleanupUnconfirmed.has(tabId) ||
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

  /** Frozen Retry reads no current prompts, regions, masks, model choices or seed settings. */
  async retryRegional(
    tabId: string,
    id: string,
    expectedStatusSequence: number,
    compositionProfile?: 'invoke-canvas-v1',
  ): Promise<QueuedGenerationItem> {
    this.assertGenerationOpen(tabId)
    const owner = this.projects.getOpenDocumentForAcceptance?.(tabId)
    if (!owner) {
      throw new GenerationOrchestratorError('PROJECT_NOT_OPEN', 'Open the Project before Retry.')
    }
    const documentId = owner.document.documentId
    const assertCurrent = () => {
      this.assertGenerationOpen(tabId)
      if (this.regionalStopping) {
        throw new GenerationOrchestratorError(
          'PROJECT_GENERATION_CLOSING',
          'Regional dispatch is stopping.',
        )
      }
      if (
        this.projects.getOpenDocumentForAcceptance?.(tabId) !== owner ||
        owner.document.documentId !== documentId
      ) {
        throw new GenerationOrchestratorError(
          'PROJECT_DOCUMENT_CHANGED',
          'The Retry Project owner changed.',
        )
      }
    }
    const operation = this.enqueueBarrier.then(async () => {
      assertCurrent()
      const source = await this.queue.getRegionalQueueItem(id)
      if (!source || source.localProjectKey !== tabId) {
        throw new GenerationOrchestratorError(
          'PROJECT_IDENTITY_CHANGED',
          'The Retry belongs to another Project.',
        )
      }
      const frozen = await this.queue.loadVerifiedRegionalInput(id)
      const project = await this.indexedProject(tabId)
      assertCurrent()
      if (
        project.documentId !== documentId ||
        frozen.payload.context.documentId !== documentId ||
        source.projectPath !== project.canonicalPath
      ) {
        throw new GenerationOrchestratorError(
          'PROJECT_DOCUMENT_CHANGED',
          'The frozen Retry belongs to another document.',
        )
      }
      const retry =
        compositionProfile === 'invoke-canvas-v1'
          ? this.queue.retryInvokeCanvasRegionalTerminal.bind(this.queue)
          : this.queue.retryCurrentCanvasRegionalTerminal.bind(this.queue)
      if (compositionProfile === 'invoke-canvas-v1' && workerEmbeddings(frozen.payload.context)) {
        await reverifyFrozenGenerationEmbeddings(frozen.payload.context, this.models)
        assertCurrent()
      }
      if (compositionProfile === 'invoke-canvas-v1') {
        await reverifyFrozenGenerationLoras(frozen.payload.context, this.models)
        assertCurrent()
        await reverifyFrozenGenerationVae(frozen.payload.context, this.models)
        assertCurrent()
      }
      const retried = await retry(id, expectedStatusSequence, async (input) => {
        assertCurrent()
        await this.staging.preflightRegionalBatchCapacity({
          entries: [{ frozenPayloadJson: input.frozenPayloadJson, queueItemId: input.queueItemId }],
          localProjectKey: tabId,
          projectPath: project.canonicalPath,
          stagingSessionId: input.stagingSessionId,
        })
        assertCurrent()
      })
      try {
        assertCurrent()
        const after = await this.indexedProject(tabId)
        assertCurrent()
        if (after.canonicalPath !== project.canonicalPath || after.documentId !== documentId) {
          throw new GenerationOrchestratorError(
            'PROJECT_IDENTITY_CHANGED',
            'The Retry Project changed after enqueue.',
          )
        }
        return retried
      } catch (error) {
        await this.cancelFailedRegionalAdmission(tabId, retried.id)
        throw error
      }
    })
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

  /** App shutdown drains private owners too, without adding them to public dispatch routing. */
  async stopRegionalExecutions(): Promise<void> {
    this.regionalStopping = true
    const processors = [...this.regionalProcessors]
    const results = await Promise.allSettled(
      processors.map(async (processor) => {
        await processor.stopAndCancelActive()
        this.regionalProcessors.delete(processor)
      }),
    )
    const failed = results.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') {
      throw failed.reason
    }
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

  /** New admissions only. Existing frozen work remains valid after later regional edits. */
  private assertNewGenerationAllowed(tabId: string): void {
    this.assertGenerationOpen(tabId)
    const owner = this.projects.getOpenDocumentForAcceptance?.(tabId)
    const document = owner?.document ?? this.projects.getOpenTabs().find((tab) => tab.id === tabId)
    if (!document) {
      throw new GenerationOrchestratorError(
        'PROJECT_NOT_OPEN',
        'Open the Project before preparing a generation.',
      )
    }
    // Both sources are Main-owned current projections; this check performs no SQL/queue I/O.
    assertRegionalGuidanceGenerationAvailable(document)
  }

  private assertOpen(tabId: string): void {
    if (!this.projects.getOpenTabs().some((tab) => tab.id === tabId)) {
      throw new GenerationOrchestratorError(
        'PROJECT_NOT_OPEN',
        'Open the Project before preparing a generation.',
      )
    }
  }

  private assertSmartPatchAcceptanceDocument(scope: SmartPatchAcceptanceCancellationScope) {
    this.assertAcceptanceDocument(scope.tabId, scope.documentId)
    const owner = this.projects.getOpenDocumentForAcceptance?.(scope.tabId)
    if (
      !owner ||
      owner.filePath !== scope.projectPath ||
      owner.document.documentId !== scope.documentId ||
      localProjectRecoveryKey(owner.filePath) !== scope.tabId
    ) {
      throw new GenerationOrchestratorError(
        'PROJECT_DOCUMENT_CHANGED',
        'The exact open Smart Patch cancellation document/path is unavailable.',
      )
    }
    return owner
  }

  private async cancelRegionalQueueItem(id: string): Promise<void> {
    for (const processor of this.regionalProcessors) {
      if (await processor.cancelOwnedAndWait(id)) {
        return
      }
    }
    const settled = await this.queue.cancel(id)
    if (settled.status === 'running') {
      throw cancellationUncertain('The regional job has no confirmed registered local owner.')
    }
  }

  private async cancelSmartPatchQueueItem(id: string): Promise<void> {
    const requested = await this.queue.cancel(id)
    if (requested.status !== 'running') {
      return
    }
    for (const processor of this.smartPatchProcessors) {
      if (await processor.cancelOwnedAndWait(id)) {
        return
      }
    }
    const settled = await this.queue.cancel(id)
    if (settled.status === 'running') {
      throw cancellationUncertain(
        'The running Smart Patch has no confirmed registered local owner.',
      )
    }
  }

  private async enqueueBatchUnlocked(
    tabId: string,
    items: readonly QualifiedGenerationBatchItem[],
  ): Promise<QueuedGenerationItem[]> {
    this.queue.assertReadyForDispatch()
    this.staging.assertReadyForPublication()
    this.assertNewGenerationAllowed(tabId)
    const project = await this.indexedProject(tabId)
    this.requireBatchDocument(tabId, project.documentId, items)
    const model = items[0].prepared.context.model
    const verified = await this.models.resolveVerifiedGenerationCheckpointForPlan(model.reference)
    if (
      verified.managedPath !== model.managedPath ||
      verified.reference.fileSha256 !== model.reference.fileSha256 ||
      verified.reference.predictionType !== model.reference.predictionType
    ) {
      throw new GenerationOrchestratorError(
        'GENERATION_BATCH_INVALID',
        'The exact checkpoint changed after the batch was qualified. Prepare it again.',
      )
    }
    await reverifyFrozenGenerationLoras(items[0].prepared.context, this.models)
    await reverifyFrozenGenerationVae(items[0].prepared.context, this.models)
    for (const item of items) {
      await reverifyFrozenGenerationEmbeddings(item.prepared.context, this.models)
    }
    this.assertGenerationOpen(tabId)
    const before = await this.indexedProject(tabId)
    this.requireBatchDocument(tabId, project.documentId, items)
    if (
      before.canonicalPath !== project.canonicalPath ||
      before.documentId !== project.documentId
    ) {
      throw new GenerationOrchestratorError(
        'PROJECT_DOCUMENT_CHANGED',
        'The indexed Project changed while the batch was being prepared.',
      )
    }
    const stagingSessionId = randomUUID()
    const queued = await this.queue.enqueueIllustriousGenerationBatch({
      assertCurrent: () => {
        this.requireBatchDocument(tabId, project.documentId, items)
        this.assertNewGenerationAllowed(tabId)
      },
      items,
      preflight: async (entries) => {
        this.assertGenerationOpen(tabId)
        this.requireBatchDocument(tabId, project.documentId, items)
        await this.staging.preflightBatchCapacity({
          entries,
          localProjectKey: tabId,
          projectPath: project.canonicalPath,
          stagingSessionId,
        })
        this.assertGenerationOpen(tabId)
        this.requireBatchDocument(tabId, project.documentId, items)
      },
      projectPath: project.canonicalPath,
      stagingSessionId,
    })
    try {
      this.assertGenerationOpen(tabId)
      const after = await this.indexedProject(tabId)
      this.requireBatchDocument(tabId, project.documentId, items)
      if (
        after.canonicalPath !== project.canonicalPath ||
        after.documentId !== project.documentId
      ) {
        throw new GenerationOrchestratorError(
          'PROJECT_DOCUMENT_CHANGED',
          'The indexed Project changed after the batch was queued.',
        )
      }
      this.assertGenerationOpen(tabId)
      return queued
    } catch (error) {
      // Own dispatch waits for this admission barrier. Cancel exactly the newly committed group;
      // if a worker exit cannot be proved, a later fence release must not admit replacement work.
      try {
        for (const item of queued) {
          const stopped = await this.processor.cancelAndWait(item.id)
          if (stopped.status !== 'canceled') {
            throw cancellationUncertain('A failed batch job has not stopped.')
          }
        }
      } catch {
        this.batchCleanupUnconfirmed.add(tabId)
        this.fencedProjects.add(tabId)
        this.queue.fenceProject(tabId)
        throw cancellationUncertain(
          'The Project changed after batch enqueue, and its cancellation needs recovery.',
        )
      }
      throw error
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
    this.assertNewGenerationAllowed(tabId)
    const project = await this.indexedProject(tabId)
    const lastActualSeed = await this.staging.readLastActualSeed(tabId, project.documentId)
    const prepared = await this.projects.prepareNormalGenerationContext(
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

    return await withIllustriousGenerationRequest({
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
        const queued = await this.queue.enqueueIllustriousGeneration({
          assertCurrent: () => {
            this.assertNewGenerationAllowed(tabId)
            if (this.projects.getOpenDocumentId(tabId) !== prepared.context.documentId) {
              throw new GenerationOrchestratorError(
                'PROJECT_DOCUMENT_CHANGED',
                'The prepared Project changed before queue publication.',
              )
            }
          },
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

  private async enqueuePreparedRegionalGroup(
    tabId: string,
    input: {
      afterPublication?: (
        items: readonly QueuedGenerationItem[],
        assertCurrent: () => void,
      ) => Promise<void>
      assertCurrent: () => void
      beforePublication?: () => Promise<void>
      items: readonly {
        prepared: PreparedNormalTxt2Img
        regional: Omit<RegionalWorkerInput, 'request'>
        request: IllustriousTxt2ImgRequestV1
      }[]
    },
    publicBatch: boolean,
  ): Promise<QueuedGenerationItem[]> {
    this.assertGenerationOpen(tabId)
    if (
      typeof input.assertCurrent !== 'function' ||
      !Array.isArray(input.items) ||
      input.items.length < 1 ||
      input.items.length > (publicBatch ? GENERATION_BATCH_JOB_LIMIT : 1) ||
      !Buffer.isBuffer(input.items[0]?.prepared?.targetPngBytes)
    ) {
      throw new GenerationOrchestratorError(
        'GENERATION_BATCH_INVALID',
        'The regional batch owner or count is invalid.',
      )
    }
    const assertCaptured = input.assertCurrent
    const afterPublication = input.afterPublication
    const beforePublication = input.beforePublication
    const targetPngBytes = Buffer.from(input.items[0].prepared.targetPngBytes)
    const items = input.items.map((item) => {
      if (
        !Buffer.isBuffer(item.prepared.targetPngBytes) ||
        !item.prepared.targetPngBytes.equals(targetPngBytes)
      ) {
        throw new GenerationOrchestratorError(
          'GENERATION_BATCH_INVALID',
          'The regional batch target differs.',
        )
      }
      const captured = captureRegionalWorkerInput({ ...item.regional, request: item.request })
      if (!frozenLoraFieldsAgree(item.prepared.context, captured.request.job.loras)) {
        throw new GenerationOrchestratorError(
          'GENERATION_BATCH_INVALID',
          'The regional LoRA stack differs from its prepared context.',
        )
      }
      if (
        captured.compositionProfile === 'invoke-canvas-v1' &&
        (!frozenVaeFieldsAgree(item.prepared.context, captured.request.job.vae) ||
          item.prepared.context.vaePrecision !== captured.request.job.vaePrecision)
      ) {
        throw new GenerationOrchestratorError(
          'GENERATION_BATCH_INVALID',
          'The regional VAE or precision differs from its prepared context.',
        )
      }
      if (publicBatch && captured.compositionProfile !== 'invoke-canvas-v1') {
        throw new GenerationOrchestratorError(
          'GENERATION_BATCH_INVALID',
          'Regional batches require public Invoke composition.',
        )
      }
      const { request, ...regional } = captured
      return {
        prepared: { context: structuredClone(item.prepared.context), targetPngBytes },
        regional,
        request,
      }
    })
    const prepared = items[0].prepared
    const assertCurrent = () => {
      this.assertGenerationOpen(tabId)
      if (this.regionalStopping) {
        throw new GenerationOrchestratorError(
          'PROJECT_GENERATION_CLOSING',
          'Regional dispatch is stopping.',
        )
      }
      this.requireBatchDocument(tabId, prepared.context.documentId, items)
      assertCaptured()
    }
    assertCurrent()
    const operation = this.enqueueBarrier.then(async () => {
      this.queue.assertReadyForDispatch()
      this.staging.assertReadyForPublication()
      assertCurrent()
      const project = await this.indexedProject(tabId)
      assertCurrent()
      if (project.documentId !== prepared.context.documentId) {
        throw new GenerationOrchestratorError(
          'PROJECT_DOCUMENT_CHANGED',
          'The indexed Project changed.',
        )
      }
      const verified = await this.models.resolveVerifiedGenerationCheckpointForPlan(
        structuredClone(prepared.context.model.reference),
      )
      if (
        verified.managedPath !== prepared.context.model.managedPath ||
        verified.reference.fileSha256 !== prepared.context.model.reference.fileSha256 ||
        verified.reference.predictionType !== prepared.context.model.reference.predictionType ||
        !isDeepStrictEqual(verified.noiseProfile, prepared.context.sampling.noiseProfile)
      ) {
        throw new GenerationOrchestratorError(
          'GENERATION_BATCH_INVALID',
          'The exact checkpoint policy changed.',
        )
      }
      assertCurrent()
      const stagingSessionId = randomUUID()
      await beforePublication?.()
      assertCurrent()
      for (const item of items) {
        if (item.regional.compositionProfile === 'invoke-canvas-v1') {
          await reverifyFrozenGenerationLoras(item.prepared.context, this.models)
          assertCurrent()
          await reverifyFrozenGenerationVae(item.prepared.context, this.models)
          assertCurrent()
        }
      }
      const admission = {
        assertCurrent,
        preflight: async (
          entries: readonly { frozenPayloadJson: string; queueItemId: string }[],
        ) => {
          assertCurrent()
          await this.staging.preflightRegionalBatchCapacity({
            entries,
            localProjectKey: tabId,
            projectPath: project.canonicalPath,
            stagingSessionId,
          })
          assertCurrent()
        },
        projectPath: project.canonicalPath,
        stagingSessionId,
      }
      const first = items[0]
      const queued = publicBatch
        ? await this.queue.enqueueInvokeCanvasRegionalBatch({ ...admission, items })
        : [
            await (first.regional.compositionProfile === 'invoke-canvas-v1'
              ? this.queue.enqueueInvokeCanvasRegional({ ...admission, ...first })
              : this.queue.enqueueCurrentCanvasRegional({ ...admission, ...first })),
          ]
      try {
        assertCurrent()
        const after = await this.indexedProject(tabId)
        assertCurrent()
        if (
          after.canonicalPath !== project.canonicalPath ||
          after.documentId !== project.documentId
        ) {
          throw new GenerationOrchestratorError(
            'PROJECT_IDENTITY_CHANGED',
            'The indexed Project changed after enqueue.',
          )
        }
        await afterPublication?.(queued, assertCurrent)
        assertCurrent()
        return queued
      } catch (error) {
        const cleanupErrors: unknown[] = []
        for (const item of queued) {
          try {
            await this.cancelFailedRegionalAdmission(tabId, item.id)
          } catch (cleanupError) {
            cleanupErrors.push(cleanupError)
          }
        }
        if (cleanupErrors.length > 0) {
          throw cleanupErrors[0]
        }
        throw error
      }
    })
    this.enqueueBarrier = operation.then(
      () => undefined,
      () => undefined,
    )
    return await operation
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

  private async readSmartPatchAcceptanceJobs(scope: SmartPatchAcceptanceCancellationScope) {
    const drainedMissingJobs = new Set<string>()
    const reviewedJobs = new Map((scope.reviewedJobs ?? []).map((job) => [job.jobId, job]))
    for (;;) {
      this.assertSmartPatchAcceptanceDocument(scope)
      // This checks every retained row and receipt, including completed-but-publishing work.
      // A frozen job witness never replaces the independent completed-candidate receipt proof.
      const current = await this.queue.listSmartPatchAcceptanceSessionJobs({
        ...scope,
        localProjectKey: scope.tabId,
      })
      const currentIds = new Set(current.map(({ id }) => id))
      const expected = new Set(scope.expectedUnfinishedJobIds)
      const confirmed = await this.queue.listUnfinishedByIds(scope.expectedUnfinishedJobIds)
      if (
        current.some(({ id }) => !expected.has(id)) ||
        confirmed.some(({ id }) => !currentIds.has(id))
      ) {
        throw cancellationUncertain('The exact Smart Patch sibling job set changed after review.')
      }
      const missingJobs: NonNullable<
        SmartPatchAcceptanceCancellationScope['reviewedJobs']
      >[number][] = []
      for (const id of scope.expectedUnfinishedJobIds) {
        const reviewedJob = reviewedJobs.get(id)
        try {
          const item = await this.queue.getManagerEntry(id)
          if (
            !['anima-smart-patch', 'illustrious-smart-patch'].includes(item.operation) ||
            item.projectKey !== scope.tabId ||
            item.documentId !== scope.documentId ||
            !scope.stagingSessionIds.includes(item.stagingSessionId) ||
            (reviewedJob && item.stagingSessionId !== reviewedJob.stagingSessionId)
          ) {
            throw cancellationUncertain(
              'A reviewed sibling belongs to a different generation owner.',
            )
          }
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !('code' in error) ||
            error.code !== 'QUEUE_ITEM_NOT_FOUND'
          ) {
            throw error
          }
          if (scope.verifiedCandidates.some((candidate) => candidate.candidateId === id)) {
            // The session helper already verified this naturally completed/pruned receipt.
            continue
          }
          if (!reviewedJob) {
            throw error
          }
          if (!drainedMissingJobs.has(id)) {
            missingJobs.push(reviewedJob)
          }
        }
      }
      this.assertSmartPatchAcceptanceDocument(scope)
      if (missingJobs.length === 0) {
        return current
      }
      // Queue Manager can remove a canceled row before our next metadata read. Qualify only
      // witnessed sessions and confirm physical claim/publication exit before accepting absence.
      // A missing row alone is never cancellation acknowledgement or cleanup permission.
      for (const session of new Set(missingJobs.map((job) => job.stagingSessionId))) {
        await this.quiesceSmartPatchForProject(scope.tabId, [session])
        this.assertSmartPatchAcceptanceDocument(scope)
      }
      for (const job of missingJobs) {
        drainedMissingJobs.add(job.jobId)
      }
      // Recheck all rows/receipts after the physical boundary. The loop can admit each reviewed
      // missing ID only once; newly missing IDs require their own scoped drain.
    }
  }

  private requireBatchDocument(
    tabId: string,
    documentId: string,
    items: readonly Pick<QualifiedGenerationBatchItem, 'prepared'>[],
  ): void {
    if (
      this.projects.getOpenDocumentId(tabId) !== documentId ||
      items.some((item) => item.prepared.context.documentId !== documentId)
    ) {
      throw new GenerationOrchestratorError(
        'PROJECT_DOCUMENT_CHANGED',
        'The prepared batch does not belong to the currently open Project document.',
      )
    }
  }
}

/** Copy one common image and every metadata object before entering the asynchronous barrier. */
function snapshotQualifiedBatch(
  items: readonly QualifiedGenerationBatchItem[],
): QualifiedGenerationBatchItem[] {
  const source = items?.[0]?.prepared?.targetPngBytes
  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > GENERATION_STAGING_LIMITS.candidates ||
    !Buffer.isBuffer(source) ||
    source.length < 1 ||
    source.length > IGS_GENERATION_PNG_MAX_BYTES
  ) {
    throw new GenerationOrchestratorError(
      'GENERATION_BATCH_INVALID',
      'The prepared batch is invalid or exceeds recovery capacity.',
    )
  }
  const targetPngBytes = Buffer.from(source)
  return items.map((item) => {
    if (
      !Buffer.isBuffer(item?.prepared?.targetPngBytes) ||
      !item.prepared.targetPngBytes.equals(targetPngBytes)
    ) {
      throw new GenerationOrchestratorError(
        'GENERATION_BATCH_INVALID',
        'All batch jobs must share one frozen target.',
      )
    }
    return {
      prepared: { context: structuredClone(item.prepared.context), targetPngBytes },
      request: structuredClone(item.request),
    }
  })
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

function snapshotSmartPatchAcceptanceCancellationScope(
  input: SmartPatchAcceptanceCancellationScope,
): SmartPatchAcceptanceCancellationScope {
  if (
    !input ||
    !Array.isArray(input.verifiedCandidates) ||
    (input.reviewedJobs !== undefined && !Array.isArray(input.reviewedJobs))
  ) {
    throw cancellationUncertain('The Smart Patch cancellation witnesses are invalid.')
  }
  const scope = {
    documentId: input.documentId,
    expectedUnfinishedJobIds: snapshotAcceptanceIds(input.expectedUnfinishedJobIds),
    layerId: input.layerId,
    projectPath: input.projectPath,
    stagingSessionIds: snapshotAcceptanceIds(input.stagingSessionIds),
    tabId: input.tabId,
    verifiedCandidates: input.verifiedCandidates.map((entry) => ({
      candidateId: entry?.candidateId,
      frozenPayloadSha256: entry?.frozenPayloadSha256,
      stagingSessionId: entry?.stagingSessionId,
    })),
    ...(input.reviewedJobs !== undefined
      ? {
          reviewedJobs: input.reviewedJobs.map((entry) => ({
            frozenPayloadSha256: entry?.frozenPayloadSha256,
            jobId: entry?.jobId,
            stagingSessionId: entry?.stagingSessionId,
          })),
        }
      : {}),
  }
  if (
    typeof scope.projectPath !== 'string' ||
    !path.isAbsolute(scope.projectPath) ||
    path.resolve(scope.projectPath) !== scope.projectPath ||
    localProjectRecoveryKey(scope.projectPath) !== scope.tabId ||
    !UUID_PATTERN.test(scope.documentId) ||
    !UUID_PATTERN.test(scope.layerId) ||
    scope.verifiedCandidates.length > IGS_SAFETY_CEILINGS.archiveEntries ||
    new Set(scope.verifiedCandidates.map(({ candidateId }) => candidateId)).size !==
      scope.verifiedCandidates.length ||
    (scope.reviewedJobs !== undefined &&
      (scope.reviewedJobs.length > IGS_SAFETY_CEILINGS.archiveEntries ||
        new Set(scope.reviewedJobs.map((entry) => entry.jobId)).size !==
          scope.reviewedJobs.length ||
        scope.reviewedJobs.some(
          (entry) =>
            typeof entry.jobId !== 'string' ||
            !UUID_PATTERN.test(entry.jobId) ||
            typeof entry.frozenPayloadSha256 !== 'string' ||
            !/^[a-f0-9]{64}$/.test(entry.frozenPayloadSha256) ||
            !scope.stagingSessionIds.includes(entry.stagingSessionId) ||
            scope.verifiedCandidates.some(
              (candidate) =>
                candidate.candidateId === entry.jobId &&
                (candidate.stagingSessionId !== entry.stagingSessionId ||
                  candidate.frozenPayloadSha256 !== entry.frozenPayloadSha256),
            ),
        ))) ||
    scope.verifiedCandidates.some(
      (entry) =>
        typeof entry.candidateId !== 'string' ||
        !UUID_PATTERN.test(entry.candidateId) ||
        typeof entry.frozenPayloadSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(entry.frozenPayloadSha256) ||
        !scope.stagingSessionIds.includes(entry.stagingSessionId),
    )
  ) {
    throw cancellationUncertain('The Smart Patch cancellation scope is invalid.')
  }
  scope.verifiedCandidates.sort((left, right) => left.candidateId.localeCompare(right.candidateId))
  scope.reviewedJobs?.sort((left, right) => left.jobId.localeCompare(right.jobId))
  return scope
}

function sameSmartPatchAcceptanceScope(
  left: SmartPatchAcceptanceCancellationScope,
  right: SmartPatchAcceptanceCancellationScope,
  includeReview: boolean,
): boolean {
  const witnessed = new Map(right.verifiedCandidates.map((entry) => [entry.candidateId, entry]))
  return (
    left.tabId === right.tabId &&
    left.documentId === right.documentId &&
    left.projectPath === right.projectPath &&
    left.layerId === right.layerId &&
    sameIds(left.stagingSessionIds, right.stagingSessionIds) &&
    sameIds(left.expectedUnfinishedJobIds, right.expectedUnfinishedJobIds) &&
    JSON.stringify(left.reviewedJobs ?? []) === JSON.stringify(right.reviewedJobs ?? []) &&
    (includeReview
      ? JSON.stringify(left.verifiedCandidates) === JSON.stringify(right.verifiedCandidates)
      : left.verifiedCandidates.every((entry) => {
          const candidate = witnessed.get(entry.candidateId)
          return (
            candidate?.stagingSessionId === entry.stagingSessionId &&
            candidate.frozenPayloadSha256 === entry.frozenPayloadSha256
          )
        }))
  )
}

function variedContext(
  context: FrozenNormalGenerationPreparationV1,
  prompts: { negative: string; positive: string },
  seed: number,
  seedBehavior: 'per-iteration' | 'per-prompt',
  embeddingPool?: FrozenGenerationEmbeddings,
): FrozenNormalGenerationPreparationV1 {
  const embeddings =
    context.embeddingRefs && embeddingPool
      ? effectiveGenerationEmbeddings(prompts, context.embeddingRefs, embeddingPool)
      : context.embeddings
  if (context.kind === 'normal-img2img-preparation') {
    return {
      ...context,
      ...(embeddings !== undefined ? { embeddings } : {}),
      prompts: { ...prompts },
      sampling: { ...context.sampling, seed, seedBehavior },
    }
  }
  return {
    ...context,
    ...(embeddings !== undefined ? { embeddings } : {}),
    prompts: { ...prompts },
    sampling: { ...context.sampling, seed, seedBehavior },
  }
}
function variedRequest(
  request: IllustriousGenerationRequestV1,
  prompts: { negative: string; positive: string },
  seed: number,
  requestId: string,
  context: FrozenNormalGenerationPreparationV1,
): IllustriousGenerationRequestV1 {
  const job = structuredClone(request.job)
  delete job.embeddings
  const embeddings = workerEmbeddings(context)
  if (request.type === 'generate-illustrious-img2img') {
    return {
      ...request,
      job: {
        ...job,
        ...(embeddings ? { embeddings } : {}),
        prompts: { ...prompts },
        sampling: { ...request.job.sampling, seed },
      },
      requestId,
    }
  }
  return {
    ...request,
    job: {
      ...job,
      ...(embeddings ? { embeddings } : {}),
      prompts: { ...prompts },
      sampling: { ...request.job.sampling, seed },
    },
    requestId,
  }
}
