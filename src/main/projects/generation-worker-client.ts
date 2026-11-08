import {
  type AnimaWorkerRequest,
  captureCompiledAnimaWorkerRequest,
} from '../../shared/projects/anima-worker-request.js'
import {
  type GenerationDenoisingProgress,
  isGenerationDenoisingProgress,
  MAX_DENOISING_STEPS,
} from '../../shared/projects/generation-progress.js'
import {
  isDefaultIllustriousNoiseProfile,
  isIllustriousNoiseProfileV1,
  supportsIllustriousNoiseProfile,
} from '../../shared/projects/illustrious-noise-profile.js'
import { ILLUSTRIOUS_SCHEDULER_PAIRS } from '../../shared/projects/illustrious-scheduler.js'
import {
  supportsInferenceAnimaRegional,
  supportsInferenceAnimaRegionalImg2Img,
  supportsInferenceAnimaRegionalSampling,
} from '../../shared/projects/inference-worker-capabilities.js'
import {
  isQualifiedInferenceWorkerReady,
  supportsInferenceAnima,
  supportsInferenceAnimaOutpaint,
  supportsInferenceCFGRescale,
  supportsInferenceDenoisingProgress,
  supportsInferenceEmbeddings,
  supportsInferenceEuler,
  supportsInferenceExternalVae,
  supportsInferenceIllustriousNoiseProfile,
  supportsInferenceImg2Img,
  supportsInferenceLora,
  supportsInferenceOutpaint,
  supportsInferenceRegionalCFGRescale,
  supportsInferenceRegionalDpm,
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
  supportsInferenceVaePrecision,
} from '../../shared/projects/inference-worker-capabilities.js'

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, lstat, realpath } from 'node:fs/promises'
import path from 'node:path'

import type { GenerationWorkerRequest, GenerationWorkerTransport } from './generation-processor.js'
import type {
  IllustriousGenerationRequestV1,
  InferenceWorkerReady,
} from './illustrious-txt2img-job.js'

import { verifyInferenceAuxiliaryFile } from '../runtime/inference-auxiliary-resources.js'
import { prepareAnimaRegionalWorkerRequest } from './anima-regional-worker-request.js'
import { validWorkerVae } from './illustrious-generation-vae.js'
import {
  captureInferenceWorkerOwner,
  type InferenceWorkerOwner,
  InferenceWorkerOwnershipError,
} from './inference-worker-ownership.js'
import {
  type AnimaOutpaintRequestV1,
  captureOutpaintWorkerRequest,
  isOutpaintWorkerRequest,
} from './outpaint-worker-request.js'
import {
  type OperationalRegionalGenerationRequestV1,
  type OperationalRegionalWorkerInput,
  prepareRegionalWorkerRequest,
  readRegionalWorkerResult,
  type RegionalWorkerLease,
  type RegionalWorkerResult,
} from './regional-worker-request.js'
import {
  captureSmartPatchExecutionRequest,
  executeSmartPatchWithTransport,
  type SmartPatchExecutionRequest,
  type SmartPatchExecutionResult,
} from './smart-patch-execution-request.js'
import {
  type ComposeTargetInput,
  type ComposeTargetResult,
  composeTargetWithTransport,
  ProjectWorkerClient,
  ProjectWorkerError,
} from './worker-client.js'

const PROTOCOL_VERSION = '1'
const RUNTIME_PROFILE = 'linux-nvidia'
const MAX_PROTOCOL_LINE_BYTES = 64 * 1024
const SHUTDOWN_WAIT_MS = 2000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface GenerationWorkerLocation {
  /** Absolute executable in the app-owned, activated Python runtime; never resolved through PATH. */
  pythonExecutable: string
  /** Canonical app-owned runtime root. */
  runtimeRoot: string
  /** Canonical app-owned base for the processor's private per-job staging directories. */
  scratchBasePath: string
}

export interface GenerationWorkerOptions {
  environment?: NodeJS.ProcessEnv
  requestTimeoutMs?: number
  /** Normally two seconds; injectable so process-exit tests do not sleep for several seconds. */
  shutdownWaitMs?: number
  startupTimeoutMs?: number
}

export interface GenerationWorkerReady extends InferenceWorkerReady {
  pythonVersion: string
}

type PendingGeneration = {
  completionType: 'generation-done' | 'smart-patch-executed' | 'target-done'
  generationType: GenerationWorkerRequest['type'] | null
  outputPath: string
  progress: {
    expectedTotalSteps: number | null
    lastStep: number
    maxSteps: number
    onProgress?: (progress: GenerationDenoisingProgress) => void
    totalSteps: number | null
  } | null
  reject: (error: GenerationWorkerError) => void
  requestId: string
  resolve: (response: Record<string, unknown>) => void
  timer: ReturnType<typeof setTimeout>
}

export class GenerationWorkerError extends Error {
  constructor(
    readonly code:
      | 'BUSY'
      | 'CLOSED'
      | 'IMAGE_TOO_LARGE'
      | 'INVALID_PATH'
      | 'INVALID_REQUEST'
      | 'OUTPUT_MISMATCH'
      | 'PROTOCOL_ERROR'
      | 'REQUEST_TIMEOUT'
      | 'STARTUP_TIMEOUT'
      | 'WORKER_EXIT_UNCONFIRMED'
      | 'WORKER_EXITED'
      | 'WORKER_REQUEST_FAILED'
      | 'WORKER_VERSION_MISMATCH',
    message: string,
    readonly workerCode?: string,
    readonly failureReason?: 'unet-non-finite' | 'vae-non-finite',
  ) {
    super(message)
    this.name = 'GenerationWorkerError'
  }
}

/**
 * Production JSONL transport for the separate Linux/NVIDIA inference worker. It owns one child and
 * admits one composition or generation at a time. It does not claim queue rows or publish output.
 */
export class GenerationWorkerClient implements GenerationWorkerTransport {
  private static startupTail: Promise<void> = Promise.resolve()
  private static readonly unconfirmedStartChildren = new Set<GenerationWorkerClient>()

  get ready(): GenerationWorkerReady {
    if (this.closed || !this.readyMessage) {
      throw new GenerationWorkerError('CLOSED', 'The generation worker is unavailable.')
    }
    return this.readyMessage
  }

  private active: PendingGeneration | null = null

  private busy = false
  private closed = false
  private closePromise: Promise<void> | null = null
  private exitObserved = false
  private readonly exitPromise: Promise<void>
  private exitResolve!: () => void
  private forcedTermination = false
  private inferenceOwner: InferenceWorkerOwner | undefined
  private readyMessage: GenerationWorkerReady | null = null
  private readonly requestTimeoutMs: number
  // A failed kill must not release files a still-running child may consume. A late physical
  // exit, or close() retry, releases these request-owned stages.
  private readonly retainedRegionalLeases = new Set<
    RegionalWorkerLease<OperationalRegionalGenerationRequestV1>
  >()
  private readonly scratchBasePath: string
  // The worker executes synchronous requests serially. Retain the previous generation's ID to
  // discard its trailing progress without accepting unknown/crossed request IDs.
  private settledGeneration: {
    expectedTotalSteps: number | null
    maxSteps: number
    requestId: string
  } | null = null
  private readonly shutdownWaitMs: number
  private readonly startupPromise: Promise<GenerationWorkerReady>
  private startupReject!: (error: GenerationWorkerError) => void
  private startupResolve!: (ready: GenerationWorkerReady) => void
  private startupTimer: ReturnType<typeof setTimeout> | null = null
  private stdoutBytes = Buffer.alloc(0)
  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    scratchBasePath: string,
    options: GenerationWorkerOptions,
  ) {
    this.scratchBasePath = scratchBasePath
    this.requestTimeoutMs = deadline(options.requestTimeoutMs, 30 * 60_000, 'requestTimeoutMs')
    const startupTimeoutMs = deadline(options.startupTimeoutMs, 120_000, 'startupTimeoutMs')
    this.shutdownWaitMs = deadline(options.shutdownWaitMs, SHUTDOWN_WAIT_MS, 'shutdownWaitMs')
    this.startupPromise = new Promise<GenerationWorkerReady>((resolve, reject) => {
      this.startupResolve = resolve
      this.startupReject = reject
    })
    this.exitPromise = new Promise<void>((resolve) => {
      this.exitResolve = resolve
    })
    this.startupTimer = setTimeout(() => {
      this.fail(
        new GenerationWorkerError('STARTUP_TIMEOUT', 'The generation worker did not start.'),
      )
    }, startupTimeoutMs)
    child.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk))
    // Python tracebacks and model paths must not be forwarded to a renderer or protocol parser.
    child.stderr.on('data', () => undefined)
    child.stdin.on('error', () => {
      this.fail(new GenerationWorkerError('WORKER_EXITED', 'The generation worker input closed.'))
    })
    child.on('error', () => {
      this.fail(
        new GenerationWorkerError('WORKER_EXITED', 'The generation worker could not start.'),
      )
    })
    child.on('exit', () => {
      this.observeExit()
      this.fail(new GenerationWorkerError('WORKER_EXITED', 'The generation worker exited.'))
    })
    // Failed spawn may emit only `error` followed by `close`.
    child.on('close', () => this.observeExit())
  }

  static hasUnconfirmedStartExit(): boolean {
    return this.unconfirmedStartChildren.size > 0
  }

  /** Retry exit confirmation for failed starts without admitting another child. */
  static async retryUnconfirmedStartExit(): Promise<boolean> {
    // Share the startup admission lock: a successful result must not race a new spawn or a
    // different caller's failed-start cleanup.
    const preceding = GenerationWorkerClient.startupTail
    let release!: () => void
    GenerationWorkerClient.startupTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await preceding
    try {
      await GenerationWorkerClient.confirmFailedStartExitsUnlocked()
      return true
    } catch {
      return false
    } finally {
      release()
    }
  }

  static async start(
    location: GenerationWorkerLocation,
    options: GenerationWorkerOptions = {},
  ): Promise<GenerationWorkerClient> {
    deadline(options.requestTimeoutMs, 30 * 60_000, 'requestTimeoutMs')
    deadline(options.startupTimeoutMs, 120_000, 'startupTimeoutMs')
    deadline(options.shutdownWaitMs, SHUTDOWN_WAIT_MS, 'shutdownWaitMs')
    // Serialize admission through startup and failed-start cleanup. A second launch must not race
    // the first child before we know whether that child has exited.
    const preceding = GenerationWorkerClient.startupTail
    let release!: () => void
    GenerationWorkerClient.startupTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await preceding
    try {
      await GenerationWorkerClient.confirmFailedStartExitsUnlocked()
      const runtimeRoot = await canonicalDirectory(location.runtimeRoot, 'Runtime root')
      const scratchBasePath = await canonicalDirectory(location.scratchBasePath, 'Scratch base')
      const executable = await executableWithin(location.pythonExecutable, runtimeRoot)
      // Runtime admission is advisory across startup/path awaits. An established CPU image child
      // can lose confirmed exit meanwhile; the actual CUDA spawn must observe that global fence.
      if (ProjectWorkerClient.hasUnconfirmedExit()) {
        throw new GenerationWorkerError(
          'WORKER_EXIT_UNCONFIRMED',
          'The image worker has not confirmed exit.',
        )
      }
      const args =
        process.platform === 'linux'
          ? [
              '-I',
              '-m',
              'imagegen_worker.owned_inference',
              '--parent-pid',
              String(process.pid),
              '--scratch-base',
              scratchBasePath,
            ]
          : ['-I', '-m', 'imagegen_worker.inference_main']
      const child = spawn(executable, args, {
        cwd: runtimeRoot,
        env: {
          ...(options.environment ?? { LANG: 'C.UTF-8' }),
          // An inference job must never turn a missing pinned component into an implicit download.
          HF_HUB_OFFLINE: '1',
          TRANSFORMERS_OFFLINE: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
      const client = new GenerationWorkerClient(child, scratchBasePath, options)
      try {
        const ready = await client.startupPromise
        if (client.closed) {
          throw new GenerationWorkerError('PROTOCOL_ERROR', 'The worker stopped during startup.')
        }
        if (process.platform === 'linux') {
          if (!ready.capabilities.includes('linux-owned-inference-v1') || child.pid === undefined) {
            throw new GenerationWorkerError(
              'WORKER_VERSION_MISMATCH',
              'The inference worker lifetime guard is unavailable.',
            )
          }
          client.inferenceOwner = await captureInferenceWorkerOwner(child.pid)
          if (client.closed) {
            throw new GenerationWorkerError(
              'WORKER_VERSION_MISMATCH',
              'The inference worker exited during owner verification.',
            )
          }
        }
        client.readyMessage = ready
        return client
      } catch (error) {
        const failure =
          error instanceof InferenceWorkerOwnershipError
            ? new GenerationWorkerError('WORKER_VERSION_MISMATCH', error.message)
            : error
        try {
          await client.close()
        } catch (closeError) {
          if (!client.exitObserved) {
            GenerationWorkerClient.unconfirmedStartChildren.add(client)
          }
          throw closeError
        }
        throw failure
      }
    } finally {
      release()
    }
  }

  private static async confirmFailedStartExitsUnlocked(): Promise<void> {
    for (const unconfirmed of GenerationWorkerClient.unconfirmedStartChildren) {
      await unconfirmed.close()
      GenerationWorkerClient.unconfirmedStartChildren.delete(unconfirmed)
    }
  }

  async close(): Promise<void> {
    this.closePromise ??= this.closeOne().catch((error: unknown) => {
      // A late OS exit or a retry of SIGKILL must remain observable after an unconfirmed close.
      this.closePromise = null
      throw error
    })
    await this.closePromise
    await this.releaseRegionalLeases()
  }

  async composeTarget(input: ComposeTargetInput): Promise<ComposeTargetResult> {
    if (this.closed) {
      throw new GenerationWorkerError('CLOSED', 'The generation worker is unavailable.')
    }
    if (this.busy) {
      throw new GenerationWorkerError('BUSY', 'The generation worker is already processing a job.')
    }
    this.busy = true
    try {
      if (!this.ready.capabilities.includes('target-composition')) {
        throw new GenerationWorkerError(
          'WORKER_VERSION_MISMATCH',
          'The generation worker does not support target composition.',
        )
      }
      const result = await composeTargetWithTransport(input, this.scratchBasePath, (payload) => {
        const requestId = randomUUID()
        const line = Buffer.from(
          `${JSON.stringify({
            ...payload,
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            type: 'compose-target',
          })}\n`,
          'utf8',
        )
        if (line.length > MAX_PROTOCOL_LINE_BYTES) {
          throw new GenerationWorkerError('INVALID_REQUEST', 'The target request is too large.')
        }
        return this.exchange(line, requestId, payload.output.targetPngPath, 'target-done')
      })
      if (this.closed) {
        throw new GenerationWorkerError('CLOSED', 'The generation worker is unavailable.')
      }
      return result
    } catch (error) {
      if (error instanceof ProjectWorkerError) {
        const mapped = new GenerationWorkerError(error.code, error.message, error.workerCode)
        if (mapped.code === 'OUTPUT_MISMATCH' || mapped.code === 'PROTOCOL_ERROR') {
          this.fail(mapped)
        }
        throw mapped
      }
      throw error
    } finally {
      this.busy = false
    }
  }

  /** Private explicit experiment. Returns owned PNG bytes; it never creates a queue candidate. */
  async executeCurrentCanvasRegional(
    input: OperationalRegionalWorkerInput,
    onProgress?: (progress: GenerationDenoisingProgress) => void,
  ): Promise<RegionalWorkerResult> {
    if (this.closed) {
      throw new GenerationWorkerError('CLOSED', 'The generation worker is unavailable.')
    }
    if (this.busy) {
      throw new GenerationWorkerError('BUSY', 'The generation worker is already processing a job.')
    }
    this.busy = true
    let lease: RegionalWorkerLease<OperationalRegionalGenerationRequestV1> | undefined
    let dispatched = false
    let completed = false
    try {
      if (input.compositionProfile === 'invoke-krea2-global-support-v1') {
        if (
          !supportsInferenceAnimaRegional(this.ready) ||
          (input.request.type === 'generate-anima-img2img' &&
            !supportsInferenceAnimaRegionalImg2Img(this.ready)) ||
          (input.request.job.sampling.scheduler !== 'euler' &&
            !supportsInferenceAnimaRegionalSampling(this.ready))
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified Anima Regional Guidance.',
          )
        }
      } else {
        if (
          input.request.type === 'generate-illustrious-outpaint' &&
          !supportsInferenceRegionalOutpaint(this.ready)
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified outpaint with Regional Guidance.',
          )
        }
        if (
          input.request.type !== 'generate-illustrious-txt2img' &&
          !supportsInferenceRegionalImg2Img(this.ready)
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified opaque img2img with Regional Guidance.',
          )
        }
        if (
          input.request.type !== 'generate-illustrious-txt2img' &&
          input.request.job.sampling.scheduler === 'euler_a' &&
          !supportsInferenceRegionalImg2ImgEulerAncestral(this.ready)
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified Euler a with opaque regional img2img.',
          )
        }
        if (
          input.request.type !== 'generate-illustrious-txt2img' &&
          (input.request.job.sampling.scheduler === 'dpmpp_2m' ||
            input.request.job.sampling.scheduler === 'dpmpp_2m_k') &&
          !supportsInferenceRegionalImg2ImgDpmpp2m(this.ready)
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified DPM++ 2M with opaque regional img2img.',
          )
        }
        if (
          input.request.type !== 'generate-illustrious-txt2img' &&
          (input.request.job.sampling.cfgRescale ?? 0) !== 0 &&
          !supportsInferenceRegionalImg2ImgCFGRescale(this.ready)
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified CFG Rescale with opaque regional img2img.',
          )
        }
        if (
          input.compositionProfile === 'invoke-canvas-v1' &&
          (input.request.job.sampling.cfgRescale ?? 0) !== 0 &&
          !supportsInferenceRegionalCFGRescale(this.ready)
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified frozen CFG Rescale with Regional Guidance.',
          )
        }
        if (
          input.compositionProfile === 'invoke-canvas-v1' &&
          input.request.type === 'generate-illustrious-txt2img' &&
          (input.request.job.sampling.scheduler === 'dpmpp_2m' ||
            input.request.job.sampling.scheduler === 'dpmpp_2m_k') &&
          !supportsInferenceRegionalDpm(this.ready)
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified frozen Regional Guidance with DPM++ 2M.',
          )
        }
        if (
          input.request.type !== 'generate-illustrious-txt2img' &&
          (input.request.job.vae != null ||
            (input.request.job.vaePrecision ?? 'Auto') !== 'FP16') &&
          !supportsInferenceRegionalImg2ImgVae(this.ready)
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The worker has not qualified selected VAE and precision with opaque regional img2img.',
          )
        }
        if (
          input.compositionProfile === 'invoke-canvas-v1' &&
          (input.request.job.vae != null ||
            (input.request.job.vaePrecision ?? 'Auto') !== 'FP16') &&
          !supportsInferenceRegionalVae(this.ready)
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified the frozen regional VAE or precision.',
          )
        }
        if (
          input.compositionProfile === 'invoke-canvas-v1' &&
          (input.request.job.loras?.length ?? 0) > 0 &&
          !supportsInferenceRegionalLoras(this.ready)
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified the frozen global LoRA stack.',
          )
        }
        if (
          input.compositionProfile === 'invoke-canvas-v1' &&
          ((input.request.job.embeddings?.positive.length ?? 0) > 0 ||
            (input.request.job.embeddings?.negative.length ?? 0) > 0) &&
          !supportsInferenceEmbeddings(this.ready)
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified the frozen global embedding resources.',
          )
        }
        if (
          input.initializationProfile !== undefined &&
          !supportsInferenceRegionalInvokeInitialization(this.ready)
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified the explicit regional initialization policy.',
          )
        }
        if (
          !this.ready.capabilities.includes(
            input.compositionProfile === 'invoke-canvas-v1'
              ? 'illustrious-regional-invoke-v1'
              : 'private-current-canvas-regional-v1',
          )
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified private regional execution.',
          )
        }
      }
      if (process.platform === 'linux' && !this.inferenceOwner) {
        throw new GenerationWorkerError(
          'WORKER_VERSION_MISMATCH',
          'The inference worker lifetime owner is unavailable.',
        )
      }
      lease =
        input.compositionProfile === 'invoke-krea2-global-support-v1'
          ? await prepareAnimaRegionalWorkerRequest(
              input,
              this.scratchBasePath,
              this.inferenceOwner,
            )
          : await prepareRegionalWorkerRequest(input, this.scratchBasePath, this.inferenceOwner)
      if (this.closed) {
        throw new GenerationWorkerError('CLOSED', 'The generation worker is unavailable.')
      }
      const reportProgress =
        typeof onProgress === 'function' &&
        (input.compositionProfile === 'invoke-krea2-global-support-v1'
          ? supportsInferenceAnimaRegional(this.ready)
          : supportsInferenceRegionalProgress(this.ready))
      const wire = reportProgress ? { ...lease.wire, reportProgress: true } : lease.wire
      const line = Buffer.from(`${JSON.stringify(wire)}\n`, 'utf8')
      if (line.byteLength > MAX_PROTOCOL_LINE_BYTES) {
        throw new GenerationWorkerError('INVALID_REQUEST', 'The regional descriptor is too large.')
      }
      dispatched = true
      const response = await this.exchange(
        line,
        lease.wire.requestId,
        lease.request.job.output.pngPath,
        'generation-done',
        reportProgress
          ? {
              expectedTotalSteps:
                lease.request.type === 'generate-anima-txt2img' ||
                lease.request.type === 'generate-anima-img2img'
                  ? lease.request.job.sampling.totalSteps
                  : lease.request.type === 'generate-illustrious-txt2img'
                    ? lease.request.job.sampling.steps
                    : null,
              maxSteps:
                lease.request.type === 'generate-anima-txt2img' ||
                lease.request.type === 'generate-anima-img2img'
                  ? 2 * lease.request.job.sampling.steps
                  : lease.request.job.sampling.steps,
              onProgress,
            }
          : undefined,
      )
      const result = await readRegionalWorkerResult(lease, response)
      if (this.closed) {
        throw new GenerationWorkerError('CLOSED', 'The generation worker is unavailable.')
      }
      completed = true
      return result
    } catch (error) {
      const mapped =
        error instanceof ProjectWorkerError
          ? new GenerationWorkerError(error.code, error.message, error.workerCode)
          : error
      if (dispatched) {
        // A rejected promise alone is not an input-lifetime fence. Confirm physical exit even
        // when the invalid completion was discovered by the PNG consumer after JSONL dispatch.
        try {
          await this.close()
        } catch (closeError) {
          GenerationWorkerClient.unconfirmedStartChildren.add(this)
          throw closeError
        }
      }
      throw mapped
    } finally {
      try {
        if (lease) {
          if (!dispatched || completed || this.exitObserved) {
            try {
              await lease.dispose()
            } catch (cleanupError) {
              this.retainedRegionalLeases.add(lease)
              GenerationWorkerClient.unconfirmedStartChildren.add(this)
              throw cleanupError
            }
          } else {
            this.retainedRegionalLeases.add(lease)
          }
        }
      } finally {
        this.busy = false
      }
    }
  }

  /** Private processing-size RGB; it never enters the durable generation/queue request union. */
  async executeSmartPatch(
    input: SmartPatchExecutionRequest,
    onProgress?: (progress: GenerationDenoisingProgress) => void,
  ): Promise<SmartPatchExecutionResult> {
    if (this.closed) {
      throw new GenerationWorkerError('CLOSED', 'The generation worker is unavailable.')
    }
    if (this.busy) {
      throw new GenerationWorkerError('BUSY', 'The generation worker is already processing a job.')
    }
    this.busy = true
    try {
      const request = captureSmartPatchExecutionRequest(input)
      if (
        this.ready.workerVersion !== '0.14.0' ||
        !this.ready.capabilities.includes('smart-patch-execution') ||
        !this.ready.capabilities.includes('smart-patch-seed-confirmation') ||
        (request.family === 'anima' && !supportsInferenceAnima(this.ready))
      ) {
        throw new GenerationWorkerError(
          'WORKER_VERSION_MISMATCH',
          'The active worker has not qualified private Smart Patch execution.',
        )
      }
      const result = await executeSmartPatchWithTransport(request, this.scratchBasePath, (frozen) =>
        this.exchange(
          Buffer.from(`${JSON.stringify(frozen)}\n`, 'utf8'),
          frozen.requestId,
          frozen.output.pngPath,
          'smart-patch-executed',
          {
            expectedTotalSteps:
              frozen.family === 'anima' ? frozen.inference.sampling.totalSteps : null,
            maxSteps: 2 * frozen.inference.sampling.steps,
            onProgress,
          },
        ),
      )
      if (this.closed) {
        throw new GenerationWorkerError('CLOSED', 'The generation worker is unavailable.')
      }
      return result
    } catch (error) {
      const mapped =
        error instanceof ProjectWorkerError
          ? new GenerationWorkerError(error.code, error.message, error.workerCode)
          : error
      if (
        mapped instanceof GenerationWorkerError &&
        (mapped.code === 'OUTPUT_MISMATCH' || mapped.code === 'PROTOCOL_ERROR')
      ) {
        this.fail(mapped)
      }
      if (this.closed) {
        // The capture may remove its inputs after this promise settles. Confirm
        // physical exit on worker failure/timeout before relinquishing its lease.
        try {
          await this.close()
        } catch (closeError) {
          GenerationWorkerClient.unconfirmedStartChildren.add(this)
          throw closeError
        }
      }
      throw mapped
    } finally {
      this.busy = false
    }
  }

  async generate(
    request: GenerationWorkerRequest,
    onProgress?: (progress: GenerationDenoisingProgress) => void,
  ): Promise<unknown> {
    if (this.closed) {
      throw new GenerationWorkerError('CLOSED', 'The generation worker is unavailable.')
    }
    if (this.busy) {
      throw new GenerationWorkerError('BUSY', 'The generation worker is already processing a job.')
    }
    this.busy = true
    try {
      // Snapshot before any asynchronous path validation: the caller may still own mutable state.
      let frozen: GenerationWorkerRequest
      try {
        frozen = structuredClone(request)
      } catch {
        throw new GenerationWorkerError('INVALID_REQUEST', 'The generation request is invalid.')
      }
      if (
        (frozen.type === 'generate-illustrious-txt2img' ||
          frozen.type === 'generate-illustrious-img2img' ||
          frozen.type === 'generate-illustrious-outpaint') &&
        frozen.job?.sampling?.scheduler === 'euler' &&
        !supportsInferenceEuler(this.readyMessage)
      ) {
        throw new GenerationWorkerError(
          'WORKER_VERSION_MISMATCH',
          'The active worker has not qualified ordinary Illustrious Euler.',
        )
      }
      if (
        frozen.type === 'generate-illustrious-txt2img' ||
        frozen.type === 'generate-illustrious-img2img' ||
        frozen.type === 'generate-illustrious-outpaint'
      ) {
        const profile = frozen.job?.sampling?.noiseProfile
        if (profile !== undefined) {
          if (
            !isIllustriousNoiseProfileV1(profile) ||
            !supportsIllustriousNoiseProfile(frozen.job.sampling.scheduler, profile)
          ) {
            throw new GenerationWorkerError(
              'INVALID_REQUEST',
              'The checkpoint noise profile is invalid or unsupported by this sampler.',
            )
          }
          if (!supportsInferenceIllustriousNoiseProfile(this.readyMessage)) {
            if (!isDefaultIllustriousNoiseProfile(profile)) {
              throw new GenerationWorkerError(
                'WORKER_VERSION_MISMATCH',
                'The active worker has not qualified the checkpoint noise profile.',
              )
            }
          }
        }
      }
      if (isOutpaintWorkerRequest(frozen)) {
        if (
          !supportsInferenceOutpaint(this.readyMessage) ||
          (frozen.type === 'generate-anima-outpaint' &&
            !supportsInferenceAnimaOutpaint(this.readyMessage))
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified this outpaint adapter.',
          )
        }
        try {
          frozen = captureOutpaintWorkerRequest(frozen, this.readyMessage)
        } catch (error) {
          throw new GenerationWorkerError(
            'INVALID_REQUEST',
            error instanceof Error ? error.message : 'The outpaint request is invalid.',
          )
        }
        if (!UUID_PATTERN.test(frozen.requestId)) {
          throw new GenerationWorkerError(
            'INVALID_REQUEST',
            'The generation request identity is invalid.',
          )
        }
      } else if (isAnimaRequest(frozen)) {
        if (!supportsInferenceAnima(this.readyMessage)) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified the original Anima pipeline.',
          )
        }
        try {
          frozen = captureCompiledAnimaWorkerRequest(frozen, this.readyMessage)
        } catch {
          throw new GenerationWorkerError(
            'INVALID_REQUEST',
            'The compiled Anima generation request is invalid.',
          )
        }
        if (!UUID_PATTERN.test(frozen.requestId)) {
          throw new GenerationWorkerError(
            'INVALID_REQUEST',
            'The generation request identity is invalid.',
          )
        }
      } else {
        if (!validRequestShape(frozen)) {
          throw new GenerationWorkerError('INVALID_REQUEST', 'The generation request is invalid.')
        }
        if (
          frozen.type === 'generate-illustrious-img2img' &&
          !supportsInferenceImg2Img(this.readyMessage)
        ) {
          throw new GenerationWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The active worker has not qualified opaque Illustrious img2img.',
          )
        }
        if (!supportsInferenceLora(this.readyMessage)) {
          if (frozen.job.loras?.length) {
            throw new GenerationWorkerError(
              'WORKER_VERSION_MISMATCH',
              'The active worker has not qualified Illustrious LoRA.',
            )
          }
          delete frozen.job.loras
        }
        if (!supportsInferenceVaePrecision(this.readyMessage)) {
          if (frozen.job.vaePrecision !== undefined && frozen.job.vaePrecision !== 'Auto') {
            throw new GenerationWorkerError(
              'WORKER_VERSION_MISMATCH',
              'The active worker has not qualified manual Illustrious VAE Precision.',
            )
          }
          // Preserve durable metadata; old Python parsers receive only this disposable copy.
          delete frozen.job.vaePrecision
        }
        if (!supportsInferenceExternalVae(this.readyMessage)) {
          if (frozen.job.vae) {
            throw new GenerationWorkerError(
              'WORKER_VERSION_MISMATCH',
              'The active worker has not qualified external Illustrious VAE loading.',
            )
          }
          // Embedded is neutral for old parsers; the frozen durable copy remains explicit null.
          delete frozen.job.vae
        }
        if (!supportsInferenceCFGRescale(this.readyMessage)) {
          if ((frozen.job.sampling.cfgRescale ?? 0) !== 0) {
            throw new GenerationWorkerError(
              'WORKER_VERSION_MISMATCH',
              'The active worker has not qualified Illustrious CFG Rescale.',
            )
          }
          // Old Python parsers reject unknown fields. Adapt only the disposable wire copy; the
          // durable preparation still distinguishes recorded neutral 0 from historical absence.
          delete frozen.job.sampling.cfgRescale
        }
      }
      if (!isAnimaRequest(frozen) && !supportsInferenceIllustriousNoiseProfile(this.readyMessage)) {
        // Adapt the captured transport copy; durable metadata stays explicit.
        delete frozen.job.sampling.noiseProfile
      }
      let line: Buffer
      try {
        line = Buffer.from(`${JSON.stringify(frozen)}\n`, 'utf8')
      } catch {
        throw new GenerationWorkerError('INVALID_REQUEST', 'The generation request is invalid.')
      }
      if (line.length > MAX_PROTOCOL_LINE_BYTES) {
        throw new GenerationWorkerError('INVALID_REQUEST', 'The generation request is invalid.')
      }
      await this.validateRequestPaths(frozen)
      const response = await this.exchange(
        line,
        frozen.requestId,
        frozen.job.output.pngPath,
        'generation-done',
        {
          expectedTotalSteps: isAnimaRequest(frozen) ? frozen.job.sampling.totalSteps : null,
          maxSteps: 2 * frozen.job.sampling.steps,
          onProgress,
        },
        frozen.type,
      )
      if (this.closed) {
        throw new GenerationWorkerError('CLOSED', 'The generation worker is unavailable.')
      }
      return response
    } finally {
      this.busy = false
    }
  }

  private async closeOne(): Promise<void> {
    if (!this.closed) {
      this.fail(new GenerationWorkerError('CLOSED', 'The generation worker was closed.'))
    }
    this.child.stdin.end()
    if (!this.exitObserved && !this.forcedTermination) {
      await this.waitForExit(this.shutdownWaitMs)
    }
    if (!this.exitObserved) {
      this.forcedTermination = true
      this.child.kill('SIGKILL')
      if (!(await this.waitForExit(this.shutdownWaitMs))) {
        throw new GenerationWorkerError(
          'WORKER_EXIT_UNCONFIRMED',
          'The generation worker did not confirm exit.',
        )
      }
    }
  }

  private exchange(
    line: Buffer,
    requestId: string,
    outputPath: string,
    completionType: PendingGeneration['completionType'],
    progress?: {
      expectedTotalSteps: number | null
      maxSteps: number
      onProgress?: (progress: GenerationDenoisingProgress) => void
    },
    generationType?: GenerationWorkerRequest['type'],
  ): Promise<Record<string, unknown>> {
    if (this.closed) {
      throw new GenerationWorkerError('CLOSED', 'The generation worker is unavailable.')
    }
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new GenerationWorkerError('REQUEST_TIMEOUT', 'The generation worker timed out.'))
      }, this.requestTimeoutMs)
      this.active = {
        completionType,
        generationType: generationType ?? null,
        outputPath,
        progress: progress ? { ...progress, lastStep: 0, totalSteps: null } : null,
        reject,
        requestId,
        resolve,
        timer,
      }
      this.child.stdin.write(line, (error) => {
        if (error) {
          this.fail(new GenerationWorkerError('WORKER_EXITED', 'The worker input closed.'))
        }
      })
    })
  }

  private fail(error: GenerationWorkerError): void {
    if (this.closed) {
      return
    }
    this.closed = true
    if (this.startupTimer) {
      clearTimeout(this.startupTimer)
      this.startupTimer = null
      this.startupReject(error)
    }
    if (this.active) {
      clearTimeout(this.active.timer)
      this.active.reject(error)
      this.active = null
    }
    this.child.kill('SIGTERM')
  }

  private observeExit(): void {
    if (!this.exitObserved) {
      this.exitObserved = true
      this.exitResolve()
      GenerationWorkerClient.unconfirmedStartChildren.delete(this)
      void this.releaseRegionalLeases().catch(() => {
        // Keep a retryable owner if filesystem cleanup itself fails after a late exit.
        GenerationWorkerClient.unconfirmedStartChildren.add(this)
      })
    }
  }

  private onMessage(input: unknown): void {
    if (!isRecord(input)) {
      this.fail(new GenerationWorkerError('PROTOCOL_ERROR', 'The worker response is invalid.'))
      return
    }
    if (input.protocolVersion !== PROTOCOL_VERSION) {
      this.fail(new GenerationWorkerError('WORKER_VERSION_MISMATCH', 'Incompatible protocol.'))
      return
    }
    if (this.startupTimer) {
      if (!validReady(input)) {
        this.fail(new GenerationWorkerError('WORKER_VERSION_MISMATCH', 'Incompatible worker.'))
        return
      }
      clearTimeout(this.startupTimer)
      this.startupTimer = null
      this.startupResolve(
        Object.freeze({
          capabilities: Object.freeze([...input.capabilities]),
          protocolVersion: PROTOCOL_VERSION,
          pythonVersion: input.pythonVersion,
          runtimeProfile: RUNTIME_PROFILE,
          workerVersion: input.workerVersion,
        }),
      )
      return
    }
    if (input.type === 'generation-progress') {
      this.onProgressMessage(input)
      return
    }
    const active = this.active
    if (!active || input.requestId !== active.requestId) {
      this.fail(new GenerationWorkerError('PROTOCOL_ERROR', 'Unexpected worker response.'))
      return
    }
    if (input.type === 'error') {
      if (
        typeof input.code !== 'string' ||
        !/^[A-Z][A-Z0-9_]{0,127}$/.test(input.code) ||
        typeof input.message !== 'string' ||
        input.message.length > 512
      ) {
        this.fail(new GenerationWorkerError('PROTOCOL_ERROR', 'Invalid worker error response.'))
        return
      }
      this.fail(
        new GenerationWorkerError(
          'WORKER_REQUEST_FAILED',
          'The generation worker rejected the request.',
          input.code,
          active.completionType === 'generation-done' &&
            (active.generationType === 'generate-illustrious-txt2img' ||
              active.generationType === 'generate-illustrious-img2img' ||
              active.generationType === 'generate-illustrious-outpaint') &&
            input.code === 'GENERATION_WORKER_FAILED'
            ? input.message === 'VAE inference produced non-finite values.'
              ? 'vae-non-finite'
              : input.message === 'UNet inference produced non-finite values.'
                ? 'unet-non-finite'
                : undefined
            : undefined,
        ),
      )
      return
    }
    if (
      input.type !== active.completionType ||
      (active.completionType === 'generation-done' &&
        (input.outputPath !== active.outputPath ||
          !Number.isInteger(input.seed) ||
          (input.seed as number) < 0 ||
          (input.seed as number) > 0xff_ff_ff_ff))
    ) {
      this.fail(new GenerationWorkerError('PROTOCOL_ERROR', 'Invalid worker completion.'))
      return
    }
    clearTimeout(active.timer)
    this.active = null
    if (active.progress) {
      this.settledGeneration = {
        expectedTotalSteps: active.progress.expectedTotalSteps,
        maxSteps: active.progress.maxSteps,
        requestId: active.requestId,
      }
    }
    active.resolve(input)
  }

  private onProgressMessage(input: Record<string, unknown>): void {
    const progress = { step: input.step, totalSteps: input.totalSteps }
    if (
      !supportsInferenceDenoisingProgress(this.readyMessage) ||
      Object.keys(input).length !== 5 ||
      typeof input.requestId !== 'string' ||
      !UUID_PATTERN.test(input.requestId) ||
      !isGenerationDenoisingProgress(progress)
    ) {
      this.fail(new GenerationWorkerError('PROTOCOL_ERROR', 'Invalid worker progress.'))
      return
    }
    const active = this.active
    if (!active || input.requestId !== active.requestId) {
      if (
        this.settledGeneration?.requestId === input.requestId &&
        (this.settledGeneration.expectedTotalSteps === null
          ? progress.totalSteps <= this.settledGeneration.maxSteps
          : progress.totalSteps === this.settledGeneration.expectedTotalSteps)
      ) {
        return
      }
      this.fail(new GenerationWorkerError('PROTOCOL_ERROR', 'Unexpected worker progress.'))
      return
    }
    const owner = active.progress
    if (
      !owner ||
      progress.totalSteps > owner.maxSteps ||
      (owner.expectedTotalSteps !== null && progress.totalSteps !== owner.expectedTotalSteps) ||
      (owner.totalSteps !== null && progress.totalSteps !== owner.totalSteps)
    ) {
      this.fail(new GenerationWorkerError('PROTOCOL_ERROR', 'Inconsistent worker progress.'))
      return
    }
    // Duplicate or older steps cannot move the UI backwards. They do not extend the deadline or
    // relinquish the active exchange; only a validated terminal response can complete it.
    if (progress.step <= owner.lastStep) {
      return
    }
    owner.lastStep = progress.step
    owner.totalSteps = progress.totalSteps
    try {
      owner.onProgress?.(Object.freeze(progress))
    } catch {
      // A presentation observer cannot turn a valid inference result into a failed generation.
    }
  }

  private onStdout(chunk: Buffer): void {
    if (this.closed) {
      return
    }
    let start = 0
    while (start < chunk.length) {
      const newline = chunk.indexOf(0x0a, start)
      const end = newline < 0 ? chunk.length : newline
      const segment = chunk.subarray(start, end)
      if (this.stdoutBytes.length + segment.length > MAX_PROTOCOL_LINE_BYTES) {
        this.fail(new GenerationWorkerError('PROTOCOL_ERROR', 'The worker message is too large.'))
        return
      }
      this.stdoutBytes = Buffer.concat([this.stdoutBytes, segment])
      if (newline < 0) {
        return
      }
      const line = this.stdoutBytes
      this.stdoutBytes = Buffer.alloc(0)
      let message: unknown
      try {
        message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)) as unknown
      } catch {
        this.fail(new GenerationWorkerError('PROTOCOL_ERROR', 'The worker sent invalid JSON.'))
        return
      }
      this.onMessage(message)
      if (this.closed) {
        return
      }
      start = newline + 1
    }
  }

  private async releaseRegionalLeases(): Promise<void> {
    if (!this.exitObserved) {
      return
    }
    for (const lease of this.retainedRegionalLeases) {
      await lease.dispose()
      this.retainedRegionalLeases.delete(lease)
    }
  }

  private async validateRequestPaths(request: GenerationWorkerRequest): Promise<void> {
    if (isOutpaintWorkerRequest(request)) {
      const infill = request.job.infillResource
      try {
        await verifyInferenceAuxiliaryFile({
          byteSize: infill.byteSize,
          managedPath: infill.path,
          sha256: infill.sha256,
        })
      } catch {
        throw new GenerationWorkerError(
          'INVALID_PATH',
          'The exact outpaint infill resource is unavailable or changed.',
        )
      }
    }
    if (isAnimaRequest(request)) {
      for (const file of [
        request.job.model.checkpoint,
        request.job.model.qwen3Encoder,
        request.job.model.vae,
      ]) {
        try {
          const entry = await lstat(file.path)
          if (
            !entry.isFile() ||
            entry.isSymbolicLink() ||
            entry.size !== file.byteSize ||
            (await realpath(file.path)) !== file.path
          ) {
            throw new GenerationWorkerError(
              'INVALID_PATH',
              'An Anima generation model is unsafe or changed.',
            )
          }
        } catch (error) {
          if (error instanceof GenerationWorkerError) {
            throw error
          }
          throw new GenerationWorkerError(
            'INVALID_PATH',
            'An Anima generation model is unavailable.',
          )
        }
      }
    }
    const vae = isAnimaRequest(request) ? null : request.job.vae
    if (vae) {
      try {
        const entry = await lstat(vae.path)
        if (
          !entry.isFile() ||
          entry.isSymbolicLink() ||
          entry.size !== vae.byteSize ||
          (await realpath(vae.path)) !== vae.path
        ) {
          throw new GenerationWorkerError(
            'INVALID_PATH',
            'The generation VAE is unsafe or changed.',
          )
        }
      } catch (error) {
        if (error instanceof GenerationWorkerError) {
          throw error
        }
        throw new GenerationWorkerError('INVALID_PATH', 'The generation VAE is unavailable.')
      }
    }
    for (const lora of request.job.loras ?? []) {
      try {
        const entry = await lstat(lora.path)
        if (
          !entry.isFile() ||
          entry.isSymbolicLink() ||
          entry.size !== lora.byteSize ||
          (await realpath(lora.path)) !== lora.path
        ) {
          throw new GenerationWorkerError(
            'INVALID_PATH',
            'The generation LoRA is unsafe or changed.',
          )
        }
      } catch (error) {
        if (error instanceof GenerationWorkerError) {
          throw error
        }
        throw new GenerationWorkerError('INVALID_PATH', 'The generation LoRA is unavailable.')
      }
    }
    const stagingRoot = await canonicalDirectory(request.job.output.stagingRoot, 'Staging root')
    if (!isWithin(this.scratchBasePath, stagingRoot)) {
      throw new GenerationWorkerError('INVALID_PATH', 'Staging is outside app-owned scratch.')
    }
    const targetPath = request.job.target.path
    const outputPath = request.job.output.pngPath
    if (
      path.dirname(targetPath) !== stagingRoot ||
      path.basename(targetPath) !== 'target.png' ||
      path.dirname(outputPath) !== stagingRoot ||
      (isAnimaRequest(request)
        ? !path.basename(outputPath).endsWith('.png') || path.basename(outputPath) === '.png'
        : path.basename(outputPath) !== 'result.png') ||
      targetPath === outputPath
    ) {
      throw new GenerationWorkerError('INVALID_PATH', 'The generation paths are invalid.')
    }
    try {
      const target = await lstat(targetPath)
      if (
        !target.isFile() ||
        target.isSymbolicLink() ||
        target.nlink !== 1 ||
        (await realpath(targetPath)) !== targetPath
      ) {
        throw new GenerationWorkerError('INVALID_PATH', 'The generation target is unsafe.')
      }
    } catch (error) {
      if (error instanceof GenerationWorkerError) {
        throw error
      }
      throw new GenerationWorkerError('INVALID_PATH', 'The generation target is unavailable.')
    }
    try {
      await lstat(outputPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw new GenerationWorkerError('INVALID_PATH', 'The generation output is unavailable.')
    }
    throw new GenerationWorkerError('INVALID_PATH', 'The generation output already exists.')
  }

  private async waitForExit(timeoutMs: number): Promise<boolean> {
    if (this.exitObserved) {
      return true
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      this.exitPromise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs)
      }),
    ])
    clearTimeout(timer)
    return this.exitObserved
  }
}

function validRequestShape(request: IllustriousGenerationRequestV1): boolean {
  return (
    (request?.type === 'generate-illustrious-txt2img' ||
      request?.type === 'generate-illustrious-img2img') &&
    (request.type === 'generate-illustrious-img2img'
      ? Number.isFinite(request.job?.sampling?.denoisingStrength) &&
        request.job.sampling.denoisingStrength >= 0 &&
        request.job.sampling.denoisingStrength <= 1
      : !('denoisingStrength' in (request.job?.sampling ?? {}))) &&
    ILLUSTRIOUS_SCHEDULER_PAIRS.some(
      (pair) => pair.invokeKey === request.job?.sampling?.scheduler,
    ) &&
    (request.job?.sampling?.noiseProfile === undefined ||
      (isIllustriousNoiseProfileV1(request.job.sampling.noiseProfile) &&
        supportsIllustriousNoiseProfile(
          request.job.sampling.scheduler,
          request.job.sampling.noiseProfile,
        ))) &&
    validWorkerLoras(request.job?.loras) &&
    validWorkerVae(request.job?.vae) &&
    (request.job?.vaePrecision === undefined ||
      ['Auto', 'FP16', 'FP32'].includes(request.job.vaePrecision)) &&
    request.protocolVersion === PROTOCOL_VERSION &&
    typeof request.requestId === 'string' &&
    UUID_PATTERN.test(request.requestId) &&
    typeof request.job?.output?.stagingRoot === 'string' &&
    typeof request.job.output.pngPath === 'string' &&
    typeof request.job?.target?.path === 'string' &&
    Number.isSafeInteger(request.job?.sampling?.steps) &&
    request.job.sampling.steps >= 1 &&
    request.job.sampling.steps <= MAX_DENOISING_STEPS / 2 &&
    (request.job.sampling.cfgRescale === undefined ||
      (Number.isFinite(request.job.sampling.cfgRescale) &&
        request.job.sampling.cfgRescale >= 0 &&
        request.job.sampling.cfgRescale <= 0.99))
  )
}

function isAnimaRequest(
  request: GenerationWorkerRequest,
): request is AnimaOutpaintRequestV1 | AnimaWorkerRequest {
  return (
    request?.type === 'generate-anima-txt2img' ||
    request?.type === 'generate-anima-img2img' ||
    request?.type === 'generate-anima-outpaint'
  )
}

function validWorkerLoras(value: unknown): boolean {
  if (value === undefined) {
    return true
  }
  if (!Array.isArray(value)) {
    return false
  }
  const paths = new Set<string>()
  return value.every((entry: unknown) => {
    if (
      !isRecord(entry) ||
      Object.keys(entry).length !== 4 ||
      typeof entry.path !== 'string' ||
      !path.isAbsolute(entry.path) ||
      path.resolve(entry.path) !== entry.path ||
      typeof entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.byteSize) ||
      (entry.byteSize as number) <= 0 ||
      typeof entry.weight !== 'number' ||
      !Number.isFinite(entry.weight) ||
      paths.has(entry.path)
    ) {
      return false
    }
    paths.add(entry.path)
    return true
  })
}

function validReady(
  message: Record<string, unknown>,
): message is GenerationWorkerReady & Record<string, unknown> {
  return (
    message.type === 'ready' &&
    isQualifiedInferenceWorkerReady(message) &&
    typeof message.pythonVersion === 'string' &&
    /^\d+\.\d+\.\d+$/.test(message.pythonVersion)
  )
}

function deadline(value: number | undefined, fallback: number, label: string): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < 1 || result > 4 * 60 * 60_000) {
    throw new GenerationWorkerError('INVALID_REQUEST', `${label} is outside the supported range.`)
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function canonicalDirectory(input: string, label: string): Promise<string> {
  if (!path.isAbsolute(input) || path.resolve(input) !== input) {
    throw new GenerationWorkerError('INVALID_PATH', `${label} must be an absolute canonical path.`)
  }
  try {
    const entry = await lstat(input)
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      (await realpath(input)) !== input ||
      (process.getuid?.() !== undefined && entry.uid !== process.getuid())
    ) {
      throw new GenerationWorkerError('INVALID_PATH', `${label} is not app-owned and canonical.`)
    }
  } catch (error) {
    if (error instanceof GenerationWorkerError) {
      throw error
    }
    throw new GenerationWorkerError('INVALID_PATH', `${label} is unavailable.`)
  }
  return input
}

async function executableWithin(executable: string, runtimeRoot: string): Promise<string> {
  if (
    !path.isAbsolute(executable) ||
    path.resolve(executable) !== executable ||
    !isWithin(runtimeRoot, executable)
  ) {
    throw new GenerationWorkerError('INVALID_PATH', 'Python executable is outside app runtime.')
  }
  try {
    const resolved = await realpath(executable)
    if (!isWithin(runtimeRoot, resolved) || !(await lstat(resolved)).isFile()) {
      throw new GenerationWorkerError('INVALID_PATH', 'Python executable escapes app runtime.')
    }
    await access(resolved, constants.X_OK)
  } catch (error) {
    if (error instanceof GenerationWorkerError) {
      throw error
    }
    throw new GenerationWorkerError('INVALID_PATH', 'Python executable is unavailable.')
  }
  return executable
}

function isWithin(parent: string, target: string): boolean {
  const relative = path.relative(parent, target)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}
