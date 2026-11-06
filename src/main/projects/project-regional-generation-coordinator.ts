import { planGenerationBatch } from '../../shared/projects/generation-batch-plan.js'
import { GENERATION_BATCH_JOB_LIMIT } from '../../shared/projects/generation-batch-policy.js'
import { getEffectiveDynamicPromptSettings } from '../../shared/projects/generation-dynamic-settings.js'
import { isIllustriousNoiseProfileV1 } from '../../shared/projects/illustrious-noise-profile.js'
import {
  isQualifiedInferenceWorkerReady,
  supportsInferenceEmbeddings,
  supportsInferenceRegionalDpm,
  supportsInferenceRegionalInvokeInitialization,
  supportsInferenceRegionalLoras,
  supportsInferenceRegionalVae,
} from '../../shared/projects/inference-worker-capabilities.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import { activePromptEmbeddingRefs } from '../../shared/projects/prompt-embeddings.js'
import {
  getInvokeRegionalGenerationUnavailableReason,
  hasActiveGlobalPromptEmbeddings,
  planInvokeRegionalGenerationBatch,
} from '../../shared/projects/regional-invoke-generation.js'

import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type { GenerationOrchestrator, PrivateRegionalExecution } from './generation-orchestrator.js'
import type { QueuedGenerationItem } from './generation-queue.js'
import type { GenerationModelResolver } from './illustrious-generation-loras.js'
import type { InferenceWorkerReady } from './illustrious-txt2img-job.js'
import type { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import type { ProjectService } from './project-service.js'
import type {
  RegionalGenerationProcessorResult,
  RegionalGenerationTransport,
} from './regional-generation-processor.js'
import type { RegionalGlobalCoverage } from './regional-worker-request.js'
import type { ProjectWorkerClient } from './worker-client.js'

import {
  effectiveGenerationEmbeddings,
  workerEmbeddings,
} from './illustrious-generation-embeddings.js'
import {
  assertIllustriousTxt2ImgRequestFitsTransport,
  withIllustriousTxt2ImgRequest,
} from './illustrious-txt2img-job.js'
import { prepareCurrentCanvasRegionalRecipe } from './project-current-canvas-regional-recipe.js'
import {
  prepareNormalTxt2Img,
  validateNormalTxt2ImgDraft,
} from './project-generation-preparation.js'

const OPT_IN = 'private-current-canvas-regional-v1'
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

export interface ProjectRegionalGenerationSubmission {
  compositionWorker: Pick<ProjectWorkerClient, 'composeTarget'>
  documentId: string
  documentRevision: string
  globalNegativeCoverage: RegionalGlobalCoverage
  globalPositiveCoverage: RegionalGlobalCoverage
  layout: 'cfg-negative-first' | 'positive-only'
  negativePooledSourceId: string
  optIn: typeof OPT_IN
  positivePooledSourceId: string
  ready: InferenceWorkerReady
}

export interface ProjectRegionalGenerationPreparation {
  inferenceReady: InferenceWorkerReady
  targetWorker: Pick<ProjectWorkerClient, 'composeTarget'>
}

export interface ProjectRegionalInvokeGenerationSubmission {
  afterPublication?: (item: QueuedGenerationItem, assertCurrent: () => void) => Promise<void>
  beforePublication?: () => Promise<void>
  documentId: string
  documentRevision: string
  withPreparation: <T>(
    use: (preparation: ProjectRegionalGenerationPreparation) => Promise<T>,
  ) => Promise<T | null>
}

export interface ProjectRegionalInvokeGenerationBatchSubmission extends Omit<
  ProjectRegionalInvokeGenerationSubmission,
  'afterPublication'
> {
  afterPublication?: (
    items: readonly QueuedGenerationItem[],
    assertCurrent: () => void,
  ) => Promise<void>
  iterations: number
  onPlanned?: (info: { truncated: boolean }) => void
}

type RegionalComposition = Pick<
  ProjectRegionalGenerationSubmission,
  | 'globalNegativeCoverage'
  | 'globalPositiveCoverage'
  | 'layout'
  | 'negativePooledSourceId'
  | 'positivePooledSourceId'
>

export class ProjectRegionalGenerationError extends Error {
  constructor(
    readonly code:
      'CLOSED' | 'INFERENCE_UNAVAILABLE' | 'INPUT_INVALID' | 'PROJECT_CHANGED' | 'UNSUPPORTED',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectRegionalGenerationError'
  }
}

/**
 * InvokeAI a61ac4fb's captured Canvas → concrete execution → owner-bound admission, adapted to
 * Studio's existing Project gate, freeze helpers, queue and receipt owner. No caller-built recipe
 * or preparation is accepted here. UI/public dispatch and composition defaults are separate.
 */
export class ProjectRegionalGenerationCoordinator {
  private closed = false
  private readonly execution: PrivateRegionalExecution
  private readonly models: GenerationModelResolver
  private readonly options: {
    compositionProfile?: 'invoke-canvas-v1'
    gate: ProjectGenerationOperationGate
    models: GenerationModelResolver
    orchestrator: GenerationOrchestrator
    projects: ProjectService
    scratchBasePath: string
  }
  private readonly pending = new Set<Promise<unknown>>()
  private shutdownPromise: Promise<void> | null = null

  constructor(options: {
    compositionProfile?: 'invoke-canvas-v1'
    gate: ProjectGenerationOperationGate
    models: GenerationModelResolver
    orchestrator: GenerationOrchestrator
    projects: ProjectService
    scratchBasePath: string
  }) {
    this.options = { ...options }
    this.models = captureModels(options.models)
    this.execution = options.orchestrator.createRegionalExecution(options.compositionProfile)
  }

  getProgressSnapshot(): ReturnType<PrivateRegionalExecution['getProgressSnapshot']> {
    return this.execution.getProgressSnapshot()
  }

  onChanged(listener: () => void): () => void {
    return this.execution.onChanged(listener)
  }

  onProgress(listener: Parameters<PrivateRegionalExecution['onProgress']>[0]): () => void {
    return this.execution.onProgress(listener)
  }

  async retry(
    tabId: string,
    input: { expectedStatusSequence: number; optIn: typeof OPT_IN; queueItemId: string },
  ): Promise<QueuedGenerationItem> {
    this.assertOpen()
    if (
      input?.optIn !== OPT_IN ||
      !UUID.test(input.queueItemId) ||
      !Number.isSafeInteger(input.expectedStatusSequence) ||
      input.expectedStatusSequence < 0
    ) {
      throw invalid('The private Retry identity is invalid.')
    }
    const { expectedStatusSequence, queueItemId } = input
    return await this.track(
      this.options.gate.run(tabId, async () => {
        this.assertOpen()
        return await this.options.orchestrator.retryRegional(
          tabId,
          queueItemId,
          expectedStatusSequence,
        )
      }),
    )
  }

  async runNext(
    transport: RegionalGenerationTransport,
  ): Promise<RegionalGenerationProcessorResult> {
    this.assertOpen()
    return await this.execution.runNext(transport)
  }

  async shutdown(): Promise<void> {
    this.closed = true
    this.shutdownPromise ??= (async () => {
      await Promise.allSettled(this.pending)
      await this.execution.stopAndCancelActive()
    })().catch((error: unknown) => {
      this.shutdownPromise = null
      throw error
    })
    return await this.shutdownPromise
  }

  async submit(
    tabId: string,
    input: ProjectRegionalGenerationSubmission,
  ): Promise<QueuedGenerationItem> {
    this.assertOpen()
    if (
      input?.optIn !== OPT_IN ||
      !UUID.test(input.documentId) ||
      !UUID.test(input.documentRevision)
    ) {
      throw invalid('Explicit private opt-in and the reviewed Project revision are required.')
    }
    if (typeof input.compositionWorker?.composeTarget !== 'function') {
      throw invalid('The target composition worker is unavailable.')
    }
    const composeTarget = input.compositionWorker.composeTarget.bind(input.compositionWorker)
    const captured = {
      documentId: input.documentId,
      documentRevision: input.documentRevision,
      globalNegativeCoverage: copyCoverage(input.globalNegativeCoverage),
      globalPositiveCoverage: copyCoverage(input.globalPositiveCoverage),
      layout: input.layout,
      negativePooledSourceId: input.negativePooledSourceId,
      positivePooledSourceId: input.positivePooledSourceId,
      ready: structuredClone(input.ready),
    }
    if (
      !isQualifiedInferenceWorkerReady(captured.ready) ||
      !captured.ready.capabilities.includes(OPT_IN)
    ) {
      throw new ProjectRegionalGenerationError(
        'INFERENCE_UNAVAILABLE',
        'Private regional execution is not qualified.',
      )
    }
    if (
      !['cfg-negative-first', 'positive-only'].includes(captured.layout) ||
      typeof captured.negativePooledSourceId !== 'string' ||
      typeof captured.positivePooledSourceId !== 'string'
    ) {
      throw invalid('The explicit regional composition is invalid.')
    }
    const { assertOwner } = this.captureOwner(tabId, captured)
    return await this.track(
      this.options.gate.run(
        tabId,
        async () =>
          await this.submitCaptured(tabId, {
            assertOwner,
            composition: {
              globalNegativeCoverage: captured.globalNegativeCoverage,
              globalPositiveCoverage: captured.globalPositiveCoverage,
              layout: captured.layout,
              negativePooledSourceId: captured.negativePooledSourceId,
              positivePooledSourceId: captured.positivePooledSourceId,
            },
            withPreparation: async (use) =>
              await use({ inferenceReady: captured.ready, targetWorker: { composeTarget } }),
          }),
      ),
    )
  }

  /** One captured concrete batch; the caller already holds the Project operation gate. */
  async submitInvokeBatchUnderGate(
    tabId: string,
    input: ProjectRegionalInvokeGenerationBatchSubmission,
  ): Promise<QueuedGenerationItem[]> {
    this.assertOpen()
    if (this.options.compositionProfile !== 'invoke-canvas-v1') {
      throw unsupported('This coordinator does not own public Invoke regional submission.')
    }
    if (
      !UUID.test(input?.documentId) ||
      !UUID.test(input?.documentRevision) ||
      !Number.isSafeInteger(input.iterations) ||
      input.iterations < 1 ||
      input.iterations > GENERATION_BATCH_JOB_LIMIT ||
      typeof input.withPreparation !== 'function' ||
      (input.beforePublication !== undefined && typeof input.beforePublication !== 'function') ||
      (input.afterPublication !== undefined && typeof input.afterPublication !== 'function') ||
      (input.onPlanned !== undefined && typeof input.onPlanned !== 'function')
    ) {
      throw invalid('The reviewed Project and regional preparation owner are required.')
    }
    const { assertOwner, document } = this.captureOwner(tabId, input)
    validateInvokeDraft(document, input.iterations)
    const { afterPublication, beforePublication, iterations, onPlanned, withPreparation } = input
    // The call enters Service capture synchronously, before the runtime callback can await.
    return await this.track(
      this.submitCapturedBatch(tabId, {
        afterPublication,
        assertOwner,
        beforePublication,
        composition: {
          globalNegativeCoverage: { kind: 'everywhere' },
          globalPositiveCoverage: { kind: 'everywhere' },
          layout: 'cfg-negative-first',
          negativePooledSourceId: 'current-canvas',
          positivePooledSourceId: 'current-canvas',
        },
        compositionProfile: 'invoke-canvas-v1',
        iterations,
        onPlanned,
        withPreparation,
      }),
    )
  }

  /** Caller already owns the shared Project operation gate; never acquire it recursively. */
  async submitInvokeUnderGate(
    tabId: string,
    input: ProjectRegionalInvokeGenerationSubmission,
  ): Promise<QueuedGenerationItem> {
    this.assertOpen()
    if (this.options.compositionProfile !== 'invoke-canvas-v1') {
      throw unsupported('This coordinator does not own public Invoke regional submission.')
    }
    const afterPublication = input?.afterPublication
    if (afterPublication !== undefined && typeof afterPublication !== 'function') {
      throw invalid('The reviewed Project and regional preparation owner are required.')
    }
    const items = await this.submitInvokeBatchUnderGate(tabId, {
      ...input,
      afterPublication: afterPublication
        ? async (items, assertCurrent) => await afterPublication(items[0], assertCurrent)
        : undefined,
      iterations: 1,
    })
    return items[0]
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ProjectRegionalGenerationError('CLOSED', 'Private regional submission has stopped.')
    }
  }

  private captureOwner(
    tabId: string,
    expected: { documentId: string; documentRevision: string },
  ): { assertOwner: () => void; document: IgsProjectDocumentV1 } {
    const owner = this.options.projects.getOpenDocumentForAcceptance(tabId)
    if (!owner) {
      throw new ProjectRegionalGenerationError('PROJECT_CHANGED', 'The Project is no longer open.')
    }
    const { documentId, documentRevision } = expected
    const epoch = owner.documentEpoch
    const assertOwner = () => {
      this.assertOpen()
      if (
        this.options.projects.getOpenDocumentForAcceptance(tabId) !== owner ||
        owner.documentEpoch !== epoch ||
        owner.document.documentId !== documentId ||
        owner.document.documentRevision !== documentRevision
      ) {
        throw new ProjectRegionalGenerationError(
          'PROJECT_CHANGED',
          'The reviewed Project changed before regional admission.',
        )
      }
    }
    assertOwner()
    return { assertOwner, document: owner.document }
  }

  private async submitCaptured(
    tabId: string,
    input: Pick<
      ProjectRegionalInvokeGenerationSubmission,
      'afterPublication' | 'beforePublication' | 'withPreparation'
    > & {
      assertOwner: () => void
      composition: RegionalComposition
      compositionProfile?: 'invoke-canvas-v1'
    },
  ): Promise<QueuedGenerationItem> {
    const afterPublication = input.afterPublication
    const items = await this.submitCapturedBatch(tabId, {
      ...input,
      afterPublication: afterPublication
        ? async (items, assertCurrent) => await afterPublication(items[0], assertCurrent)
        : undefined,
      iterations: 1,
    })
    return items[0]
  }

  private async submitCapturedBatch(
    tabId: string,
    input: Pick<
      ProjectRegionalInvokeGenerationBatchSubmission,
      'afterPublication' | 'beforePublication' | 'iterations' | 'onPlanned' | 'withPreparation'
    > & {
      assertOwner: () => void
      composition: RegionalComposition
      compositionProfile?: 'invoke-canvas-v1'
    },
  ): Promise<QueuedGenerationItem[]> {
    const { assertOwner, composition, compositionProfile, withPreparation } = input
    const publication: { admitted: QueuedGenerationItem[] } = { admitted: [] }
    assertOwner()
    try {
      return await this.options.projects.withCapturedCurrentCanvasRegionalGenerationInput(
        tabId,
        async (capture) => {
          const assertCurrent = () => {
            assertOwner()
            capture.assertCurrent()
          }
          assertCurrent()
          const document = structuredClone(capture.document)
          if (compositionProfile) {
            validateInvokeDraft(document, input.iterations)
          } else {
            validatePrivateDraft(document, composition)
          }
          const dynamic = compositionProfile
            ? getEffectiveDynamicPromptSettings(document.generationDraft.dynamicPrompt)
            : { maxPrompts: 1, seedBehavior: 'per-iteration' as const }
          const authoredPrompts = {
            negative: document.generationDraft.negativePrompt.text,
            positive: document.generationDraft.positivePrompt.text,
          }
          // Expand and validate the complete authored grammar before target/model work. The
          // operational seed remains unresolved until ordinary preparation chooses it once.
          const preflight = compositionProfile
            ? planInvokeRegionalGenerationBatch(document, input.iterations)
            : null
          input.onPlanned?.({ truncated: preflight?.truncated ?? false })
          assertCurrent()
          const initializationProfile =
            compositionProfile &&
            (document.generationDraft.sampling.sampler === 'Euler a' ||
              document.generationDraft.sampling.sampler === 'DPM++ 2M')
              ? ('invoke-cpu-f32-add-noise-v1' as const)
              : undefined
          const result = await withPreparation(async (preparation) => {
            assertCurrent()
            const ready = structuredClone(preparation.inferenceReady)
            const capability = compositionProfile ? 'illustrious-regional-invoke-v1' : OPT_IN
            if (
              !isQualifiedInferenceWorkerReady(ready) ||
              !ready.capabilities.includes(capability) ||
              (compositionProfile &&
                document.generationDraft.sampling.sampler === 'DPM++ 2M' &&
                !supportsInferenceRegionalDpm(ready)) ||
              (compositionProfile &&
                document.generationDraft.loras.some((entry) => entry.enabled) &&
                !supportsInferenceRegionalLoras(ready)) ||
              (compositionProfile &&
                (document.generationDraft.vae !== null ||
                  (document.generationDraft.vaePrecision ?? 'Auto') !== 'FP16') &&
                !supportsInferenceRegionalVae(ready)) ||
              (compositionProfile &&
                hasActiveGlobalPromptEmbeddings(
                  document,
                  preflight!.items.map((item) => item.prompts.positive),
                ) &&
                !supportsInferenceEmbeddings(ready)) ||
              (initializationProfile !== undefined &&
                !supportsInferenceRegionalInvokeInitialization(ready))
            ) {
              throw new ProjectRegionalGenerationError(
                'INFERENCE_UNAVAILABLE',
                'The image engine has not qualified this regional profile.',
              )
            }
            if (typeof preparation.targetWorker?.composeTarget !== 'function') {
              throw invalid('The target composition worker is unavailable.')
            }
            const composeTarget = preparation.targetWorker.composeTarget.bind(
              preparation.targetWorker,
            )
            const operationalSeed = await this.options.orchestrator.readRegionalOperationalSeed(
              tabId,
              document.documentId,
            )
            assertCurrent()
            validateNormalTxt2ImgDraft(
              document.generationDraft,
              operationalSeed,
              document.lastActualSeedSnapshot,
            )
            const target = await capture.composeTarget({ composeTarget })
            assertCurrent()
            const authoredEmbeddingRefs = {
              negative: structuredClone(target.generationDraft.negativePrompt.embeddingRefs),
              positive: structuredClone(target.generationDraft.positivePrompt.embeddingRefs),
            }
            const preparationTarget = compositionProfile
              ? { ...target, generationDraft: structuredClone(target.generationDraft) }
              : target
            if (compositionProfile) {
              // Select by concrete boundaries: expansion can activate a literal absent from the
              // template, while excluded branches remain dormant. Ordinary preparation resolves
              // this selected union once; each concrete item later consumes only its own subset.
              const selectedTokens = new Set(
                preflight!.items.flatMap((item) =>
                  activePromptEmbeddingRefs(
                    item.prompts.positive,
                    authoredEmbeddingRefs.positive,
                  ).map((ref) => ref.token),
                ),
              )
              preparationTarget.generationDraft.positivePrompt = {
                embeddingRefs: authoredEmbeddingRefs.positive.filter((ref) =>
                  selectedTokens.has(ref.token),
                ),
                text: preflight!.items[0].prompts.positive,
              }
              const negative = preparationTarget.generationDraft.negativePrompt
              negative.embeddingRefs = activePromptEmbeddingRefs(
                negative.text,
                authoredEmbeddingRefs.negative,
              )
            }
            const prepared = await prepareNormalTxt2Img({
              lastActualSeed: operationalSeed,
              modelService: this.models,
              target: preparationTarget,
            })
            if (compositionProfile) {
              prepared.context.embeddingRefs = authoredEmbeddingRefs
            }
            assertCurrent()
            const plan = planGenerationBatch({
              baseSeed: prepared.context.sampling.seed,
              iterations: input.iterations,
              maxJobs: compositionProfile ? GENERATION_BATCH_JOB_LIMIT : 1,
              maxPrompts: dynamic.maxPrompts,
              negativePrompt: authoredPrompts.negative,
              positivePrompt: authoredPrompts.positive,
              seedBehavior: dynamic.seedBehavior,
            })
            const materials: {
              context: typeof prepared.context
              item: (typeof plan.items)[number]
              recipe: Awaited<ReturnType<typeof prepareCurrentCanvasRegionalRecipe>>
            }[] = []
            for (const item of plan.items) {
              const context = structuredClone(prepared.context)
              context.prompts = { ...item.prompts }
              context.sampling.seed = item.seed
              if (
                plan.items.length > 1 ||
                (compositionProfile && authoredPrompts.positive !== item.prompts.positive)
              ) {
                context.sampling.seedBehavior = dynamic.seedBehavior
              }
              if (context.embeddingRefs && prepared.embeddingPool) {
                context.embeddings = effectiveGenerationEmbeddings(
                  context.prompts,
                  context.embeddingRefs,
                  prepared.embeddingPool,
                )
              }
              const recipe = await prepareCurrentCanvasRegionalRecipe({
                capture: capture.regional,
                job: {
                  bbox: context.bbox,
                  documentId: context.documentId,
                  documentRevision: context.documentRevision,
                  family: 'illustrious',
                  item,
                },
                models: this.models,
              })
              assertCurrent()
              materials.push({ context, item, recipe })
            }
            return await withIllustriousTxt2ImgRequest({
              modelService: this.models,
              prepared,
              ready,
              scratchBasePath: this.options.scratchBasePath,
              use: async (request) => {
                assertCurrent()
                const items = materials.map(({ context, item, recipe }, index) => {
                  const concreteRequest = structuredClone(request)
                  if (index > 0) {
                    concreteRequest.requestId = randomUUID()
                  }
                  concreteRequest.job.prompts = { ...item.prompts }
                  concreteRequest.job.sampling.seed = item.seed
                  delete concreteRequest.job.embeddings
                  const embeddings = workerEmbeddings(context)
                  if (embeddings) {
                    concreteRequest.job.embeddings = embeddings
                  }
                  assertIllustriousTxt2ImgRequestFitsTransport(concreteRequest)
                  return {
                    prepared: { context, targetPngBytes: prepared.targetPngBytes },
                    regional: {
                      ...(compositionProfile ? { compositionProfile } : {}),
                      ...composition,
                      ...(initializationProfile !== undefined ? { initializationProfile } : {}),
                      recipe,
                    },
                    request: concreteRequest,
                  }
                })
                const callbacks = {
                  ...(input.beforePublication
                    ? { beforePublication: input.beforePublication }
                    : {}),
                  assertCurrent,
                }
                publication.admitted =
                  items.length === 1
                    ? [
                        await this.options.orchestrator.enqueuePreparedRegional(tabId, {
                          ...callbacks,
                          ...items[0],
                          ...(input.afterPublication
                            ? {
                                afterPublication: async (queued, current) =>
                                  await input.afterPublication!([queued], current),
                              }
                            : {}),
                        }),
                      ]
                    : await this.options.orchestrator.enqueuePreparedRegionalBatch(tabId, {
                        ...callbacks,
                        ...(input.afterPublication
                          ? { afterPublication: input.afterPublication }
                          : {}),
                        items,
                      })
                return publication.admitted
              },
            })
          })
          if (result === null) {
            throw new ProjectRegionalGenerationError(
              'INFERENCE_UNAVAILABLE',
              'The regional image engine is unavailable.',
            )
          }
          assertCurrent()
          return result
        },
      )
    } catch (error) {
      let cleanupError: unknown
      for (const item of publication.admitted) {
        try {
          await this.options.orchestrator.cancelFailedRegionalAdmission(tabId, item.id)
        } catch (failure) {
          cleanupError ??= failure
        }
      }
      if (cleanupError !== undefined) {
        throw cleanupError
      }
      throw error
    }
  }

  private async track<T>(operation: Promise<T>): Promise<T> {
    this.pending.add(operation)
    try {
      return await operation
    } finally {
      this.pending.delete(operation)
    }
  }
}

function validateInvokeDraft(document: IgsProjectDocumentV1, iterations = 1): void {
  const reason = getInvokeRegionalGenerationUnavailableReason({
    document,
    dpmSupported: true,
    embeddingsSupported: true,
    initializationSupported: true,
    iterations,
    loraSupported: true,
    runtimeSupported: true,
    vaeSupported: true,
  })
  if (reason) {
    throw unsupported(reason)
  }
}

function validatePrivateDraft(
  document: IgsProjectDocumentV1,
  composition: RegionalComposition,
): void {
  const draft = document.generationDraft
  const bbox = document.primaryBbox
  const regions = (document.regionalGuidance ?? []).filter((region) => region.enabled)
  if (
    draft.model?.baseModelFamily !== 'illustrious' ||
    draft.model.predictionType !== 'epsilon' ||
    draft.vae != null ||
    draft.vaePrecision !== 'FP16' ||
    draft.loras.some((entry) => entry.enabled) ||
    draft.sampling.sampler !== 'Euler' ||
    draft.sampling.scheduler !== 'Normal' ||
    (draft.cfgRescale ?? 0) !== 0 ||
    draft.sampling.cfgScale === null ||
    !Number.isFinite(draft.sampling.cfgScale) ||
    draft.sampling.cfgScale < 1 ||
    draft.sampling.cfgScale > 30 ||
    !Number.isSafeInteger(draft.sampling.steps) ||
    (draft.sampling.steps ?? 0) < 1 ||
    (draft.sampling.steps ?? 0) > 200 ||
    regions.length > 3 ||
    regions.some((region) => (region.referenceImages?.length ?? 0) > 0) ||
    bbox.width < 8 ||
    bbox.height < 8 ||
    bbox.width > 2048 ||
    bbox.height > 2048 ||
    bbox.width % 8 !== 0 ||
    bbox.height % 8 !== 0 ||
    bbox.width * bbox.height > 4_000_000
  ) {
    throw unsupported('The Project does not match the private Illustrious regional profile.')
  }
  const texts = [draft.positivePrompt.text, draft.negativePrompt.text]
  for (const region of regions) {
    if (region.prompts?.positive) {
      texts.push(region.prompts.positive.text)
    }
    if (region.prompts && !region.prompts.useGlobalNegativePrompt && region.prompts.negative) {
      texts.push(region.prompts.negative.text)
    }
  }
  if (texts.some((text) => /[{}]/.test(text))) {
    throw unsupported('This private submission requires static prompt text.')
  }
  if (
    ['positive', 'negative'].some((sign) => {
      const prompt = sign === 'positive' ? draft.positivePrompt : draft.negativePrompt
      return activePromptEmbeddingRefs(prompt.text, prompt.embeddingRefs).length > 0
    })
  ) {
    throw unsupported(
      'Effective global embeddings require a separate regional preparation agreement.',
    )
  }
  if ((draft.sampling.cfgScale ?? 0) > 1 !== (composition.layout === 'cfg-negative-first')) {
    throw unsupported('The explicit layout differs from the authored CFG setting.')
  }
  for (const coverage of [composition.globalNegativeCoverage, composition.globalPositiveCoverage]) {
    if (
      coverage.kind === 'alpha8' &&
      (coverage.width !== bbox.width / 8 || coverage.height !== bbox.height / 8)
    ) {
      throw invalid('Global coverage dimensions differ from the captured target.')
    }
  }
  const sources = new Set(['current-canvas', ...regions.map((region) => region.id)])
  if (
    !sources.has(composition.negativePooledSourceId) ||
    !sources.has(composition.positivePooledSourceId)
  ) {
    throw invalid('A selected pooled source is absent from the captured recipe.')
  }
}

function copyCoverage(value: RegionalGlobalCoverage): RegionalGlobalCoverage {
  if (value?.kind === 'everywhere' && Object.keys(value).length === 1) {
    return { kind: 'everywhere' }
  }
  if (
    value?.kind === 'alpha8' &&
    Object.keys(value).length === 4 &&
    Number.isSafeInteger(value.width) &&
    value.width > 0 &&
    value.width <= 2048 &&
    Number.isSafeInteger(value.height) &&
    value.height > 0 &&
    value.height <= 2048 &&
    value.alpha instanceof Uint8Array &&
    value.alpha.buffer instanceof ArrayBuffer &&
    value.alpha.length === value.width * value.height
  ) {
    return {
      alpha: new Uint8Array(value.alpha),
      height: value.height,
      kind: 'alpha8',
      width: value.width,
    }
  }
  throw invalid('Global coverage must be an owned bounded alpha plane or Everywhere.')
}

function captureModels(models: GenerationModelResolver): GenerationModelResolver {
  const names = [
    'assertNoUnboundGenerationEmbeddings',
    'resolveVerifiedGenerationCheckpointForPlan',
    'resolveVerifiedGenerationEmbeddingForPlan',
    'resolveVerifiedGenerationLoraForPlan',
    'resolveVerifiedGenerationVaeForPlan',
  ] as const
  if (!models || names.some((name) => typeof models[name] !== 'function')) {
    throw invalid('Model verification is unavailable.')
  }
  const noUnbound = models.assertNoUnboundGenerationEmbeddings.bind(models)
  const checkpoint = models.resolveVerifiedGenerationCheckpointForPlan.bind(models)
  const embedding = models.resolveVerifiedGenerationEmbeddingForPlan.bind(models)
  const lora = models.resolveVerifiedGenerationLoraForPlan.bind(models)
  const vae = models.resolveVerifiedGenerationVaeForPlan.bind(models)
  return {
    assertNoUnboundGenerationEmbeddings: async (...args) => {
      await noUnbound(...structuredClone(args))
    },
    resolveVerifiedGenerationCheckpointForPlan: async (...args) => {
      const resolved = structuredClone(await checkpoint(...structuredClone(args)))
      if (
        resolved.reference.predictionType !== 'epsilon' ||
        !isIllustriousNoiseProfileV1(resolved.noiseProfile)
      ) {
        throw unsupported(
          'The resolved checkpoint must have epsilon prediction and an explicit current noise policy.',
        )
      }
      return resolved
    },
    resolveVerifiedGenerationEmbeddingForPlan: async (...args) =>
      structuredClone(await embedding(...structuredClone(args))),
    resolveVerifiedGenerationLoraForPlan: async (...args) =>
      structuredClone(await lora(...structuredClone(args))),
    resolveVerifiedGenerationVaeForPlan: async (...args) => {
      const saved = structuredClone(args)
      const resolved = structuredClone(await vae(...structuredClone(saved)))
      if (!isDeepStrictEqual(resolved.reference, saved[0])) {
        throw invalid('The resolved VAE must preserve the exact saved reference.')
      }
      return resolved
    },
  }
}

function invalid(message: string): ProjectRegionalGenerationError {
  return new ProjectRegionalGenerationError('INPUT_INVALID', message)
}
function unsupported(message: string): ProjectRegionalGenerationError {
  return new ProjectRegionalGenerationError('UNSUPPORTED', message)
}
