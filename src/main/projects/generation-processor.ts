import type {
  GenerationDenoisingProgress,
  GenerationProgressSnapshot,
} from '../../shared/projects/generation-progress.js'
import { isGenerationDenoisingProgress } from '../../shared/projects/generation-progress.js'
import {
  isQualifiedInferenceWorkerReady,
  supportsInferenceCandidateThumbnails,
  supportsInferenceDenoisingProgress,
  supportsInferenceImg2Img,
  supportsInferenceLora,
  supportsInferenceVaePrecision,
} from '../../shared/projects/inference-worker-capabilities.js'

import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdtemp, open, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { QueuedGenerationItem, VerifiedQueuedInput } from './generation-queue.js'
import type { GenerationQueueRepository } from './generation-queue.js'
import type { VerifiedGenerationCandidate } from './generation-staging.js'
import type { GenerationStagingRepository } from './generation-staging.js'
import type { GenerationModelResolver } from './illustrious-generation-loras.js'
import type {
  IllustriousGenerationRequestV1,
  InferenceWorkerReady,
} from './illustrious-txt2img-job.js'

import { reverifyFrozenGenerationLoras } from './illustrious-generation-loras.js'

const PROTOCOL_VERSION = '1'
const MAX_PROTOCOL_LINE_BYTES = 64 * 1024
const MAX_TARGET_BYTES = 32 * 1024 * 1024

/** A qualified, long-lived worker borrowed for one job. close() must resolve only after exit. */
export interface GenerationWorkerTransport {
  close: () => Promise<void>
  generate: (
    request: IllustriousGenerationRequestV1,
    onProgress?: (progress: GenerationDenoisingProgress) => void,
  ) => Promise<unknown>
  readonly ready: InferenceWorkerReady
}

export type GenerationProcessorResult =
  | { candidate: VerifiedGenerationCandidate; kind: 'completed'; queueItemId: string }
  | { kind: 'canceled'; queueItemId: string }
  | { kind: 'failed'; queueItemId: string }
  | { kind: 'idle' }

type ActiveJob = {
  cancelPromise: Promise<QueuedGenerationItem> | null
  cancelSignal: Promise<{ completion: Promise<QueuedGenerationItem> }>
  exitUnconfirmed: boolean
  item: QueuedGenerationItem
  provisionalRoot: string | null
  receivingProgress: boolean
  releasePromise: Promise<void> | null
  runSettled: boolean
  signalCancel: (value: { completion: Promise<QueuedGenerationItem> }) => void
  transport: GenerationWorkerTransport
}

export class GenerationProcessorError extends Error {
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
    this.name = 'GenerationProcessorError'
  }
}

/**
 * One private queue handoff. This does not instantiate an inference worker or expose Generate in
 * the renderer; callers must supply a runtime-qualified transport. SQLite retains the global
 * running slot after any uncertain worker exit or candidate publication.
 */
export class GenerationProcessor {
  private active: ActiveJob | null = null
  private currentRun: Promise<GenerationProcessorResult> | null = null
  private readonly listeners = new Set<() => void>()
  private progress: GenerationProgressSnapshot = { current: null, revision: 0 }
  private readonly progressListeners = new Set<(snapshot: GenerationProgressSnapshot) => void>()
  private running = false
  private stopping = false

  constructor(
    private readonly queue: GenerationQueueRepository,
    private readonly staging: GenerationStagingRepository,
    private readonly modelService: GenerationModelResolver,
    private readonly scratchBasePath: string,
  ) {}

  async cancel(queueItemId: string): Promise<QueuedGenerationItem> {
    const active = this.active
    if (active?.item.id === queueItemId) {
      return await this.cancelActive(active)
    }
    const item = await this.queue.cancel(queueItemId)
    // cancel() may have won after the SQLite claim but before runOne assigned its local owner.
    // runOne also rechecks the row before materialization and dispatch.
    const newlyActive = this.active
    if (item.status === 'running' && newlyActive?.item.id === queueItemId) {
      return await this.cancelActive(newlyActive)
    }
    this.emitChanged()
    return item
  }

  /**
   * A Project close must not treat a cancel-requested running row as stopped. In particular, queue
   * claim can precede assignment of this processor's local worker owner. Wait for that claim to
   * settle, or retain the Project and its staging for an explicit retry.
   */
  async cancelAndWait(queueItemId: string): Promise<QueuedGenerationItem> {
    const item = await this.cancel(queueItemId)
    if (item.status !== 'running') {
      return item
    }
    const active = this.active
    if (active?.item.id === queueItemId) {
      return await this.cancelActive(active)
    }
    if (active) {
      throw new GenerationProcessorError(
        'WORKER_EXIT_UNCONFIRMED',
        'Another worker owns the running queue slot.',
      )
    }
    const run = this.currentRun
    if (!run) {
      throw new GenerationProcessorError(
        'WORKER_EXIT_UNCONFIRMED',
        'The running generation worker has no confirmed local owner.',
      )
    }
    // The only local run with no active owner is between SQLite claim and ownership assignment.
    // Its own cancellation check must stop the worker before this close can proceed.
    await run
    const settled = await this.cancel(queueItemId)
    if (settled.status === 'running') {
      throw new GenerationProcessorError(
        'WORKER_EXIT_UNCONFIRMED',
        'The generation worker has not confirmed exit.',
      )
    }
    return settled
  }

  getProgressSnapshot(): GenerationProgressSnapshot {
    return structuredClone(this.progress)
  }

  /** Signal real queue transitions to the app owner without polling or retaining renderer state. */
  onChanged(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onProgress(listener: (snapshot: GenerationProgressSnapshot) => void): () => void {
    this.progressListeners.add(listener)
    return () => this.progressListeners.delete(listener)
  }

  async runOne(transport: GenerationWorkerTransport): Promise<GenerationProcessorResult> {
    if (this.currentRun) {
      throw new GenerationProcessorError('BUSY', 'A generation job is already being processed.')
    }
    const run = this.runOneInternal(transport)
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

  /** Permanently stop dispatch and cancel the currently owned worker, if any. */
  async stopAndCancelActive(): Promise<void> {
    this.stopping = true
    const active = this.active
    if (active) {
      await this.cancelActive(active)
    }
  }

  private cancelActive(active: ActiveJob): Promise<QueuedGenerationItem> {
    if (!active.cancelPromise) {
      // Until SQLite says this job was already terminal, process exit is unconfirmed. A failed
      // close leaves this owner available for an explicit retry instead of stranding its row.
      active.exitUnconfirmed = true
      this.clearProgress(active)
      const operation = (async () => {
        const item = await this.queue.cancel(active.item.id)
        this.emitChanged()
        if (item.status !== 'running' || !item.cancelRequested) {
          active.exitUnconfirmed = false
          if (active.runSettled) {
            await this.releaseActive(active)
          }
          return item
        }
        // The queue keeps its only running slot until the transport confirms process exit.
        await active.transport.close()
        const canceled = await this.queue.acknowledgeCanceledRunning(item.id, item.statusSequence)
        this.emitChanged()
        active.exitUnconfirmed = false
        if (active.runSettled) {
          await this.releaseActive(active)
        }
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

  private clearProgress(active: ActiveJob): void {
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
        // A failed observer must not change the queue or worker lifecycle.
      }
    }
  }

  private publishProgress(current: GenerationProgressSnapshot['current']): void {
    this.progress = { current, revision: this.progress.revision + 1 }
    for (const listener of this.progressListeners) {
      try {
        listener(this.getProgressSnapshot())
      } catch {
        // Observers cannot change inference, durable state or other observers' snapshots.
      }
    }
  }

  private releaseActive(active: ActiveJob): Promise<void> {
    if (!active.releasePromise) {
      active.releasePromise = (async () => {
        try {
          if (active.provisionalRoot) {
            await rm(active.provisionalRoot, { force: true, recursive: true })
          }
        } catch {
          // A scratch cleanup failure cannot undo a committed candidate or release a running
          // queue row. A future app-owned scratch sweep can remove this orphan directory.
          process.emitWarning('Generation scratch cleanup failed.', {
            code: 'GENERATION_SCRATCH_CLEANUP_FAILED',
          })
        } finally {
          if (this.active === active) {
            this.active = null
            this.running = false
          }
        }
      })()
    }
    return active.releasePromise
  }

  private async requestForClaim(
    claimed: VerifiedQueuedInput,
    targetPath: string,
    outputPath: string,
    provisionalRoot: string,
  ): Promise<IllustriousGenerationRequestV1> {
    const frozen = claimed.payload
    const verified = await this.modelService.resolveVerifiedGenerationCheckpointForPlan(
      frozen.context.model.reference,
    )
    if (
      verified.managedPath !== frozen.context.model.managedPath ||
      verified.managedPath !== frozen.workerJob.checkpoint.path ||
      verified.reference.fileSha256 !== frozen.workerJob.checkpoint.sha256 ||
      verified.reference.predictionType !== frozen.workerJob.checkpoint.predictionType
    ) {
      throw new Error('The exact checkpoint or prediction type changed after enqueue.')
    }
    await reverifyFrozenGenerationLoras(frozen.context, this.modelService)
    const requestId = randomUUID()
    const request: IllustriousGenerationRequestV1 =
      frozen.kind === 'illustrious-img2img'
        ? {
            job: {
              ...structuredClone(frozen.workerJob),
              checkpoint: { ...frozen.workerJob.checkpoint, path: verified.managedPath },
              output: { pngPath: outputPath, stagingRoot: provisionalRoot },
              target: { ...frozen.workerJob.target, path: targetPath },
            },
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            type: 'generate-illustrious-img2img',
          }
        : {
            job: {
              ...structuredClone(frozen.workerJob),
              checkpoint: { ...frozen.workerJob.checkpoint, path: verified.managedPath },
              output: { pngPath: outputPath, stagingRoot: provisionalRoot },
              target: { ...frozen.workerJob.target, path: targetPath },
            },
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            type: 'generate-illustrious-txt2img',
          }
    if (Buffer.byteLength(JSON.stringify(request), 'utf8') + 1 > MAX_PROTOCOL_LINE_BYTES) {
      throw new Error('The generation request exceeds the worker message limit.')
    }
    return request
  }

  private async runOneInternal(
    transport: GenerationWorkerTransport,
  ): Promise<GenerationProcessorResult> {
    if (this.stopping) {
      throw new GenerationProcessorError('CLOSED', 'Generation dispatch is stopping.')
    }
    if (this.running || this.active) {
      throw new GenerationProcessorError('BUSY', 'A generation job is already being processed.')
    }
    requireInferenceReady(transport.ready)
    this.queue.assertReadyForDispatch()
    this.staging.assertReadyForPublication()
    this.running = true
    let active: ActiveJob | null = null
    try {
      const claimed = await this.queue.claimNextPending()
      if (!claimed) {
        return { kind: 'idle' }
      }
      // No await between claim resolution and assigning the local owner. A cancellation from
      // another caller may still have changed SQLite during the claim await; recheck below.
      let signalCancel!: (value: { completion: Promise<QueuedGenerationItem> }) => void
      const cancelSignal = new Promise<{ completion: Promise<QueuedGenerationItem> }>((resolve) => {
        signalCancel = resolve
      })
      active = {
        cancelPromise: null,
        cancelSignal,
        exitUnconfirmed: false,
        item: claimed.item,
        provisionalRoot: null,
        receivingProgress: false,
        releasePromise: null,
        runSettled: false,
        signalCancel,
        transport,
      }
      this.active = active
      this.emitChanged()
      let dispatched = false
      let publishing = false
      try {
        if (this.stopping) {
          await this.cancelActive(active)
          return { kind: 'canceled', queueItemId: claimed.item.id }
        }
        if (!(await this.stillRunning(active))) {
          return { kind: 'canceled', queueItemId: claimed.item.id }
        }
        if (
          claimed.payload.kind === 'illustrious-img2img' &&
          !supportsInferenceImg2Img(transport.ready)
        ) {
          throw new GenerationProcessorError(
            'INFERENCE_UNAVAILABLE',
            'The active worker has not qualified opaque Illustrious img2img.',
          )
        }
        if (
          claimed.payload.context.vaePrecision !== undefined &&
          claimed.payload.context.vaePrecision !== 'Auto' &&
          !supportsInferenceVaePrecision(transport.ready)
        ) {
          throw new GenerationProcessorError(
            'INFERENCE_UNAVAILABLE',
            'The active worker has not qualified manual Illustrious VAE Precision.',
          )
        }
        if (claimed.payload.context.loras?.length && !supportsInferenceLora(transport.ready)) {
          throw new Error('The active worker has not qualified Illustrious LoRA.')
        }
        const provisionalRoot = await createProvisionalRoot(this.scratchBasePath)
        active.provisionalRoot = provisionalRoot
        const targetPath = path.join(provisionalRoot, 'target.png')
        const outputPath = path.join(provisionalRoot, 'result.png')
        const targetBytes = await readStableTarget(claimed)
        await writeFile(targetPath, targetBytes, { flag: 'wx', mode: 0o600 })
        if (!(await this.stillRunning(active))) {
          return { kind: 'canceled', queueItemId: claimed.item.id }
        }
        const request = await this.requestForClaim(claimed, targetPath, outputPath, provisionalRoot)
        if (!(await this.stillRunning(active))) {
          return { kind: 'canceled', queueItemId: claimed.item.id }
        }
        dispatched = true
        const capturedActive = active
        active.receivingProgress = true
        const onProgress = (progress: GenerationDenoisingProgress): void => {
          if (
            this.active !== capturedActive ||
            !capturedActive.receivingProgress ||
            capturedActive.cancelPromise ||
            capturedActive.exitUnconfirmed ||
            this.stopping ||
            !supportsInferenceDenoisingProgress(transport.ready) ||
            !isGenerationDenoisingProgress(progress) ||
            progress.totalSteps > 2 * request.job.sampling.steps
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
            .generate(request, onProgress)
            .then((response) => ({ kind: 'done' as const, response })),
          active.cancelSignal.then(({ completion }) => ({ completion, kind: 'cancel' as const })),
        ])
        this.clearProgress(active)
        if (outcome.kind === 'cancel') {
          await outcome.completion
          return { kind: 'canceled', queueItemId: claimed.item.id }
        }
        if (active.cancelPromise) {
          await active.cancelPromise
          return { kind: 'canceled', queueItemId: claimed.item.id }
        }
        const { actualSeed, thumbnail } = requireCorrelatedDone(outcome.response, request)
        publishing = true
        const candidate = await this.staging.publishIllustriousTxt2Img({
          actualSeed,
          expectedProvisionalRoot: provisionalRoot,
          expectedStatusSequence: claimed.item.statusSequence,
          provisionalOutputPath: outputPath,
          queueItemId: claimed.item.id,
          ...(supportsInferenceCandidateThumbnails(transport.ready) ? { thumbnail } : {}),
        })
        return { candidate, kind: 'completed', queueItemId: claimed.item.id }
      } catch {
        this.clearProgress(active)
        if (active.cancelPromise) {
          await active.cancelPromise
          return { kind: 'canceled', queueItemId: claimed.item.id }
        }
        if (active.exitUnconfirmed) {
          throw new GenerationProcessorError(
            'WORKER_EXIT_UNCONFIRMED',
            'The generation worker has not confirmed exit.',
          )
        }
        if (publishing) {
          // A receipt is reserved before any candidate asset/manifest can be published. If its
          // absence is proven, this was a pre-publication validation failure and may be failed.
          // A present receipt or failed lookup is uncertain: restart reconciliation owns it.
          let hasReceipt: boolean
          try {
            hasReceipt = await this.staging.hasPublicationReceipt(claimed.item.id)
          } catch {
            hasReceipt = true
          }
          if (hasReceipt) {
            throw new GenerationProcessorError(
              'PUBLICATION_UNCERTAIN',
              'Candidate publication needs recovery before another job can run.',
            )
          }
        }
        if (dispatched) {
          try {
            await transport.close()
          } catch {
            active.exitUnconfirmed = true
            throw new GenerationProcessorError(
              'WORKER_EXIT_UNCONFIRMED',
              'The generation worker has not confirmed exit.',
            )
          }
        }
        try {
          await this.queue.failRunning(claimed.item.id, claimed.item.statusSequence, {
            code: dispatched ? 'GENERATION_WORKER_FAILED' : 'GENERATION_INPUT_CHANGED',
            message: dispatched
              ? 'The generation worker did not return a valid completed result.'
              : 'The frozen generation input could not be verified.',
          })
        } catch (failure) {
          if (active.cancelPromise) {
            await active.cancelPromise
            return { kind: 'canceled', queueItemId: claimed.item.id }
          }
          throw failure
        }
        return { kind: 'failed', queueItemId: claimed.item.id }
      }
    } finally {
      if (!active) {
        this.running = false
      } else {
        this.clearProgress(active)
        try {
          if (active.cancelPromise) {
            await active.cancelPromise
          }
        } finally {
          active.runSettled = true
          if (!active.exitUnconfirmed) {
            await this.releaseActive(active)
          } else {
            // The owner stays attached to the potentially live worker for an explicit retry.
            this.running = false
          }
        }
      }
    }
  }

  private async stillRunning(active: ActiveJob): Promise<boolean> {
    if (this.stopping && !active.cancelPromise) {
      await this.cancelActive(active)
      return false
    }
    if (active.cancelPromise) {
      await active.cancelPromise
      return false
    }
    const current = await this.queue.loadVerifiedInput(active.item.id)
    if (current.item.status === 'running' && current.item.cancelRequested) {
      await this.cancelActive(active)
      return false
    }
    if (
      current.item.status !== 'running' ||
      current.item.statusSequence !== active.item.statusSequence
    ) {
      throw new GenerationProcessorError('QUEUE_CHANGED', 'The claimed queue job changed.')
    }
    if (active.cancelPromise) {
      await active.cancelPromise
      return false
    }
    return true
  }
}

function requireInferenceReady(ready: InferenceWorkerReady): void {
  if (!isQualifiedInferenceWorkerReady(ready)) {
    throw new GenerationProcessorError(
      'INFERENCE_UNAVAILABLE',
      'The active worker has not qualified Illustrious txt2img inference.',
    )
  }
}

function requireCorrelatedDone(
  response: unknown,
  request: IllustriousGenerationRequestV1,
): { actualSeed: number; thumbnail: unknown } {
  if (typeof response !== 'object' || response === null) {
    throw new Error('The generation worker response is invalid.')
  }
  const done = response as Record<string, unknown>
  if (
    done.type !== 'generation-done' ||
    done.protocolVersion !== PROTOCOL_VERSION ||
    done.requestId !== request.requestId ||
    done.outputPath !== request.job.output.pngPath ||
    !Number.isInteger(done.seed) ||
    (done.seed as number) < 0 ||
    (done.seed as number) > 0xff_ff_ff_ff
  ) {
    throw new Error('The generation worker response does not match this request.')
  }
  return { actualSeed: done.seed as number, thumbnail: done.thumbnail }
}

async function createProvisionalRoot(scratchBasePath: string): Promise<string> {
  if (!path.isAbsolute(scratchBasePath) || path.resolve(scratchBasePath) !== scratchBasePath) {
    throw new Error('The generation scratch directory is invalid.')
  }
  const entry = await lstat(scratchBasePath)
  if (
    !entry.isDirectory() ||
    entry.isSymbolicLink() ||
    (await realpath(scratchBasePath)) !== scratchBasePath ||
    (process.getuid?.() !== undefined && entry.uid !== process.getuid())
  ) {
    throw new Error('The generation scratch directory is unsafe.')
  }
  return await mkdtemp(path.join(scratchBasePath, 'illustrious-request-'))
}

async function readStableTarget(claimed: VerifiedQueuedInput): Promise<Buffer> {
  const expected = claimed.payload.workerJob.target
  let handle
  try {
    handle = await open(claimed.targetPath, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch {
    throw new Error('The frozen target could not be opened.')
  }
  try {
    const before = await handle.stat({ bigint: true })
    if (
      !before.isFile() ||
      before.size !== BigInt(expected.byteSize) ||
      before.size < 1n ||
      before.size > BigInt(MAX_TARGET_BYTES) ||
      before.nlink !== 1n
    ) {
      throw new Error('The frozen target changed.')
    }
    const bytes = Buffer.alloc(expected.byteSize + 1)
    let length = 0
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length)
      if (bytesRead === 0) {
        break
      }
      length += bytesRead
    }
    const after = await handle.stat({ bigint: true })
    const atPath = await lstat(claimed.targetPath, { bigint: true })
    if (
      length !== expected.byteSize ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      before.dev !== atPath.dev ||
      before.ino !== atPath.ino ||
      atPath.isSymbolicLink() ||
      createHash('sha256').update(bytes.subarray(0, length)).digest('hex') !== expected.sha256
    ) {
      throw new Error('The frozen target changed.')
    }
    return bytes.subarray(0, length)
  } finally {
    await handle.close()
  }
}
