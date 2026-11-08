import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  type GenerationDenoisingProgress,
  type GenerationProgressSnapshot,
  isGenerationDenoisingProgress,
} from '../../shared/projects/generation-progress.js'
import {
  supportsInferenceAnimaRegional,
  supportsInferenceAnimaRegionalImg2Img,
  supportsInferenceAnimaRegionalOutpaint,
  supportsInferenceAnimaRegionalSampling,
} from '../../shared/projects/inference-worker-capabilities.js'
import {
  isQualifiedInferenceWorkerReady,
  supportsInferenceEmbeddings,
  supportsInferenceRegionalImg2Img,
  supportsInferenceRegionalImg2ImgCFGRescale,
  supportsInferenceRegionalImg2ImgDpmpp2m,
  supportsInferenceRegionalImg2ImgEulerAncestral,
  supportsInferenceRegionalImg2ImgVae,
  supportsInferenceRegionalInvokeInitialization,
  supportsInferenceRegionalLoras,
  supportsInferenceRegionalOutpaint,
  supportsInferenceRegionalProgress,
  supportsInferenceRegionalVae,
} from '../../shared/projects/inference-worker-capabilities.js'

import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type { OutpaintInfillResolver } from '../runtime/inference-auxiliary-resources.js'
import type { AnimaGenerationModelResolver } from './anima-generation-preparation.js'
import type {
  GenerationQueueRepository,
  QueuedGenerationItem,
  VerifiedQueuedOperationalRegionalInput,
} from './generation-queue.js'
import type {
  GenerationStagingRepository,
  VerifiedGenerationCandidate,
} from './generation-staging.js'
import type { GenerationModelResolver } from './illustrious-generation-loras.js'
import type { InferenceWorkerReady } from './illustrious-txt2img-job.js'
import type {
  OperationalRegionalWorkerInput,
  RegionalWorkerResult,
} from './regional-worker-request.js'

import { reverifyFrozenQueuedAnimaGeneration } from './anima-queued-generation.js'
import { reverifyFrozenQueuedOutpaintGeneration } from './generation-queue.js'
import { reverifyFrozenGenerationEmbeddings } from './illustrious-generation-embeddings.js'
import {
  frozenLoraFieldsAgree,
  reverifyFrozenGenerationLoras,
} from './illustrious-generation-loras.js'
import { frozenVaeFieldsAgree, reverifyFrozenGenerationVae } from './illustrious-generation-vae.js'
import { parseAcceptedGenerationBaseV1 } from './regional-queued-generation.js'
import { captureOperationalRegionalWorkerInput } from './regional-worker-request.js'

export type RegionalGenerationModelResolver = Partial<AnimaGenerationModelResolver> &
  Partial<
    Pick<
      GenerationModelResolver,
      'resolveVerifiedGenerationLoraForPlan' | 'resolveVerifiedGenerationVaeForPlan'
    >
  > &
  Pick<
    GenerationModelResolver,
    | 'assertNoUnboundGenerationEmbeddings'
    | 'resolveVerifiedGenerationCheckpointForPlan'
    | 'resolveVerifiedGenerationEmbeddingForPlan'
  >

/** The private client verifies correlation and owned PNG bytes; close confirms physical exit. */
export interface RegionalGenerationTransport<
  TInput extends OperationalRegionalWorkerInput = OperationalRegionalWorkerInput,
> {
  close: () => Promise<void>
  executeCurrentCanvasRegional: (
    input: TInput,
    onProgress?: (progress: GenerationDenoisingProgress) => void,
  ) => Promise<RegionalWorkerResult>
  readonly ready: InferenceWorkerReady
}

export type RegionalGenerationProcessorResult =
  | { candidate: VerifiedGenerationCandidate; kind: 'completed'; queueItemId: string }
  | { kind: 'canceled' | 'failed'; queueItemId: string }
  | { kind: 'idle' }

interface ActiveRegionalJob {
  cancelPromise: Promise<QueuedGenerationItem> | null
  cancelSignal: Promise<{ completion: Promise<QueuedGenerationItem> }>
  dispatched: boolean
  exitUnconfirmed: boolean
  item: QueuedGenerationItem
  publication: Promise<VerifiedGenerationCandidate> | null
  publicationUncertain: boolean
  receivingProgress: boolean
  runSettled: boolean
  signalCancel: (value: { completion: Promise<QueuedGenerationItem> }) => void
  terminal: boolean
  transport: RegionalGenerationTransport
}

export class RegionalGenerationProcessorError extends Error {
  constructor(
    readonly code:
      | 'BUSY'
      | 'CLOSED'
      | 'INFERENCE_UNAVAILABLE'
      | 'PUBLICATION_UNCERTAIN'
      | 'QUEUE_CHANGED'
      | 'WORKER_EXIT_UNCONFIRMED',
    message: string,
  ) {
    super(message)
    this.name = 'RegionalGenerationProcessorError'
  }
}

function publicationUncertain(): RegionalGenerationProcessorError {
  return new RegionalGenerationProcessorError(
    'PUBLICATION_UNCERTAIN',
    'Regional candidate publication needs restart recovery.',
  )
}

function exitUnconfirmed(): RegionalGenerationProcessorError {
  return new RegionalGenerationProcessorError(
    'WORKER_EXIT_UNCONFIRMED',
    'The regional worker has not confirmed physical exit.',
  )
}

/**
 * InvokeAI a61ac4fb's saved execution/owner-bound cancellation pattern, adapted to Studio's
 * existing global queue slot and receipt transaction. This owner never reads live Project state.
 */
export class RegionalGenerationProcessor {
  private active: ActiveRegionalJob | null = null
  private claiming: Promise<VerifiedQueuedOperationalRegionalInput | null> | null = null
  private currentRun: Promise<RegionalGenerationProcessorResult> | null = null
  private readonly listeners = new Set<() => void>()
  private readonly models: RegionalGenerationModelResolver
  private progress: GenerationProgressSnapshot = { current: null, revision: 0 }
  private readonly progressListeners = new Set<(snapshot: GenerationProgressSnapshot) => void>()
  private stopping = false

  constructor(
    private readonly queue: GenerationQueueRepository,
    private readonly staging: GenerationStagingRepository,
    models: RegionalGenerationModelResolver,
    private readonly compositionProfile?: 'invoke-canvas-v1',
    private readonly infillResolver?: OutpaintInfillResolver,
  ) {
    const names = [
      'assertNoUnboundGenerationEmbeddings',
      'resolveVerifiedGenerationCheckpointForPlan',
      'resolveVerifiedGenerationEmbeddingForPlan',
    ] as const
    if (!models || names.some((name) => typeof models[name] !== 'function')) {
      throw new TypeError('Regional generation resource verification is unavailable.')
    }
    this.models = {
      ...(typeof models.resolveVerifiedGenerationAnimaBundleForPlan === 'function'
        ? {
            resolveVerifiedGenerationAnimaBundleForPlan:
              models.resolveVerifiedGenerationAnimaBundleForPlan.bind(models),
          }
        : {}),
      ...(typeof models.resolveVerifiedAnimaGenerationLoraForPlan === 'function'
        ? {
            resolveVerifiedAnimaGenerationLoraForPlan:
              models.resolveVerifiedAnimaGenerationLoraForPlan.bind(models),
          }
        : {}),
      assertNoUnboundGenerationEmbeddings: models.assertNoUnboundGenerationEmbeddings.bind(models),
      resolveVerifiedGenerationCheckpointForPlan:
        models.resolveVerifiedGenerationCheckpointForPlan.bind(models),
      resolveVerifiedGenerationEmbeddingForPlan:
        models.resolveVerifiedGenerationEmbeddingForPlan.bind(models),
      ...(typeof models.resolveVerifiedGenerationLoraForPlan === 'function'
        ? {
            resolveVerifiedGenerationLoraForPlan:
              models.resolveVerifiedGenerationLoraForPlan.bind(models),
          }
        : {}),
      ...(typeof models.resolveVerifiedGenerationVaeForPlan === 'function'
        ? {
            resolveVerifiedGenerationVaeForPlan:
              models.resolveVerifiedGenerationVaeForPlan.bind(models),
          }
        : {}),
    }
  }

  /** A pending row may cancel immediately; a running row is released only by its local owner. */
  async cancelAndWait(id: string): Promise<QueuedGenerationItem> {
    if (this.active?.item.id === id) {
      return await this.cancelActive(this.active)
    }
    const item = await this.queue.cancel(id)
    if (item.status !== 'running') {
      this.emitChanged()
      return item
    }
    if (this.active?.item.id === id) {
      return await this.cancelActive(this.active)
    }
    if (!this.currentRun || this.active) {
      throw exitUnconfirmed()
    }
    // Claim can have committed before this processor received its row. Its first check observes
    // the cancellation, and the run installs the local owner before any further await.
    await this.currentRun
    const settled = await this.queue.cancel(id)
    if (settled.status === 'running') {
      throw exitUnconfirmed()
    }
    return settled
  }

  async cancelOwnedAndWait(id: string): Promise<QueuedGenerationItem | null> {
    await this.claiming?.catch(() => undefined)
    if (this.active?.item.id === id) {
      return await this.cancelActive(this.active)
    }
    return null
  }

  getProgressSnapshot(): GenerationProgressSnapshot {
    return structuredClone(this.progress)
  }

  onChanged(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onProgress(listener: (snapshot: GenerationProgressSnapshot) => void): () => void {
    this.progressListeners.add(listener)
    return () => this.progressListeners.delete(listener)
  }

  /** Caller fences new claims first; this joins the scoped owner without permanently stopping it. */
  async quiesceForProject(input: {
    localProjectKey: string
    stagingSessionIds?: readonly string[]
  }): Promise<void> {
    const project = input.localProjectKey
    const sessions = input.stagingSessionIds ? new Set(input.stagingSessionIds) : null
    await this.claiming?.catch(() => undefined)
    const active = this.active
    if (
      !active ||
      active.item.localProjectKey !== project ||
      (sessions !== null && !sessions.has(active.item.stagingSessionId))
    ) {
      return
    }
    await this.currentRun
    if (active.publicationUncertain) {
      throw publicationUncertain()
    }
    if (this.active === active || active.exitUnconfirmed) {
      throw exitUnconfirmed()
    }
  }

  async runOne(transport: RegionalGenerationTransport): Promise<RegionalGenerationProcessorResult> {
    if (this.stopping) {
      throw new RegionalGenerationProcessorError('CLOSED', 'Regional dispatch is stopping.')
    }
    if (this.active?.publicationUncertain) {
      throw publicationUncertain()
    }
    if (this.active?.exitUnconfirmed) {
      throw exitUnconfirmed()
    }
    if (this.currentRun || this.active) {
      throw new RegionalGenerationProcessorError(
        'BUSY',
        'A regional job is already being processed.',
      )
    }
    const ready = structuredClone(transport.ready)
    if (this.compositionProfile !== 'invoke-canvas-v1' || !supportsInferenceAnimaRegional(ready)) {
      requireRegionalReady(ready, this.compositionProfile)
    }
    const capturedTransport: RegionalGenerationTransport = {
      close: transport.close.bind(transport),
      executeCurrentCanvasRegional: transport.executeCurrentCanvasRegional.bind(transport),
      ready,
    }
    this.queue.assertReadyForDispatch()
    this.staging.assertReadyForPublication()
    const run = this.runOneInternal(capturedTransport)
    this.currentRun = run
    try {
      return await run
    } finally {
      if (this.currentRun === run) {
        this.currentRun = null
      }
      this.emitChanged()
    }
  }

  /** Permanently stop this owner, including a claim which has not resolved yet. */
  async stopAndCancelActive(): Promise<void> {
    this.stopping = true
    if (this.active) {
      await this.cancelActive(this.active)
    }
    await this.currentRun
    if (this.active?.publicationUncertain) {
      throw publicationUncertain()
    }
    if (this.active) {
      throw exitUnconfirmed()
    }
  }

  private cancelActive(active: ActiveRegionalJob): Promise<QueuedGenerationItem> {
    this.clearProgress(active)
    if (active.publicationUncertain) {
      return Promise.reject(publicationUncertain())
    }
    if (!active.cancelPromise) {
      const operation = (async () => {
        if (active.publication) {
          // Publication already owns the receipt/manifest transaction. Join it before changing
          // its row; a completed candidate wins, and an uncertain receipt belongs to recovery.
          try {
            await active.publication
          } catch {
            let reserved = true
            try {
              reserved = await this.staging.hasPublicationReceipt(active.item.id)
            } catch {
              /* An unreadable receipt is uncertain. */
            }
            if (reserved) {
              active.publicationUncertain = true
              throw publicationUncertain()
            }
          }
        }
        const item = await this.queue.cancel(active.item.id)
        this.emitChanged()
        if (item.status !== 'running' || !item.cancelRequested) {
          active.terminal = item.status !== 'running'
          this.releaseIfSettled(active)
          return item
        }
        active.exitUnconfirmed = true
        try {
          await active.transport.close()
        } catch {
          throw exitUnconfirmed()
        }
        const canceled = await this.queue.acknowledgeCanceledRunning(item.id, item.statusSequence)
        active.exitUnconfirmed = false
        active.terminal = true
        this.releaseIfSettled(active)
        this.emitChanged()
        return canceled
      })()
      active.cancelPromise = operation
      active.signalCancel({ completion: operation })
      void operation.catch(() => {
        if (active.cancelPromise === operation) {
          active.cancelPromise = null
        }
      })
    }
    return active.cancelPromise
  }

  private clearProgress(active: ActiveRegionalJob): void {
    active.receivingProgress = false
    if (this.progress.current?.jobId === active.item.id) {
      this.publishProgress(null)
    }
  }

  private emitChanged(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        /* Presentation observers cannot change queue or worker ownership. */
      }
    }
  }

  private publishProgress(current: GenerationProgressSnapshot['current']): void {
    this.progress = { current, revision: this.progress.revision + 1 }
    for (const listener of this.progressListeners) {
      try {
        listener(this.getProgressSnapshot())
      } catch {
        /* Presentation observers cannot mutate telemetry, queue or worker ownership. */
      }
    }
  }

  private releaseIfSettled(active: ActiveRegionalJob): void {
    if (
      active.runSettled &&
      active.terminal &&
      !active.exitUnconfirmed &&
      !active.publicationUncertain &&
      this.active === active
    ) {
      this.active = null
    }
  }

  private async reverifyResources(
    claimed: VerifiedQueuedOperationalRegionalInput,
    input: OperationalRegionalWorkerInput,
  ): Promise<void> {
    if (
      claimed.payload.kind === 'anima-regional-txt2img' ||
      claimed.payload.kind === 'anima-regional-img2img' ||
      claimed.payload.kind === 'anima-regional-outpaint'
    ) {
      const resolveVerifiedGenerationAnimaBundleForPlan =
        this.models.resolveVerifiedGenerationAnimaBundleForPlan
      const resolveVerifiedAnimaGenerationLoraForPlan =
        this.models.resolveVerifiedAnimaGenerationLoraForPlan
      if (
        input.compositionProfile !== 'invoke-krea2-global-support-v1' ||
        !resolveVerifiedGenerationAnimaBundleForPlan ||
        !resolveVerifiedAnimaGenerationLoraForPlan
      ) {
        throw new Error('The frozen Anima resource verifier is unavailable.')
      }
      const base = parseAcceptedGenerationBaseV1(JSON.stringify(claimed.payload))
      if (base.kind === 'anima-outpaint' && claimed.payload.kind === 'anima-regional-outpaint') {
        if (input.request.type !== 'generate-anima-outpaint' || !this.infillResolver) {
          throw new Error('The frozen Anima OUT resource verifier is unavailable.')
        }
        const infill = await this.infillResolver.resolveVerifiedOutpaintInfill()
        if (
          !isDeepStrictEqual(
            {
              byteSize: infill.byteSize,
              path: infill.managedPath,
              role: infill.role,
              sha256: infill.sha256,
            },
            claimed.payload.outpaintInfill,
          ) ||
          !isDeepStrictEqual(input.request.job.conditioning, claimed.payload.context.conditioning)
        ) {
          throw new Error('The frozen Anima OUT resource or alpha identity changed.')
        }
        await reverifyFrozenQueuedOutpaintGeneration(
          base,
          this.models as AnimaGenerationModelResolver & GenerationModelResolver,
          { resolveVerifiedOutpaintInfill: async () => infill },
        )
        return
      }
      if (base.kind !== 'anima-txt2img' && base.kind !== 'anima-img2img') {
        throw new Error('The frozen Anima regional base is invalid.')
      }
      await reverifyFrozenQueuedAnimaGeneration(base, {
        resolveVerifiedAnimaGenerationLoraForPlan,
        resolveVerifiedGenerationAnimaBundleForPlan,
      })
      return
    }
    if (input.compositionProfile === 'invoke-krea2-global-support-v1') {
      throw new Error('The frozen regional family differs.')
    }
    const { context, workerJob } = claimed.payload
    if (claimed.payload.kind === 'illustrious-regional-outpaint') {
      if (input.request.type !== 'generate-illustrious-outpaint' || !this.infillResolver) {
        throw new Error('The frozen regional infill verifier is unavailable.')
      }
      const actual = await this.infillResolver.resolveVerifiedOutpaintInfill()
      if (
        !isDeepStrictEqual(
          {
            byteSize: actual.byteSize,
            path: actual.managedPath,
            role: actual.role,
            sha256: actual.sha256,
          },
          claimed.payload.outpaintInfill,
        ) ||
        !isDeepStrictEqual(input.request.job.conditioning, claimed.payload.context.conditioning)
      ) {
        throw new Error('The frozen regional infill or conditioning changed.')
      }
    }
    if (!frozenLoraFieldsAgree(context, input.request.job.loras)) {
      throw new Error('The frozen regional LoRA stack differs from its command.')
    }
    if (
      input.compositionProfile === 'invoke-canvas-v1' &&
      (!frozenVaeFieldsAgree(context, input.request.job.vae) ||
        context.vaePrecision !== input.request.job.vaePrecision)
    ) {
      throw new Error('The frozen regional VAE or precision differs from its command.')
    }
    const verified = await this.models.resolveVerifiedGenerationCheckpointForPlan(
      structuredClone(context.model.reference),
    )
    if (
      verified.managedPath !== context.model.managedPath ||
      verified.managedPath !== workerJob.checkpoint.path ||
      !isDeepStrictEqual(verified.reference, context.model.reference) ||
      !isDeepStrictEqual(verified.noiseProfile, context.sampling.noiseProfile) ||
      !isDeepStrictEqual(verified.noiseProfile, workerJob.sampling.noiseProfile)
    ) {
      throw new Error('The exact regional checkpoint or resolved policy changed.')
    }
    if ((context.loras?.length ?? 0) > 0) {
      const resolveVerifiedGenerationLoraForPlan = this.models.resolveVerifiedGenerationLoraForPlan
      if (!resolveVerifiedGenerationLoraForPlan) {
        throw new Error('The frozen regional LoRA resource verifier is unavailable.')
      }
      await reverifyFrozenGenerationLoras(context, { resolveVerifiedGenerationLoraForPlan })
    }
    if (input.compositionProfile === 'invoke-canvas-v1' && context.vae) {
      const resolveVerifiedGenerationVaeForPlan = this.models.resolveVerifiedGenerationVaeForPlan
      if (!resolveVerifiedGenerationVaeForPlan) {
        throw new Error('The frozen regional VAE resource verifier is unavailable.')
      }
      await reverifyFrozenGenerationVae(context, { resolveVerifiedGenerationVaeForPlan })
    }
    const recipe = input.recipe
    const pairs = [
      {
        embeddings: recipe.globalEmbeddings,
        negative: recipe.globalPrompts.negative,
        positive: recipe.globalPrompts.positive,
      },
      ...recipe.regions.map((region) => ({
        embeddings: region.embeddings,
        negative: region.negative.prompt,
        positive: region.positive ?? { embeddingRefs: [], text: '' },
      })),
    ]
    for (const pair of pairs) {
      if (!pair.embeddings) {
        throw new Error('The frozen regional resource descriptors are absent.')
      }
      await this.models.assertNoUnboundGenerationEmbeddings({
        modelFamily: 'illustrious',
        negativePrompt: structuredClone(pair.negative),
        positivePrompt: structuredClone(pair.positive),
      })
      await reverifyFrozenGenerationEmbeddings(
        {
          embeddingRefs: {
            negative: pair.negative.embeddingRefs,
            positive: pair.positive.embeddingRefs,
          },
          embeddings: pair.embeddings,
          prompts: { negative: pair.negative.text, positive: pair.positive.text },
        },
        this.models,
      )
    }
  }

  private async runOneInternal(
    transport: RegionalGenerationTransport,
  ): Promise<RegionalGenerationProcessorResult> {
    const claiming =
      this.compositionProfile === 'invoke-canvas-v1'
        ? this.queue.claimNextPendingInvokeCanvasRegional()
        : this.queue.claimNextPendingRegional()
    this.claiming = claiming
    let claimed: VerifiedQueuedOperationalRegionalInput | null
    try {
      claimed = await claiming
    } finally {
      if (this.claiming === claiming) {
        this.claiming = null
      }
    }
    if (!claimed) {
      return { kind: 'idle' }
    }
    let signalCancel!: ActiveRegionalJob['signalCancel']
    const cancelSignal = new Promise<{ completion: Promise<QueuedGenerationItem> }>((resolve) => {
      signalCancel = resolve
    })
    const active: ActiveRegionalJob = {
      cancelPromise: null,
      cancelSignal,
      dispatched: false,
      exitUnconfirmed: false,
      item: claimed.item,
      publication: null,
      publicationUncertain: false,
      receivingProgress: false,
      runSettled: false,
      signalCancel,
      terminal: false,
      transport,
    }
    this.active = active
    this.emitChanged()
    try {
      if (!(await this.stillRunning(active))) {
        return { kind: 'canceled', queueItemId: claimed.item.id }
      }
      const input = captureOperationalRegionalWorkerInput(claimed.input)
      if (input.compositionProfile === 'invoke-krea2-global-support-v1') {
        if (
          !supportsInferenceAnimaRegional(transport.ready) ||
          (input.request.type === 'generate-anima-outpaint' &&
            !supportsInferenceAnimaRegionalOutpaint(transport.ready)) ||
          (input.request.type === 'generate-anima-img2img' &&
            !supportsInferenceAnimaRegionalImg2Img(transport.ready)) ||
          (input.request.job.sampling.scheduler !== 'euler' &&
            !supportsInferenceAnimaRegionalSampling(transport.ready))
        ) {
          throw new RegionalGenerationProcessorError(
            'INFERENCE_UNAVAILABLE',
            'The worker has not qualified Anima Regional Guidance.',
          )
        }
      } else {
        requireRegionalReady(transport.ready, this.compositionProfile)
        if (
          input.request.type === 'generate-illustrious-outpaint' &&
          !supportsInferenceRegionalOutpaint(transport.ready)
        ) {
          throw new RegionalGenerationProcessorError(
            'INFERENCE_UNAVAILABLE',
            'The worker has not qualified outpaint with Regional Guidance.',
          )
        }
        if (
          input.request.type !== 'generate-illustrious-txt2img' &&
          !supportsInferenceRegionalImg2Img(transport.ready)
        ) {
          throw new RegionalGenerationProcessorError(
            'INFERENCE_UNAVAILABLE',
            'The worker has not qualified opaque Regional Guidance img2img.',
          )
        }
        if (
          input.request.type !== 'generate-illustrious-txt2img' &&
          input.request.job.sampling.scheduler === 'euler_a' &&
          !supportsInferenceRegionalImg2ImgEulerAncestral(transport.ready)
        ) {
          throw new RegionalGenerationProcessorError(
            'INFERENCE_UNAVAILABLE',
            'The worker has not qualified Euler a with opaque regional img2img.',
          )
        }
        if (
          input.request.type !== 'generate-illustrious-txt2img' &&
          (input.request.job.sampling.scheduler === 'dpmpp_2m' ||
            input.request.job.sampling.scheduler === 'dpmpp_2m_k') &&
          !supportsInferenceRegionalImg2ImgDpmpp2m(transport.ready)
        ) {
          throw new RegionalGenerationProcessorError(
            'INFERENCE_UNAVAILABLE',
            'The worker has not qualified DPM++ 2M with opaque regional img2img.',
          )
        }
        if (
          input.request.type !== 'generate-illustrious-txt2img' &&
          (input.request.job.sampling.cfgRescale ?? 0) !== 0 &&
          !supportsInferenceRegionalImg2ImgCFGRescale(transport.ready)
        ) {
          throw new RegionalGenerationProcessorError(
            'INFERENCE_UNAVAILABLE',
            'The worker has not qualified CFG Rescale with opaque regional img2img.',
          )
        }
        if (
          input.request.type !== 'generate-illustrious-txt2img' &&
          (input.request.job.vae != null ||
            (input.request.job.vaePrecision ?? 'Auto') !== 'FP16') &&
          !supportsInferenceRegionalImg2ImgVae(transport.ready)
        ) {
          throw new RegionalGenerationProcessorError(
            'INFERENCE_UNAVAILABLE',
            'The worker has not qualified selected VAE and precision with opaque regional img2img.',
          )
        }
        if (
          input.compositionProfile === 'invoke-canvas-v1' &&
          (input.request.job.vae != null ||
            (input.request.job.vaePrecision ?? 'Auto') !== 'FP16') &&
          !supportsInferenceRegionalVae(transport.ready)
        ) {
          throw new RegionalGenerationProcessorError(
            'INFERENCE_UNAVAILABLE',
            'The worker has not qualified the frozen regional VAE or precision.',
          )
        }
        if (
          input.compositionProfile === 'invoke-canvas-v1' &&
          (input.request.job.loras?.length ?? 0) > 0 &&
          !supportsInferenceRegionalLoras(transport.ready)
        ) {
          throw new RegionalGenerationProcessorError(
            'INFERENCE_UNAVAILABLE',
            'The worker has not qualified the frozen global LoRA stack.',
          )
        }
        if (
          input.compositionProfile === 'invoke-canvas-v1' &&
          ((input.request.job.embeddings?.positive.length ?? 0) > 0 ||
            (input.request.job.embeddings?.negative.length ?? 0) > 0) &&
          !supportsInferenceEmbeddings(transport.ready)
        ) {
          throw new RegionalGenerationProcessorError(
            'INFERENCE_UNAVAILABLE',
            'The worker has not qualified the frozen global embedding resources.',
          )
        }
        if (
          input.initializationProfile !== undefined &&
          !supportsInferenceRegionalInvokeInitialization(transport.ready)
        ) {
          throw new RegionalGenerationProcessorError(
            'INFERENCE_UNAVAILABLE',
            'The worker has not qualified the frozen regional initialization policy.',
          )
        }
      }
      input.request = { ...input.request, requestId: randomUUID() }
      await this.reverifyResources(claimed, input)
      if (!(await this.stillRunning(active))) {
        return { kind: 'canceled', queueItemId: claimed.item.id }
      }
      active.dispatched = true
      active.receivingProgress = true
      const expectedTotalSteps =
        input.request.type === 'generate-anima-txt2img' ||
        input.request.type === 'generate-anima-img2img' ||
        input.request.type === 'generate-anima-outpaint'
          ? input.request.job.sampling.totalSteps
          : input.request.job.sampling.steps
      const onProgress = (progress: GenerationDenoisingProgress): void => {
        if (
          this.active !== active ||
          !active.receivingProgress ||
          active.cancelPromise ||
          active.exitUnconfirmed ||
          this.stopping ||
          !(input.compositionProfile === 'invoke-krea2-global-support-v1'
            ? supportsInferenceAnimaRegional(transport.ready)
            : supportsInferenceRegionalProgress(transport.ready)) ||
          !isGenerationDenoisingProgress(progress) ||
          (input.request.type === 'generate-illustrious-img2img' ||
          input.request.type === 'generate-illustrious-outpaint'
            ? input.request.job.sampling.denoisingStrength === 0 ||
              progress.totalSteps > expectedTotalSteps
            : progress.totalSteps !== expectedTotalSteps)
        ) {
          return
        }
        const previous = this.progress.current
        if (
          previous &&
          (previous.totalSteps !== progress.totalSteps || previous.step >= progress.step)
        ) {
          return
        }
        this.publishProgress({
          documentId: claimed.payload.context.documentId,
          jobId: claimed.item.id,
          projectKey: claimed.item.localProjectKey,
          statusSequence: claimed.item.statusSequence,
          step: progress.step,
          totalSteps: progress.totalSteps,
        })
      }
      const outcome = await Promise.race([
        transport
          .executeCurrentCanvasRegional(input, onProgress)
          .then((result) => ({ kind: 'done' as const, result })),
        active.cancelSignal.then(({ completion }) => ({ completion, kind: 'cancel' as const })),
      ])
      this.clearProgress(active)
      if (outcome.kind === 'cancel') {
        await outcome.completion
        return { kind: 'canceled', queueItemId: claimed.item.id }
      }
      if (!(await this.stillRunning(active))) {
        return { kind: 'canceled', queueItemId: claimed.item.id }
      }
      requireRegionalResult(outcome.result, input)
      // The client has already disposed its historical output.path. Only the owned verified
      // PNG bytes cross into the existing Main receipt/files/completion owner.
      active.publication = this.staging.publishRegionalCandidate({
        actualSeed: outcome.result.seed,
        expectedStatusSequence: claimed.item.statusSequence,
        pngBytes: outcome.result.pngBytes,
        queueItemId: claimed.item.id,
      })
      const candidate = await active.publication
      active.terminal = true
      return { candidate, kind: 'completed', queueItemId: claimed.item.id }
    } catch {
      this.clearProgress(active)
      if (active.cancelPromise) {
        const canceled = await active.cancelPromise
        if (canceled.status === 'completed' && active.publication) {
          return {
            candidate: await active.publication,
            kind: 'completed',
            queueItemId: claimed.item.id,
          }
        }
        return { kind: 'canceled', queueItemId: claimed.item.id }
      }
      if (active.exitUnconfirmed) {
        throw exitUnconfirmed()
      }
      if (active.publication) {
        let reserved = true
        try {
          reserved = await this.staging.hasPublicationReceipt(claimed.item.id)
        } catch {
          /* An unreadable receipt is uncertain. */
        }
        if (reserved) {
          active.publicationUncertain = true
          throw publicationUncertain()
        }
      }
      if (active.dispatched) {
        active.exitUnconfirmed = true
        try {
          await transport.close()
        } catch {
          throw exitUnconfirmed()
        }
        active.exitUnconfirmed = false
      }
      try {
        await this.queue.failRunning(claimed.item.id, claimed.item.statusSequence, {
          code: active.dispatched ? 'GENERATION_WORKER_FAILED' : 'GENERATION_INPUT_CHANGED',
          message: active.dispatched
            ? 'Regional execution did not return a verified completed result.'
            : 'The frozen regional input could not be verified.',
        })
      } catch (failure) {
        const current = await this.queue.loadVerifiedOperationalRegionalInput(claimed.item.id)
        if (!current.item.cancelRequested) {
          throw failure
        }
        await this.cancelActive(active)
        return { kind: 'canceled', queueItemId: claimed.item.id }
      }
      active.terminal = true
      // The public result carries a normalized failure; exact native diagnostics remain with the
      // existing worker error owner, rather than exposing arbitrary exception text as queue data.
      return { kind: 'failed', queueItemId: claimed.item.id }
    } finally {
      this.clearProgress(active)
      active.runSettled = true
      this.releaseIfSettled(active)
    }
  }

  private async stillRunning(active: ActiveRegionalJob): Promise<boolean> {
    if (active.cancelPromise) {
      await active.cancelPromise
      return false
    }
    if (this.stopping) {
      await this.cancelActive(active)
      return false
    }
    const current = await this.queue.loadVerifiedOperationalRegionalInput(active.item.id)
    if (current.item.status === 'running' && current.item.cancelRequested) {
      await this.cancelActive(active)
      return false
    }
    if (
      current.item.status !== 'running' ||
      current.item.statusSequence !== active.item.statusSequence
    ) {
      throw new RegionalGenerationProcessorError(
        'QUEUE_CHANGED',
        'The regional queue claim changed.',
      )
    }
    if (active.cancelPromise) {
      await active.cancelPromise
      return false
    }
    return true
  }
}

function requireRegionalReady(
  ready: InferenceWorkerReady,
  compositionProfile?: 'invoke-canvas-v1',
): void {
  if (
    !isQualifiedInferenceWorkerReady(ready) ||
    !ready.capabilities.includes(
      compositionProfile === 'invoke-canvas-v1'
        ? 'illustrious-regional-invoke-v1'
        : 'private-current-canvas-regional-v1',
    )
  ) {
    throw new RegionalGenerationProcessorError(
      'INFERENCE_UNAVAILABLE',
      'The worker has not qualified private regional execution.',
    )
  }
}

function requireRegionalResult(
  result: RegionalWorkerResult,
  input: OperationalRegionalWorkerInput,
): void {
  if (
    !result ||
    !Buffer.isBuffer(result.pngBytes) ||
    result.seed !== input.request.job.sampling.seed ||
    result.output.byteSize !== result.pngBytes.length ||
    result.output.sha256 !== createHash('sha256').update(result.pngBytes).digest('hex') ||
    result.output.width !== input.request.job.bbox.width ||
    result.output.height !== input.request.job.bbox.height ||
    result.output.iccSha256 !== IGS_SRGB_ICC_SHA256 ||
    result.output.colorSpace !== 'srgb'
  ) {
    throw new Error('The regional completion differs from its owned output bytes or request.')
  }
}
