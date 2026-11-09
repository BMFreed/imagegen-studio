import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type {
  GenerationDenoisingProgress,
  GenerationProgressSnapshot,
} from '../../shared/projects/generation-progress.js'
import { isGenerationDenoisingProgress } from '../../shared/projects/generation-progress.js'
import {
  isQualifiedInferenceWorkerReady,
  supportsInferenceAnima,
  supportsInferenceDenoisingProgress,
  supportsInferenceSmartPatchRegionalMode,
} from '../../shared/projects/inference-worker-capabilities.js'

import { randomUUID } from 'node:crypto'
import { lstat, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  GenerationQueueRepository,
  QueuedGenerationItem,
  VerifiedQueuedSmartPatchInput,
} from './generation-queue.js'
import type { InferenceWorkerReady } from './illustrious-txt2img-job.js'
import type { SmartPatchExecutionModelResolver } from './project-smart-patch-execution.js'
import type {
  SmartPatchExecutionRequest,
  SmartPatchExecutionResult,
} from './smart-patch-execution-request.js'
import type {
  SmartPatchGenerationStagingRepository,
  VerifiedSmartPatchWorldCandidate,
} from './smart-patch-generation-staging.js'
import type { ProjectWorkerClient } from './worker-client.js'

import {
  captureSmartPatchModelResolver,
  reverifyFrozenSmartPatchInput,
} from './project-smart-patch-execution.js'
import {
  bindSmartPatchIllustriousRegionalExecution,
  type BoundSmartPatchIllustriousRegionalInput,
} from './project-smart-patch-illustrious-regional-input.js'
import {
  bindSmartPatchAnimaRegionalExecution,
  type BoundSmartPatchAnimaRegionalInput,
} from './project-smart-patch-regional-input.js'
import { composeSmartPatchWorldContribution } from './project-smart-patch-world-output.js'
import {
  captureSmartPatchExecutionRequest,
  requireSmartPatchActualSeed,
} from './smart-patch-execution-request.js'
import {
  hydrateFrozenSmartPatchAnimaRegionalInput,
  hydrateFrozenSmartPatchIllustriousRegionalInput,
} from './smart-patch-frozen-input.js'
import { readSmartPatchModelSourceOutput } from './worker-client.js'

export interface SmartPatchInferenceTransport {
  close: () => Promise<void>
  executeAnimaSmartPatchRegional?: (
    input: BoundSmartPatchAnimaRegionalInput,
    onProgress?: (progress: GenerationDenoisingProgress) => void,
  ) => Promise<SmartPatchExecutionResult>
  executeIllustriousSmartPatchRegional?: (
    input: BoundSmartPatchIllustriousRegionalInput,
    onProgress?: (progress: GenerationDenoisingProgress) => void,
  ) => Promise<SmartPatchExecutionResult>
  executeSmartPatch: (
    request: SmartPatchExecutionRequest,
    onProgress?: (progress: GenerationDenoisingProgress) => void,
  ) => Promise<SmartPatchExecutionResult>
  readonly ready: InferenceWorkerReady
}
export type SmartPatchOutputWorker = Pick<ProjectWorkerClient, 'close' | 'composeSmartPatchOutput'>
export interface SmartPatchOutputWorkerOwner {
  /** Optional retry for a failed startup that retained its child before returning an object. */
  confirmUnconfirmedStartupExit?: () => Promise<void>
  /** Startup rejection must confirm physical exit, or report WORKER_EXIT_UNCONFIRMED. */
  start: (signal: AbortSignal) => Promise<SmartPatchOutputWorker>
}
export type SmartPatchProcessorResult =
  | { candidate: VerifiedSmartPatchWorldCandidate; kind: 'completed'; queueItemId: string }
  | { kind: 'canceled' | 'failed'; queueItemId: string }
  | { kind: 'idle' }

export interface SmartPatchProcessorProjectScope {
  localProjectKey: string
  stagingSessionIds?: readonly string[]
}

type Active = {
  abort: AbortController
  cancelPromise: Promise<QueuedGenerationItem> | null
  cpu: Promise<SmartPatchOutputWorker> | null
  dispatched: boolean
  exitUnconfirmed: boolean
  item: QueuedGenerationItem
  publicationUncertain: boolean
  publishing: boolean
  receivingProgress: boolean
  root: string | null
  rootIdentity: { dev: number; ino: number } | null
  runSettled: boolean
  transport: SmartPatchInferenceTransport
  work: Promise<VerifiedSmartPatchWorldCandidate> | null
}

export class SmartPatchProcessorError extends Error {
  constructor(
    readonly code:
      | 'BUSY'
      | 'CANCELED'
      | 'CLOSED'
      | 'INFERENCE_UNAVAILABLE'
      | 'PUBLICATION_UNCERTAIN'
      | 'WORKER_EXIT_UNCONFIRMED',
    message: string,
  ) {
    super(message)
    this.name = 'SmartPatchProcessorError'
  }
}

/** Private dedicated owner. It never sends Patch candidates to normal Results or Raster Add. */
export class SmartPatchGenerationProcessor {
  private active: Active | null = null
  private claiming: Promise<VerifiedQueuedSmartPatchInput | null> | null = null
  private currentRun: Promise<SmartPatchProcessorResult> | null = null
  private readonly listeners = new Set<() => void>()
  private readonly models: SmartPatchExecutionModelResolver
  private readonly outputOwner: SmartPatchOutputWorkerOwner
  private progress: GenerationProgressSnapshot = { current: null, revision: 0 }
  private readonly progressListeners = new Set<(snapshot: GenerationProgressSnapshot) => void>()
  private stopping = false

  constructor(
    private readonly queue: GenerationQueueRepository,
    private readonly staging: SmartPatchGenerationStagingRepository,
    models: SmartPatchExecutionModelResolver,
    private readonly scratchBasePath: string,
    outputOwner: SmartPatchOutputWorkerOwner,
  ) {
    this.models = captureSmartPatchModelResolver(models)
    this.outputOwner = {
      start: outputOwner.start.bind(outputOwner),
      ...(outputOwner.confirmUnconfirmedStartupExit
        ? {
            confirmUnconfirmedStartupExit:
              outputOwner.confirmUnconfirmedStartupExit.bind(outputOwner),
          }
        : {}),
    }
  }

  async cancelAndWait(id: string): Promise<QueuedGenerationItem> {
    if (this.active?.item.id === id) {
      return await this.cancelActive(this.active)
    }
    const row = await this.queue.cancel(id)
    if (row.status !== 'running') {
      return row
    }
    if (this.active?.item.id === id) {
      return await this.cancelActive(this.active)
    }
    if (!this.currentRun || this.active) {
      throw new SmartPatchProcessorError(
        'WORKER_EXIT_UNCONFIRMED',
        'The running Smart Patch has no confirmed local owner.',
      )
    }
    await this.currentRun
    const settled = await this.queue.cancel(id)
    if (settled.status === 'running') {
      throw new SmartPatchProcessorError(
        'WORKER_EXIT_UNCONFIRMED',
        'The Smart Patch worker has not confirmed exit.',
      )
    }
    return settled
  }

  /** Route cancellation only to the actual local owner; never mutate a different owner's row. */
  async cancelOwnedAndWait(id: string): Promise<QueuedGenerationItem | null> {
    await this.claiming?.catch(() => undefined)
    return this.active?.item.id === id ? await this.cancelActive(this.active) : null
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

  /** Join a scoped claim/publication without permanently stopping this reusable private owner. */
  async quiesceForProject(input: SmartPatchProcessorProjectScope): Promise<void> {
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
    if (this.active === active || active.exitUnconfirmed || active.publicationUncertain) {
      throw new SmartPatchProcessorError(
        'WORKER_EXIT_UNCONFIRMED',
        'The scoped Smart Patch owner has not confirmed publication and cleanup.',
      )
    }
  }

  async runOne(transport: SmartPatchInferenceTransport): Promise<SmartPatchProcessorResult> {
    if (this.stopping) {
      throw new SmartPatchProcessorError('CLOSED', 'Smart Patch dispatch is stopping.')
    }
    if (this.currentRun || this.active) {
      throw new SmartPatchProcessorError('BUSY', 'A Smart Patch job still has an owner.')
    }
    const regionalExecution = transport.executeAnimaSmartPatchRegional
    const illustriousRegionalExecution = transport.executeIllustriousSmartPatchRegional
    const captured: SmartPatchInferenceTransport = {
      ...(typeof regionalExecution === 'function'
        ? { executeAnimaSmartPatchRegional: regionalExecution.bind(transport) }
        : {}),
      ...(typeof illustriousRegionalExecution === 'function'
        ? { executeIllustriousSmartPatchRegional: illustriousRegionalExecution.bind(transport) }
        : {}),
      close: transport.close.bind(transport),
      executeSmartPatch: transport.executeSmartPatch.bind(transport),
      ready: structuredClone(transport.ready),
    }
    if (
      !isQualifiedInferenceWorkerReady(captured.ready) ||
      captured.ready.workerVersion !== '0.14.0' ||
      !captured.ready.capabilities.includes('smart-patch-execution') ||
      !captured.ready.capabilities.includes('smart-patch-seed-confirmation')
    ) {
      throw new SmartPatchProcessorError(
        'INFERENCE_UNAVAILABLE',
        'The worker has not qualified Smart Patch seed confirmation.',
      )
    }
    this.queue.assertReadyForDispatch()
    this.staging.assertReadyForPublication()
    const run = this.runInternal(captured)
    this.currentRun = run
    try {
      return await run
    } finally {
      if (this.currentRun === run) {
        this.currentRun = null
      }
    }
  }

  async stopAndCancelActive(): Promise<void> {
    this.stopping = true
    if (this.active) {
      await this.cancelActive(this.active)
    }
    if (this.currentRun) {
      await this.currentRun
    }
    if (this.active) {
      throw new SmartPatchProcessorError(
        'WORKER_EXIT_UNCONFIRMED',
        'The stopped Smart Patch owner still retains an unresolved operation.',
      )
    }
  }

  private async assertOwnedScratch(active: Active): Promise<void> {
    if (!active.root) {
      return
    }
    const current = await lstat(active.root)
    if (
      !active.rootIdentity ||
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.dev !== active.rootIdentity.dev ||
      current.ino !== active.rootIdentity.ino ||
      (current.mode & 0o777) !== 0o700 ||
      (process.getuid?.() !== undefined && current.uid !== process.getuid()) ||
      (await realpath(active.root)) !== active.root
    ) {
      throw new Error('The owned Smart Patch scratch directory was replaced.')
    }
  }

  private async assertRunning(active: Active): Promise<void> {
    if (active.abort.signal.aborted || this.stopping) {
      throw new SmartPatchProcessorError('CANCELED', 'Smart Patch execution was canceled.')
    }
    await this.assertOwnedScratch(active)
    const row = await this.queue.getManagerEntry(active.item.id)
    if (
      active.abort.signal.aborted ||
      this.stopping ||
      row.status !== 'running' ||
      row.cancelRequested ||
      row.statusSequence !== active.item.statusSequence
    ) {
      throw new SmartPatchProcessorError('CANCELED', 'The frozen Smart Patch job changed.')
    }
  }

  private cancelActive(active: Active): Promise<QueuedGenerationItem> {
    if (!active.cancelPromise) {
      this.clearProgress(active)
      active.abort.abort()
      active.exitUnconfirmed = true
      const operation = (async () => {
        const requested = await this.queue.cancel(active.item.id)
        if (requested.status === 'running' && requested.cancelRequested) {
          await this.closeOwned(active, true)
          // Work includes CPU startup, inference, readback AND publication; never ACK a live writer.
          await active.work?.catch(() => undefined)
          const row = await this.queue.cancel(active.item.id)
          const canceled =
            row.status === 'running'
              ? await this.queue.acknowledgeCanceledRunning(row.id, row.statusSequence)
              : row
          active.exitUnconfirmed = false
          active.publicationUncertain = false
          if (active.runSettled) {
            await this.release(active)
          }
          return canceled
        }
        await active.work?.catch(() => undefined)
        active.exitUnconfirmed = false
        if (active.runSettled && !active.publicationUncertain) {
          await this.release(active)
        }
        return requested
      })()
      active.cancelPromise = operation
      void operation.catch(() => {
        if (active.cancelPromise === operation) {
          active.cancelPromise = null
        }
      })
    }
    return active.cancelPromise
  }

  private clearProgress(active: Active): void {
    active.receivingProgress = false
    if (this.progress.current?.jobId === active.item.id) {
      this.publishProgress(null)
    }
  }

  private async closeOwned(active: Active, inference: boolean): Promise<void> {
    const closes: Promise<unknown>[] = []
    if (inference) {
      closes.push(Promise.resolve().then(() => active.transport.close()))
    }
    if (active.cpu) {
      closes.push(
        active.cpu.then(
          (cpu) => cpu.close(),
          async (error: unknown) => {
            if (unconfirmed(error)) {
              if (!this.outputOwner.confirmUnconfirmedStartupExit) {
                throw error
              }
              await this.outputOwner.confirmUnconfirmedStartupExit()
            }
          },
        ),
      )
    }
    const results = await Promise.allSettled(closes)
    if (results.some((result) => result.status === 'rejected')) {
      active.exitUnconfirmed = true
      throw new SmartPatchProcessorError(
        'WORKER_EXIT_UNCONFIRMED',
        'A Smart Patch child has not confirmed physical exit.',
      )
    }
  }

  private emitChanged(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        /* Observers do not own processing/publication. */
      }
    }
  }

  private async execute(
    active: Active,
    claimed: VerifiedQueuedSmartPatchInput,
  ): Promise<VerifiedSmartPatchWorldCandidate> {
    const payload = claimed.payload
    const regionalExecution =
      payload.item.family === 'illustrious'
        ? active.transport.executeIllustriousSmartPatchRegional
        : active.transport.executeAnimaSmartPatchRegional
    await this.assertRunning(active)
    if (
      payload.regional !== undefined &&
      (!supportsInferenceSmartPatchRegionalMode(
        active.transport.ready,
        payload.item.family,
        payload.mode,
      ) ||
        !regionalExecution)
    ) {
      throw new SmartPatchProcessorError(
        'INFERENCE_UNAVAILABLE',
        `The worker has not qualified ${payload.item.family} Smart ${payload.mode} with Regional Guidance.`,
      )
    }
    if (payload.item.family === 'anima' && !supportsInferenceAnima(active.transport.ready)) {
      throw new SmartPatchProcessorError(
        'INFERENCE_UNAVAILABLE',
        'The worker has not qualified Anima inference.',
      )
    }
    await reverifyFrozenSmartPatchInput(
      {
        files: claimed.bundle.files,
        manifest: { ...claimed.bundle.manifest, items: [payload.item] },
      },
      this.models,
    )
    await this.assertRunning(active)
    const base = await lstat(this.scratchBasePath)
    if (
      !base.isDirectory() ||
      (base.mode & 0o002) !== 0 ||
      base.isSymbolicLink() ||
      (await realpath(this.scratchBasePath)) !== this.scratchBasePath ||
      (process.getuid?.() !== undefined && base.uid !== process.getuid())
    ) {
      throw new Error('Smart Patch scratch is unsafe.')
    }
    const root = await mkdtemp(path.join(this.scratchBasePath, 'smart-patch-request-'))
    active.root = root
    const created = await lstat(root)
    active.rootIdentity = { dev: created.dev, ino: created.ino }
    await this.assertOwnedScratch(active)
    for (const name of [
      'model-source.png',
      'latent-keep-mask.png',
      'final-contribution-mask.png',
    ]) {
      const bytes = claimed.bundle.files[name]
      if (bytes) {
        await writeFile(path.join(root, name), bytes, { flag: 'wx', mode: 0o600 })
      }
    }
    const source = payload.files['model-source.png']
    const request = captureSmartPatchExecutionRequest({
      family: payload.item.family,
      inference: structuredClone(payload.item.inference),
      internalResolution: { ...payload.context.internalResolution },
      latentKeepMask: {
        ...payload.files['latent-keep-mask.png'],
        path: path.join(root, 'latent-keep-mask.png'),
      },
      mode: payload.mode,
      modelSource: source ? { ...source, path: path.join(root, 'model-source.png') } : null,
      output: { pngPath: path.join(root, 'model-result.png'), stagingRoot: root },
      protocolVersion: '1',
      requestId: randomUUID(),
      schemaVersion: 1,
      type: 'execute-smart-patch',
    })
    const regional =
      payload.regional === undefined
        ? null
        : payload.item.family === 'illustrious'
          ? bindSmartPatchIllustriousRegionalExecution(
              hydrateFrozenSmartPatchIllustriousRegionalInput(
                claimed.bundle.manifest,
                claimed.bundle.files,
              ),
              request,
            )
          : bindSmartPatchAnimaRegionalExecution(
              hydrateFrozenSmartPatchAnimaRegionalInput(
                claimed.bundle.manifest,
                claimed.bundle.files,
              ),
              request,
            )
    await this.assertRunning(active)
    active.dispatched = true
    active.receivingProgress = true
    const onProgress = (progress: GenerationDenoisingProgress): void => {
      if (
        this.active !== active ||
        !active.receivingProgress ||
        active.abort.signal.aborted ||
        active.cancelPromise ||
        active.exitUnconfirmed ||
        this.stopping ||
        !supportsInferenceDenoisingProgress(active.transport.ready) ||
        !isGenerationDenoisingProgress(progress) ||
        (request.family === 'anima'
          ? progress.totalSteps !== request.inference.sampling.totalSteps
          : progress.totalSteps > 2 * request.inference.sampling.steps)
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
        documentId: payload.context.documentId,
        jobId: active.item.id,
        projectKey: active.item.localProjectKey,
        statusSequence: active.item.statusSequence,
        step: progress.step,
        totalSteps: progress.totalSteps,
      })
    }
    let result: SmartPatchExecutionResult
    try {
      if (regional) {
        if (!regionalExecution) {
          throw new SmartPatchProcessorError(
            'INFERENCE_UNAVAILABLE',
            'Smart regional dispatch is unavailable.',
          )
        }
        if ('compiledPrompts' in regional) {
          if (!active.transport.executeAnimaSmartPatchRegional) {
            throw new Error('Anima regional transport is unavailable.')
          }
          result = await active.transport.executeAnimaSmartPatchRegional(regional, onProgress)
        } else {
          if (!active.transport.executeIllustriousSmartPatchRegional) {
            throw new Error('Illustrious regional transport is unavailable.')
          }
          result = await active.transport.executeIllustriousSmartPatchRegional(regional, onProgress)
        }
      } else {
        result = await active.transport.executeSmartPatch(request, onProgress)
      }
    } finally {
      // Numerical progress ends before CPU/world processing, publication or failure cleanup.
      this.clearProgress(active)
    }
    const actualSeed = requireSmartPatchActualSeed(result.actualSeed, payload.item.item.seed)
    const output = { ...structuredClone(result.output) }
    if (
      output.path !== request.output.pngPath ||
      output.width !== request.internalResolution.width ||
      output.height !== request.internalResolution.height ||
      output.iccSha256 !== IGS_SRGB_ICC_SHA256
    ) {
      throw new Error('The Smart Patch inference output differs from its frozen request.')
    }
    await readSmartPatchModelSourceOutput(output.path, output)
    await this.assertRunning(active)
    active.cpu = Promise.resolve()
      .then(() => this.outputOwner.start(active.abort.signal))
      .then((worker) => ({
        close: worker.close.bind(worker),
        composeSmartPatchOutput: worker.composeSmartPatchOutput.bind(worker),
      }))
    // A close may race CPU startup. Register its promise before awaiting, then recheck cancellation.
    const cpu = await active.cpu
    await this.assertRunning(active)
    const final = payload.files['final-contribution-mask.png']
    const world = await composeSmartPatchWorldContribution({
      bbox: payload.context.bbox,
      contributionMaskPath: path.join(root, 'final-contribution-mask.png'),
      finalContribution: {
        ...final,
        bytes: Buffer.from(claimed.bundle.files['final-contribution-mask.png']),
      },
      image: output,
      internalResolution: payload.context.internalResolution,
      outputPngPath: path.join(root, 'world-result.png'),
      outputWorker: cpu,
      stagingRoot: root,
    })
    await cpu.close()
    await this.assertRunning(active)
    active.publishing = true
    const candidate = await this.staging.publishGenerationCandidate({
      actualSeed,
      expectedProvisionalRoot: root,
      expectedStatusSequence: claimed.item.statusSequence,
      output: {
        byteSize: world.byteSize,
        colorSpace: 'srgb',
        height: world.height,
        iccSha256: world.iccSha256,
        path: path.join(root, 'world-result.png'),
        sha256: world.sha256,
        width: world.width,
      },
      provisionalOutputPath: path.join(root, 'world-result.png'),
      queueItemId: claimed.item.id,
    })
    active.publishing = false
    return candidate
  }

  private publishProgress(current: GenerationProgressSnapshot['current']): void {
    this.progress = { current, revision: this.progress.revision + 1 }
    for (const listener of this.progressListeners) {
      try {
        listener(this.getProgressSnapshot())
      } catch {
        /* Telemetry observers cannot change inference, durable state or other snapshots. */
      }
    }
  }

  private async release(active: Active): Promise<void> {
    this.clearProgress(active)
    if (active.root) {
      try {
        await this.assertOwnedScratch(active)
        await rm(active.root, { force: true, recursive: true })
      } catch {
        process.emitWarning('Smart Patch scratch cleanup deferred.', {
          code: 'SMART_PATCH_SCRATCH_CLEANUP_DEFERRED',
        })
      }
    }
    if (this.active === active) {
      this.active = null
      this.emitChanged()
    }
  }

  private async runInternal(
    transport: SmartPatchInferenceTransport,
  ): Promise<SmartPatchProcessorResult> {
    const claim = this.queue.claimNextPendingSmartPatch()
    this.claiming = claim
    let claimed: VerifiedQueuedSmartPatchInput | null
    try {
      claimed = await claim
    } finally {
      if (this.claiming === claim) {
        this.claiming = null
      }
    }
    if (!claimed) {
      return { kind: 'idle' }
    }
    const active: Active = {
      abort: new AbortController(),
      cancelPromise: null,
      cpu: null,
      dispatched: false,
      exitUnconfirmed: false,
      item: claimed.item,
      publicationUncertain: false,
      publishing: false,
      receivingProgress: false,
      root: null,
      rootIdentity: null,
      runSettled: false,
      transport,
      work: null,
    }
    this.active = active
    this.emitChanged()
    let terminal = false
    try {
      active.work = this.execute(active, claimed)
      const candidate = await active.work
      terminal = true
      return { candidate, kind: 'completed', queueItemId: claimed.item.id }
    } catch (error) {
      if (
        active.cancelPromise ||
        active.abort.signal.aborted ||
        this.stopping ||
        (error instanceof SmartPatchProcessorError && error.code === 'CANCELED')
      ) {
        const canceled = await this.cancelActive(active)
        terminal = canceled.status !== 'running'
        return { kind: 'canceled', queueItemId: claimed.item.id }
      }
      if (active.publishing) {
        let reserved = true
        try {
          reserved = await this.staging.hasPublicationReceipt(claimed.item.id)
        } catch {
          /* Unreadable receipt is uncertain. */
        }
        if (reserved) {
          active.publicationUncertain = true
          throw new SmartPatchProcessorError(
            'PUBLICATION_UNCERTAIN',
            'Smart Patch publication needs recovery.',
          )
        }
      }
      await this.closeOwned(active, active.dispatched)
      active.exitUnconfirmed = false
      try {
        await this.queue.failRunning(claimed.item.id, claimed.item.statusSequence, {
          code: active.dispatched ? 'GENERATION_WORKER_FAILED' : 'GENERATION_INPUT_CHANGED',
          message: active.dispatched
            ? 'Smart Patch execution did not return a verified world result.'
            : 'The frozen Smart Patch input could not be verified.',
        })
      } catch (failure) {
        if (!active.cancelPromise && !active.abort.signal.aborted) {
          throw failure
        }
        const canceled = await this.cancelActive(active)
        terminal = canceled.status !== 'running'
        return { kind: 'canceled', queueItemId: claimed.item.id }
      }
      terminal = true
      return { kind: 'failed', queueItemId: claimed.item.id }
    } finally {
      this.clearProgress(active)
      active.runSettled = true
      if (terminal && !active.exitUnconfirmed && !active.publicationUncertain) {
        await this.release(active)
      }
    }
  }
}

function unconfirmed(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'WORKER_EXIT_UNCONFIRMED'
}
