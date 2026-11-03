import { planGenerationBatch } from '../../shared/projects/generation-batch-plan.js'
import { isIllustriousNoiseProfileV1 } from '../../shared/projects/illustrious-noise-profile.js'
import { isQualifiedInferenceWorkerReady } from '../../shared/projects/inference-worker-capabilities.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import { activePromptEmbeddingRefs } from '../../shared/projects/prompt-embeddings.js'

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

import { withIllustriousTxt2ImgRequest } from './illustrious-txt2img-job.js'
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
    gate: ProjectGenerationOperationGate
    models: GenerationModelResolver
    orchestrator: GenerationOrchestrator
    projects: ProjectService
    scratchBasePath: string
  }
  private readonly pending = new Set<Promise<unknown>>()
  private shutdownPromise: Promise<void> | null = null

  constructor(options: {
    gate: ProjectGenerationOperationGate
    models: GenerationModelResolver
    orchestrator: GenerationOrchestrator
    projects: ProjectService
    scratchBasePath: string
  }) {
    this.options = { ...options }
    this.models = captureModels(options.models)
    this.execution = options.orchestrator.createRegionalExecution()
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
    const owner = this.options.projects.getOpenDocumentForAcceptance(tabId)
    const epoch = owner?.documentEpoch
    const assertOwner = () => {
      this.assertOpen()
      if (
        !owner ||
        this.options.projects.getOpenDocumentForAcceptance(tabId) !== owner ||
        owner.documentEpoch !== epoch ||
        owner.document.documentId !== captured.documentId ||
        owner.document.documentRevision !== captured.documentRevision
      ) {
        throw new ProjectRegionalGenerationError(
          'PROJECT_CHANGED',
          'The reviewed Project changed before regional admission.',
        )
      }
    }
    assertOwner()
    return await this.track(
      this.options.gate.run(tabId, async () => {
        assertOwner()
        return await this.options.projects.withCapturedCurrentCanvasRegionalGenerationInput(
          tabId,
          async (capture) => {
            const assertCurrent = () => {
              assertOwner()
              capture.assertCurrent()
            }
            assertCurrent()
            const document = structuredClone(capture.document)
            validatePrivateDraft(document, captured)
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
            const prepared = await prepareNormalTxt2Img({
              lastActualSeed: operationalSeed,
              modelService: this.models,
              target,
            })
            assertCurrent()
            const plan = planGenerationBatch({
              baseSeed: prepared.context.sampling.seed,
              iterations: 1,
              maxJobs: 1,
              maxPrompts: 1,
              negativePrompt: prepared.context.prompts.negative,
              positivePrompt: prepared.context.prompts.positive,
              seedBehavior: 'per-iteration',
            })
            const recipe = await prepareCurrentCanvasRegionalRecipe({
              capture: capture.regional,
              job: {
                bbox: prepared.context.bbox,
                documentId: prepared.context.documentId,
                documentRevision: prepared.context.documentRevision,
                family: 'illustrious',
                item: plan.items[0],
              },
              models: this.models,
            })
            assertCurrent()
            return await withIllustriousTxt2ImgRequest({
              modelService: this.models,
              prepared,
              ready: captured.ready,
              scratchBasePath: this.options.scratchBasePath,
              use: async (request) => {
                assertCurrent()
                return await this.options.orchestrator.enqueuePreparedRegional(tabId, {
                  assertCurrent,
                  prepared,
                  regional: {
                    globalNegativeCoverage: captured.globalNegativeCoverage,
                    globalPositiveCoverage: captured.globalPositiveCoverage,
                    layout: captured.layout,
                    negativePooledSourceId: captured.negativePooledSourceId,
                    positivePooledSourceId: captured.positivePooledSourceId,
                    recipe,
                  },
                  request,
                })
              },
            })
          },
        )
      }),
    )
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ProjectRegionalGenerationError('CLOSED', 'Private regional submission has stopped.')
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

function validatePrivateDraft(
  document: IgsProjectDocumentV1,
  composition: Pick<
    ProjectRegionalGenerationSubmission,
    | 'globalNegativeCoverage'
    | 'globalPositiveCoverage'
    | 'layout'
    | 'negativePooledSourceId'
    | 'positivePooledSourceId'
  >,
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
    resolveVerifiedGenerationVaeForPlan: async (...args) =>
      structuredClone(await vae(...structuredClone(args))),
  }
}

function invalid(message: string): ProjectRegionalGenerationError {
  return new ProjectRegionalGenerationError('INPUT_INVALID', message)
}
function unsupported(message: string): ProjectRegionalGenerationError {
  return new ProjectRegionalGenerationError('UNSUPPORTED', message)
}
