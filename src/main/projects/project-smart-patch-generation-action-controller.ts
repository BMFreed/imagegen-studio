import { planGenerationBatch } from '../../shared/projects/generation-batch-plan.js'
import { GENERATION_BATCH_JOB_LIMIT } from '../../shared/projects/generation-batch-policy.js'
import { getEffectiveDynamicPromptSettings } from '../../shared/projects/generation-dynamic-settings.js'
import {
  isQualifiedInferenceWorkerReady,
  supportsInferenceAnima,
} from '../../shared/projects/inference-worker-capabilities.js'
import { assertRegionalGuidanceGenerationAvailable } from '../../shared/projects/regional-guidance.js'
import type {
  ProjectSmartPatchGenerateOptions,
  ProjectSmartPatchGenerateResult,
} from '../../shared/projects/smart-patch-public-generation.js'
import { isProjectSmartPatchGenerateOptions } from '../../shared/projects/smart-patch-public-generation.js'

import { randomBytes } from 'node:crypto'

import type { SmartPatchGenerationPreparation } from '../runtime/index.js'
import type { OutpaintInfillResolver } from '../runtime/inference-auxiliary-resources.js'
import type { GenerationOrchestrator } from './generation-orchestrator.js'
import type { GenerationQueueRepository, QueuedGenerationItem } from './generation-queue.js'
import type { GenerationStagingRepository } from './generation-staging.js'
import type { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import type { ProjectService } from './project-service.js'
import type { SmartPatchExecutionModelResolver } from './project-smart-patch-execution.js'
import type { SmartPatchGenerationStagingRepository } from './smart-patch-generation-staging.js'

import { ProjectGenerationActionError } from './generation-action-controller.js'
import { validateSmartPatchExecutionDraft } from './project-smart-patch-execution.js'

interface Dependencies {
  gate: ProjectGenerationOperationGate
  infillResolver?: OutpaintInfillResolver
  models: SmartPatchExecutionModelResolver
  orchestrator: GenerationOrchestrator
  projects: ProjectService
  queue: GenerationQueueRepository
  runtime: {
    withSmartPatchGenerationPreparation: <T>(
      scratch: string,
      use: (preparation: SmartPatchGenerationPreparation) => Promise<T>,
    ) => Promise<T | null>
  }
  scratchBasePath: string
  seedReader: Pick<GenerationStagingRepository, 'readLastActualSeed'>
  staging: SmartPatchGenerationStagingRepository
  wakeDispatch: () => void
  withAdmission?: <T>(tabId: string, prepare: () => Promise<T>) => Promise<T>
}

type Impact = {
  candidateIds: string[]
  jobs: (QueuedGenerationItem & { documentId: string; layerId: string })[]
  sessions: string[]
  unfinishedJobIds: string[]
}
const ids = (values: readonly string[]) => [...new Set(values)].sort()
const same = (left: readonly string[], right: readonly string[]) =>
  JSON.stringify(ids(left)) === JSON.stringify(ids(right))

/** Public target-bound admission; the existing app-wide controller remains the sole drain owner. */
export class ProjectSmartPatchGenerationActionController {
  private admission: Promise<ProjectSmartPatchGenerateResult> | null = null
  private blocked = false
  private closed = false

  constructor(private readonly options: Dependencies) {}

  async generate(
    tabId: string,
    input: ProjectSmartPatchGenerateOptions,
  ): Promise<ProjectSmartPatchGenerateResult> {
    if (!isProjectSmartPatchGenerateOptions(input)) {
      throw new ProjectGenerationActionError(
        'GENERATION_INVALID_REQUEST',
        'The Smart Patch request is invalid.',
      )
    }
    this.assertOpen()
    if (this.admission) {
      throw new ProjectGenerationActionError(
        'GENERATION_BUSY',
        'Another Smart Patch is being prepared.',
      )
    }
    const request = structuredClone(input)
    const operation = this.options.withAdmission
      ? this.options.withAdmission(tabId, () => this.generateUnlocked(tabId, request))
      : this.options.gate.run(tabId, () => this.generateUnlocked(tabId, request))
    this.admission = operation
    try {
      const result = await operation
      if (result.kind === 'queued') {
        this.options.wakeDispatch()
      }
      return result
    } finally {
      if (this.admission === operation) {
        this.admission = null
      }
    }
  }

  async shutdown(): Promise<void> {
    this.closed = true
    await this.admission?.catch(() => undefined)
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ProjectGenerationActionError(
        'GENERATION_CLOSED',
        'Smart Patch generation is shutting down.',
      )
    }
    if (this.blocked) {
      throw new ProjectGenerationActionError(
        'GENERATION_BLOCKED',
        'Smart Patch generation recovery needs attention.',
      )
    }
  }

  private confirmation(
    request: ProjectSmartPatchGenerateOptions,
    impact: Impact,
  ): ProjectSmartPatchGenerateResult {
    return {
      candidateIds: impact.candidateIds,
      documentId: request.documentId,
      kind: 'confirmation-required',
      layerId: request.layerId,
      targetKind: 'smart-patch',
      unfinishedJobIds: impact.unfinishedJobIds,
    }
  }

  private async generateUnlocked(
    tabId: string,
    request: ProjectSmartPatchGenerateOptions,
  ): Promise<ProjectSmartPatchGenerateResult> {
    this.assertOpen()
    const owner = this.options.projects.getOpenDocumentForAcceptance(tabId)
    if (
      !owner ||
      owner.document.documentId !== request.documentId ||
      owner.document.documentRevision !== request.documentRevision
    ) {
      throw new ProjectGenerationActionError(
        'GENERATION_DOCUMENT_CHANGED',
        'The Project changed. Review this Smart Patch before generating.',
      )
    }
    assertRegionalGuidanceGenerationAvailable(owner.document)
    let regionalAdmissionComplete = false
    const assertCurrent = () => {
      this.assertOpen()
      if (!regionalAdmissionComplete) {
        assertRegionalGuidanceGenerationAvailable(owner.document)
      }
      if (this.options.projects.getOpenDocumentForAcceptance(tabId) !== owner) {
        throw new ProjectGenerationActionError(
          'GENERATION_DOCUMENT_CHANGED',
          'The Smart Patch Project closed or changed.',
        )
      }
      this.options.projects.assertSmartPatchGenerationAdmission(
        tabId,
        request.documentId,
        request.layerId,
      )
    }
    assertCurrent()
    let published: QueuedGenerationItem[] = []
    let cleanupStarted = false
    try {
      const outcome = await this.options.projects.withCapturedSmartPatchGenerationInput(
        tabId,
        request.layerId,
        async (capture) => {
          const initial = await this.readImpact(tabId, request)
          assertCurrent()
          if (!this.matches(initial, request)) {
            return this.confirmation(request, initial)
          }
          const draft = capture.context.generationDraft
          const dynamic = getEffectiveDynamicPromptSettings(draft.dynamicPrompt)
          // Validate/count the whole authored plan before choosing Random or doing CPU/model I/O.
          const preliminary = planGenerationBatch({
            baseSeed: 0,
            iterations: request.iterations,
            maxJobs: GENERATION_BATCH_JOB_LIMIT,
            maxPrompts: dynamic.maxPrompts,
            negativePrompt: draft.negativePrompt.text,
            positivePrompt: draft.positivePrompt.text,
            seedBehavior: dynamic.seedBehavior,
          })
          for (const item of preliminary.items) {
            validateSmartPatchExecutionDraft(capture.context, {
              prompts: { ...item.prompts },
              seed: item.seed,
            })
          }
          const last = await this.options.seedReader.readLastActualSeed(tabId, request.documentId)
          assertCurrent()
          const baseSeed =
            draft.seed.policy === 'fixed'
              ? draft.seed.value
              : draft.seed.policy === 'reuse'
                ? (last ?? capture.context.lastActualSeedSnapshot)
                : randomBytes(4).readUInt32LE(0)
          if (
            baseSeed === null ||
            !Number.isSafeInteger(baseSeed) ||
            baseSeed < 0 ||
            baseSeed > 0xff_ff_ff_ff
          ) {
            throw new ProjectGenerationActionError(
              'GENERATION_SEED_INVALID',
              'The Smart Patch seed is unavailable. Choose Random or a numeric Fixed seed.',
            )
          }
          const plan = planGenerationBatch({
            baseSeed,
            iterations: request.iterations,
            maxJobs: GENERATION_BATCH_JOB_LIMIT,
            maxPrompts: dynamic.maxPrompts,
            negativePrompt: draft.negativePrompt.text,
            positivePrompt: draft.positivePrompt.text,
            seedBehavior: dynamic.seedBehavior,
          })
          const material = await this.options.runtime.withSmartPatchGenerationPreparation(
            this.options.scratchBasePath,
            async ({ inferenceReady, preparationWorker }) => {
              assertCurrent()
              if (
                !isQualifiedInferenceWorkerReady(inferenceReady) ||
                inferenceReady.workerVersion !== '0.14.0' ||
                !inferenceReady.capabilities.includes('smart-patch-execution') ||
                !inferenceReady.capabilities.includes('smart-patch-seed-confirmation') ||
                (draft.model?.baseModelFamily === 'anima' &&
                  !supportsInferenceAnima(inferenceReady))
              ) {
                throw new ProjectGenerationActionError(
                  'GENERATION_RUNTIME_UNAVAILABLE',
                  'The installed worker cannot generate Smart Patches.',
                )
              }
              return await capture.prepareBatchInput({
                infillResolver: this.options.infillResolver,
                items: plan.items.map(({ prompts, seed }) => ({ prompts: { ...prompts }, seed })),
                modelService: this.options.models,
                preparationWorker,
              })
            },
          )
          if (!material) {
            throw new ProjectGenerationActionError(
              'GENERATION_RUNTIME_UNAVAILABLE',
              'Set up a qualified installed image runtime before generating Smart Patches.',
            )
          }
          assertCurrent()
          const latest = await this.readImpact(tabId, request)
          assertCurrent()
          if (!this.matches(latest, request)) {
            return this.confirmation(request, latest)
          }
          published = await this.options.orchestrator.enqueuePreparedSmartPatchBatch(
            tabId,
            material,
          )
          regionalAdmissionComplete = true
          assertCurrent()
          return {
            batchId: published[0].batchId,
            documentId: request.documentId,
            jobIds: published.map(({ id }) => id),
            kind: 'queued',
            layerId: request.layerId,
            targetKind: 'smart-patch',
            truncated: plan.truncated,
          } satisfies ProjectSmartPatchGenerateResult
        },
      )
      if (outcome.kind !== 'queued') {
        return outcome
      }
      // Both the installed CPU exit and the frozen source lease have settled before replacement.
      const previous = await this.readImpact(tabId, request, outcome.jobIds)
      assertCurrent()
      if (!this.matches(previous, request)) {
        for (const row of published) {
          await this.options.orchestrator.cancelGenerationJob(row.id)
        }
        published = []
        return this.confirmation(request, previous)
      }
      for (const row of previous.jobs) {
        await this.options.orchestrator.cancelGenerationJob(row.id)
      }
      if (previous.sessions.length > 0) {
        await this.options.orchestrator.quiesceSmartPatchForProject(tabId, previous.sessions)
      }
      const drained = await this.readImpact(tabId, request, outcome.jobIds)
      assertCurrent()
      if (!same(drained.candidateIds, previous.candidateIds) || drained.jobs.length > 0) {
        for (const row of published) {
          await this.options.orchestrator.cancelGenerationJob(row.id)
        }
        published = []
        return this.confirmation(request, drained)
      }
      if (previous.sessions.length > 0) {
        cleanupStarted = true
        await this.options.staging.discardSessions(tabId, previous.sessions)
      }
      assertCurrent()
      return outcome
    } catch (error) {
      try {
        for (const row of published) {
          const stopped = await this.options.orchestrator.cancelGenerationJob(row.id)
          if (stopped.status === 'running') {
            throw new Error('Unconfirmed Smart Patch cancellation.')
          }
        }
      } catch {
        this.blocked = true
        await this.options.orchestrator.fenceProjectGeneration(tabId)
        throw new ProjectGenerationActionError(
          'GENERATION_REPLACEMENT_UNCERTAIN',
          'Smart Patch cancellation needs recovery before generating again.',
        )
      }
      if (cleanupStarted) {
        this.blocked = true
        await this.options.orchestrator.fenceProjectGeneration(tabId)
        throw new ProjectGenerationActionError(
          'GENERATION_REPLACEMENT_UNCERTAIN',
          'Smart Patch replacement cleanup needs recovery.',
        )
      }
      throw error
    }
  }

  private matches(impact: Impact, request: ProjectSmartPatchGenerateOptions): boolean {
    return (
      impact.candidateIds.length + impact.jobs.length === 0 ||
      Boolean(
        request.confirmation &&
        same(impact.candidateIds, request.confirmation.candidateIds) &&
        same(impact.unfinishedJobIds, request.confirmation.unfinishedJobIds),
      )
    )
  }

  private async readImpact(
    tabId: string,
    request: ProjectSmartPatchGenerateOptions,
    excluded: readonly string[] = [],
  ): Promise<Impact> {
    const [all, jobs] = await Promise.all([
      this.options.staging.listVerifiedCandidates(tabId),
      this.options.queue.listUnfinishedSmartPatchJobsByProject(tabId),
    ])
    const candidates = all.filter(
      (candidate) =>
        candidate.documentId === request.documentId &&
        candidate.payload.context.layerId === request.layerId,
    )
    const ownedJobs = jobs.filter(
      (job) =>
        job.documentId === request.documentId &&
        job.layerId === request.layerId &&
        !excluded.includes(job.id),
    )
    return {
      candidateIds: ids(candidates.map(({ candidateId }) => candidateId)),
      jobs: ownedJobs,
      sessions: ids([
        ...candidates.map(({ stagingSessionId }) => stagingSessionId),
        ...ownedJobs.map(({ stagingSessionId }) => stagingSessionId),
      ]),
      unfinishedJobIds: ids(ownedJobs.map(({ id }) => id)),
    }
  }
}
