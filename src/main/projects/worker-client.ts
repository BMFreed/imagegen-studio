import {
  IGS_SRGB_ICC_SHA256,
  isSrgbCompatiblePngColorChunk,
  pngColorChunkLength,
} from '../../shared/projects/color-profile.js'
import { assertProjectMaskBounds } from '../../shared/projects/project-mask.js'
import { IGS_SAFETY_CEILINGS, type IgsPreviewRectV1 } from '../../shared/projects/project-schema.js'
import {
  isSmartPatchCoherenceSettings,
  type SmartPatchCoherenceSettings,
} from '../../shared/projects/smart-patch-coherence-settings.js'

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, type FileHandle, lstat, open, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { inflateSync } from 'node:zlib'

import { validateSrgbPngStream, validateSrgbWebpStream } from './igs-package.js'
import { decodeDerivedProjectMaskPng, readProjectMaskSource } from './project-mask.js'
import { classifyTargetPngAlpha } from './target-png-mode.js'

const PROTOCOL_VERSION = '1'
const WORKER_VERSION = '0.1.0'
const RUNTIME_PROFILE = 'derivatives-only'
const REQUIRED_CAPABILITIES = ['image-derivatives', 'import-normalization', 'self-test'] as const
const MAX_PROTOCOL_LINE_BYTES = 64 * 1024
const MAX_MERGED_BYTES = 256 * 1024 * 1024
const MAX_THUMBNAIL_BYTES = 16 * 1024 * 1024
const MAX_NORMALIZED_BYTES = 512 * 1024 * 1024
const MAX_COMPOSITION_SOURCE_BYTES = 256 * 1024 * 1024
const MAX_COMPOSITION_SOURCE_PIXELS = 64_000_000
const MAX_COMPOSITION_TOTAL_SOURCE_PIXELS = 128_000_000
const MAX_COMPOSITION_LAYERS = 256
const MAX_TARGET_SIDE = 2048
const MAX_TARGET_PIXELS = 4_000_000
const MAX_TARGET_BYTES = 32 * 1024 * 1024
const MAX_ICC_BYTES = 4 * 1024 * 1024
const MAX_RESOURCE_SOURCE_BYTES = 1_000_000
const MAX_RESOURCE_PREVIEW_BYTES = 1_000_000
const MAX_RESOURCE_THUMBNAIL_BYTES = 128_000
const MAX_IMAGE_SIDE = 16_384
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SHUTDOWN_WAIT_MS = 2000

export interface ProjectWorkerLocation {
  /** Absolute executable selected from the app-owned runtime, never looked up in PATH. */
  pythonExecutable: string
  /** Canonical app-owned runtime root, as established by the runtime manager. */
  runtimeRoot: string
  /** Canonical app-owned base for per-request staging directories. */
  stagingBasePath: string
}

export interface ProjectWorkerOptions {
  environment?: NodeJS.ProcessEnv
  requestTimeoutMs?: number
  shutdownWaitMs?: number
  signal?: AbortSignal
  startupTimeoutMs?: number
}

export interface DeriveImageInput {
  inputPath: string
  inputSha256: string
  mergedPngPath: string
  stagingRoot: string
  thumbnailMaxSide: number
  thumbnailWebpPath: string
}

export interface NormalizeImportInput {
  inputPath: string
  inputSha256: string
  normalizedPngPath: string
  originalIccPath: string
  stagingRoot: string
}

export interface ResourcePreviewInput {
  inputPath: string
  inputSha256: string
  previewMaxSide: number
  previewWebpPath: string
  stagingRoot: string
  thumbnailMaxSide: number
  thumbnailWebpPath: string
}

export interface VerifiedResourcePreviewResult {
  preview: VerifiedWorkerImage
  thumbnail: VerifiedWorkerImage
}

/** Frozen source layers in Project stack order, topmost first. */
export interface ComposePreviewInput {
  layers: {
    blendMode: 'multiply' | 'normal' | 'overlay' | 'screen'
    height: number
    opacity: number
    path: string
    sha256: string
    transform: {
      rotationDegrees: number
      scaleX: number
      scaleY: number
      x: number
      y: number
    }
    width: number
  }[]
  mergedPngPath: string
  stagingRoot: string
  thumbnailMaxSide: number
  thumbnailWebpPath: string
}

/** One exact, finite crop of the frozen Project stack for a future generation job. */
export interface ComposeTargetInput {
  bbox: IgsPreviewRectV1
  layers: ComposePreviewInput['layers']
  stagingRoot: string
  targetPngPath: string
}

export type ComposeTargetPayload = {
  bbox: IgsPreviewRectV1
  layers: ComposeTargetInput['layers']
  output: { stagingRoot: string; targetPngPath: string }
}

export type ComposeTargetMode = 'img2img' | 'outpaint' | 'txt2img'

export interface ComposeTargetResult {
  composite: VerifiedWorkerImage
  mode: ComposeTargetMode
  rect: IgsPreviewRectV1
}

/** Main-nominated private files; masks are numeric generate coverage, not image color. */
export interface SmartPatchPreparationInput {
  bbox: IgsPreviewRectV1
  internalResolution: { height: number; width: number }
  mask: (SmartPatchPreparationSource & { bounds: IgsPreviewRectV1 }) | null
  processingMaskPngPath: string
  processingSourcePngPath: string
  source: SmartPatchPreparationSource
  stagingRoot: string
  worldMaskPngPath: string
}

export interface SmartPatchPreparationSource {
  byteSize: number
  height: number
  path: string
  sha256: string
  width: number
}

export type SmartPatchPreparationPayload = {
  bbox: IgsPreviewRectV1
  internalResolution: { height: number; width: number }
  mask: SmartPatchPreparationInput['mask']
  output: {
    processingMaskPngPath: string
    processingSourcePngPath: string
    stagingRoot: string
    worldMaskPngPath: string
  }
  source: SmartPatchPreparationSource
}

export type VerifiedWorkerMask = SmartPatchPreparationSource

export interface SmartPatchPreparationResult {
  processingMask: VerifiedWorkerMask
  processingSource: VerifiedWorkerImage
  worldMask: VerifiedWorkerMask
}

export type SmartPatchFadeMode = 'img2img' | 'inpaint' | 'outpaint' | 'txt2img'

export interface SmartPatchFadeInput {
  contributionMaskPngPath: string
  effectiveMask: VerifiedWorkerMask
  maskBlur: number
  mode: SmartPatchFadeMode
  source: SmartPatchPreparationSource
  stagingRoot: string
}

export type SmartPatchFadePayload = {
  effectiveMask: VerifiedWorkerMask
  maskBlur: number
  mode: SmartPatchFadeMode
  output: { contributionMaskPngPath: string; stagingRoot: string }
  source: SmartPatchPreparationSource
}

export interface SmartPatchFadeResult {
  contributionMask: VerifiedWorkerMask
}

export type SmartPatchCoherenceParameters = SmartPatchCoherenceSettings

export interface SmartPatchConditioningInput {
  coherence: SmartPatchCoherenceParameters
  effectiveMask: VerifiedWorkerMask
  expandedProcessingKeepMaskPngPath: string
  expandedWorldKeepMaskPngPath: string
  finalContributionMaskPngPath: string
  internalResolution: { height: number; width: number }
  latentKeepMaskPngPath: string
  maskBlur: number
  mode: SmartPatchFadeMode
  processingKeepMaskPngPath: string
  source: SmartPatchPreparationSource
  stagingRoot: string
  worldKeepMaskPngPath: string
}

export type SmartPatchConditioningPayload = {
  coherence: SmartPatchCoherenceParameters
  effectiveMask: VerifiedWorkerMask
  internalResolution: { height: number; width: number }
  maskBlur: number
  mode: SmartPatchFadeMode
  output: {
    expandedProcessingKeepMaskPngPath: string
    expandedWorldKeepMaskPngPath: string
    finalContributionMaskPngPath: string
    latentKeepMaskPngPath: string
    processingKeepMaskPngPath: string
    stagingRoot: string
    worldKeepMaskPngPath: string
  }
  source: SmartPatchPreparationSource
}

export interface SmartPatchConditioningResult {
  expandedProcessingKeepMask: VerifiedWorkerMask
  expandedWorldKeepMask: VerifiedWorkerMask
  finalContributionMask: VerifiedWorkerMask
  latentKeepMask: VerifiedWorkerMask
  processingKeepMask: VerifiedWorkerMask
  worldKeepMask: VerifiedWorkerMask
}

export type ComposePreviewResult =
  | { merged: null; rect: null; status: 'empty'; thumbnail: null }
  | {
      merged: VerifiedWorkerImage
      rect: IgsPreviewRectV1
      status: 'rendered'
      thumbnail: VerifiedWorkerImage
    }

export interface VerifiedWorkerImage {
  byteSize: number
  colorSpace: 'srgb'
  height: number
  /** SHA-256 of the embedded RGB ICC profile, validated from the actual file. */
  iccSha256: string
  path: string
  sha256: string
  width: number
}

export interface VerifiedOriginalIcc {
  byteSize: number
  path: string
  sha256: string
}

export interface VerifiedDerivativeResult {
  merged: VerifiedWorkerImage
  thumbnail: VerifiedWorkerImage
}

export interface VerifiedImportResult {
  normalized: VerifiedWorkerImage
  originalIcc: VerifiedOriginalIcc | null
  sourceFormat: 'JPEG' | 'PNG' | 'WEBP'
}

export interface WorkerSelfTestResult {
  colorConversion: 'srgb'
  imageCodecs: ['PNG', 'WEBP']
  pillowVersion: string
  runtimeProfile: 'derivatives-only'
}

export interface WorkerReady {
  capabilities: readonly string[]
  protocolVersion: '1'
  pythonVersion: string
  runtimeProfile: 'derivatives-only'
  workerVersion: '0.1.0'
}

type PendingRequest = {
  id: string
  reject: (error: ProjectWorkerError) => void
  resolve: (message: Record<string, unknown>) => void
  timer: ReturnType<typeof setTimeout>
  type:
    | 'derivative-done'
    | 'import-done'
    | 'preview-done'
    | 'resource-preview-done'
    | 'self-test-result'
    | 'smart-patch-conditioned'
    | 'smart-patch-faded'
    | 'smart-patch-prepared'
    | 'target-done'
}

type OutputPaths = { paths: string[]; stagingRoot: string }

type InspectedFile = { byteSize: number; sha256: string }

type InspectedImage = { height: number; iccSha256: string; width: number }

type ComposePreviewLayer = ComposePreviewInput['layers'][number]

export class ProjectWorkerError extends Error {
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
  ) {
    super(message)
    this.name = 'ProjectWorkerError'
  }
}

export class ProjectWorkerClient {
  private static startupTail: Promise<void> = Promise.resolve()
  private static readonly unconfirmedExitChildren = new Set<ProjectWorkerClient>()

  get ready(): WorkerReady {
    if (!this.readyMessage) {
      throw new ProjectWorkerError('CLOSED', 'The image worker is not ready.')
    }
    return this.readyMessage
  }

  private abortListener: (() => void) | null = null

  private readonly abortSignal: AbortSignal | undefined
  private active: PendingRequest | null = null

  private busy = false
  private closed = false
  private closePromise: Promise<void> | null = null
  private exitObserved = false
  private readonly exitPromise: Promise<void>
  private exitResolve!: () => void
  private forcedTermination = false
  private readyMessage: WorkerReady | null = null
  private readonly requestTimeoutMs: number
  private readonly shutdownWaitMs: number
  private readonly stagingBasePath: string
  private readonly startupPromise: Promise<WorkerReady>
  private startupReject!: (error: ProjectWorkerError) => void
  private startupResolve!: (ready: WorkerReady) => void
  private startupTimer: ReturnType<typeof setTimeout> | null = null
  private stdoutBytes = Buffer.alloc(0)
  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    stagingBasePath: string,
    options: ProjectWorkerOptions,
  ) {
    this.stagingBasePath = stagingBasePath
    this.requestTimeoutMs = deadline(options.requestTimeoutMs, 120_000, 'requestTimeoutMs')
    this.shutdownWaitMs = deadline(options.shutdownWaitMs, SHUTDOWN_WAIT_MS, 'shutdownWaitMs')
    this.abortSignal = options.signal
    const startupTimeoutMs = deadline(options.startupTimeoutMs, 15_000, 'startupTimeoutMs')
    this.startupPromise = new Promise<WorkerReady>((resolve, reject) => {
      this.startupResolve = resolve
      this.startupReject = reject
    })
    this.exitPromise = new Promise<void>((resolve) => {
      this.exitResolve = resolve
    })
    this.startupTimer = setTimeout(() => {
      this.fail(
        new ProjectWorkerError('STARTUP_TIMEOUT', 'The image worker did not become ready in time.'),
      )
    }, startupTimeoutMs)
    this.child.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk))
    // Drain stderr without forwarding paths, credentials or Python tracebacks to a renderer.
    this.child.stderr.on('data', () => undefined)
    this.child.stdin.on('error', () => {
      this.fail(new ProjectWorkerError('WORKER_EXITED', 'The image worker input closed.'))
    })
    this.child.on('error', () => {
      this.fail(new ProjectWorkerError('WORKER_EXITED', 'The image worker could not be started.'))
    })
    this.child.on('exit', () => {
      this.observeExit()
      this.fail(new ProjectWorkerError('WORKER_EXITED', 'The image worker exited.'))
    })
    // A failed spawn can emit `error` without `exit`; `close` follows either path.
    this.child.on('close', () => this.observeExit())
    if (this.abortSignal) {
      this.abortListener = () => {
        // The start/final-close owner observes any failure; cancellation must never create an
        // unhandled rejection or wait for the ordinary request deadline.
        void this.close().catch(() => undefined)
      }
      this.abortSignal.addEventListener('abort', this.abortListener, { once: true })
      if (this.abortSignal.aborted) {
        this.abortListener()
      }
    }
  }
  /** Established Main image children and failed starts share the same physical-exit fence. */
  static hasUnconfirmedExit(): boolean {
    return ProjectWorkerClient.unconfirmedExitChildren.size > 0
  }

  static hasUnconfirmedStartExit(): boolean {
    return ProjectWorkerClient.hasUnconfirmedExit()
  }

  static async retryUnconfirmedExit(): Promise<boolean> {
    const preceding = ProjectWorkerClient.startupTail
    let release!: () => void
    ProjectWorkerClient.startupTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await preceding
    try {
      await ProjectWorkerClient.confirmUnconfirmedExitsUnlocked()
      return true
    } catch {
      return false
    } finally {
      release()
    }
  }

  static async retryUnconfirmedStartExit(): Promise<boolean> {
    return await ProjectWorkerClient.retryUnconfirmedExit()
  }

  static async start(
    location: ProjectWorkerLocation,
    options: ProjectWorkerOptions = {},
  ): Promise<ProjectWorkerClient> {
    deadline(options.requestTimeoutMs, 120_000, 'requestTimeoutMs')
    deadline(options.startupTimeoutMs, 15_000, 'startupTimeoutMs')
    deadline(options.shutdownWaitMs, SHUTDOWN_WAIT_MS, 'shutdownWaitMs')
    const preceding = ProjectWorkerClient.startupTail
    let release!: () => void
    ProjectWorkerClient.startupTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await preceding
    try {
      await ProjectWorkerClient.confirmUnconfirmedExitsUnlocked()
      if (options.signal?.aborted) {
        throw new ProjectWorkerError('CLOSED', 'The image worker startup was canceled.')
      }
      const runtimeRoot = await canonicalDirectory(location.runtimeRoot, 'Runtime root')
      const stagingBasePath = await canonicalDirectory(location.stagingBasePath, 'Staging base')
      const executable = await executableWithin(location.pythonExecutable, runtimeRoot)
      // An established image client may fail close while path inspection awaits. StartupTail
      // serializes starts, not those established closes: confirm again at the actual spawn seam.
      await ProjectWorkerClient.confirmUnconfirmedExitsUnlocked()
      if (ProjectWorkerClient.hasUnconfirmedExit()) {
        throw new ProjectWorkerError(
          'WORKER_EXIT_UNCONFIRMED',
          'The previous image worker has not confirmed exit.',
        )
      }
      if (options.signal?.aborted) {
        throw new ProjectWorkerError('CLOSED', 'The image worker startup was canceled.')
      }
      const child = spawn(executable, ['-I', '-m', 'imagegen_worker'], {
        cwd: runtimeRoot,
        env: options.environment ?? { LANG: 'C.UTF-8' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
      const client = new ProjectWorkerClient(child, stagingBasePath, options)
      try {
        const ready = await client.startupPromise
        if (client.closed) {
          throw new ProjectWorkerError('PROTOCOL_ERROR', 'The image worker stopped during startup.')
        }
        client.readyMessage = ready
        return client
      } catch (error) {
        try {
          await client.close()
        } catch (closeError) {
          if (!client.exitObserved) {
            ProjectWorkerClient.unconfirmedExitChildren.add(client)
          }
          throw closeError
        }
        throw error
      }
    } finally {
      release()
    }
  }

  private static async confirmUnconfirmedExitsUnlocked(): Promise<void> {
    for (const client of ProjectWorkerClient.unconfirmedExitChildren) {
      await client.close()
      ProjectWorkerClient.unconfirmedExitChildren.delete(client)
    }
  }

  async close(): Promise<void> {
    this.closePromise ??= this.closeOne().catch((error: unknown) => {
      // An unconfirmed termination keeps the slot occupied; a later call can observe a delayed
      // exit or retry SIGKILL instead of inheriting a permanently rejected close promise.
      this.closePromise = null
      if (!this.exitObserved) {
        ProjectWorkerClient.unconfirmedExitChildren.add(this)
      }
      throw error
    })
    await this.closePromise
  }

  async composePreview(input: ComposePreviewInput): Promise<ComposePreviewResult> {
    return this.exclusive(async () => {
      if (!this.ready.capabilities.includes('preview-composition')) {
        throw new ProjectWorkerError(
          'WORKER_VERSION_MISMATCH',
          'The image worker cannot compose Project previews.',
        )
      }
      const layers = snapshotCompositionLayers(input.layers)
      const thumbnailMaxSide = input.thumbnailMaxSide
      if (
        !Number.isSafeInteger(thumbnailMaxSide) ||
        thumbnailMaxSide < 32 ||
        thumbnailMaxSide > 1024
      ) {
        throw new ProjectWorkerError(
          'INVALID_REQUEST',
          'Thumbnail size is outside the worker range.',
        )
      }
      const { paths, stagingRoot } = await this.validateOutputPaths(input.stagingRoot, [
        [input.mergedPngPath, '.png'],
        [input.thumbnailWebpPath, '.webp'],
      ])
      for (const layer of layers) {
        await validateInputPath(layer.path, layer.sha256, paths)
        await verifyCompositionInput(layer)
      }
      const stagedBefore = new Set(await readdir(stagingRoot))
      const response = await this.request('compose-preview', 'preview-done', {
        layers,
        output: {
          mergedPngPath: paths[0],
          stagingRoot,
          thumbnailWebpPath: paths[1],
        },
        thumbnailMaxSide,
      })
      if (response.status === 'empty') {
        if (
          response.rect !== null ||
          response.merged !== null ||
          response.thumbnail !== null ||
          (await pathExists(paths[0])) ||
          (await pathExists(paths[1])) ||
          (await readdir(stagingRoot)).some((entry) => !stagedBefore.has(entry))
        ) {
          throw this.outputFailure('An empty preview has unexpected output.')
        }
        return { merged: null, rect: null, status: 'empty', thumbnail: null }
      }
      if (response.status !== 'rendered') {
        throw this.protocolFailure('The preview status is invalid.')
      }
      const rect = validatePreviewRect(response.rect, layers)
      const merged = await verifyImageOutput(paths[0], response.merged, MAX_MERGED_BYTES, 'png')
      const thumbnail = await verifyImageOutput(
        paths[1],
        response.thumbnail,
        MAX_THUMBNAIL_BYTES,
        'webp',
      )
      if (merged.iccSha256 !== thumbnail.iccSha256) {
        throw this.outputFailure('Preview ICC profiles do not match.')
      }
      return { merged, rect, status: 'rendered', thumbnail }
    })
  }

  async composeTarget(input: ComposeTargetInput): Promise<ComposeTargetResult> {
    return this.exclusive(async () => {
      if (!this.ready.capabilities.includes('target-composition')) {
        throw new ProjectWorkerError(
          'WORKER_VERSION_MISMATCH',
          'The image worker cannot compose generation targets.',
        )
      }
      return composeTargetWithTransport(input, this.stagingBasePath, (payload) =>
        this.request('compose-target', 'target-done', payload),
      )
    })
  }

  async conditionSmartPatch(
    input: SmartPatchConditioningInput,
  ): Promise<SmartPatchConditioningResult> {
    return this.exclusive(async () => {
      if (!this.ready.capabilities.includes('smart-patch-conditioning')) {
        throw new ProjectWorkerError(
          'WORKER_VERSION_MISMATCH',
          'The image worker cannot prepare Smart Patch coherence.',
        )
      }
      return conditionSmartPatchWithTransport(input, this.stagingBasePath, (payload) =>
        this.request('condition-smart-patch', 'smart-patch-conditioned', payload),
      )
    })
  }

  async createResourcePreview(
    request: ResourcePreviewInput,
  ): Promise<VerifiedResourcePreviewResult> {
    const input = { ...request }
    return this.exclusive(async () => {
      if (!this.ready.capabilities.includes('resource-preview')) {
        throw new ProjectWorkerError(
          'WORKER_VERSION_MISMATCH',
          'The image worker cannot create resource previews.',
        )
      }
      for (const [side, maximum] of [
        [input.previewMaxSide, 512],
        [input.thumbnailMaxSide, 128],
      ]) {
        if (!Number.isSafeInteger(side) || side < 32 || side > maximum) {
          throw new ProjectWorkerError('INVALID_REQUEST', 'Resource preview size is invalid.')
        }
      }
      const { paths, stagingRoot } = await this.validateOutputPaths(input.stagingRoot, [
        [input.previewWebpPath, '.webp'],
        [input.thumbnailWebpPath, '.webp'],
      ])
      await validateInputPath(input.inputPath, input.inputSha256, paths)
      const source = await inspectVerifiedFile(
        input.inputPath,
        MAX_RESOURCE_SOURCE_BYTES,
        async () => ({}),
      )
      if (source.sha256 !== input.inputSha256) {
        throw new ProjectWorkerError(
          'INVALID_REQUEST',
          'The resource preview source does not match its frozen identity.',
        )
      }
      const response = await this.request('create-resource-preview', 'resource-preview-done', {
        input: { path: input.inputPath, sha256: input.inputSha256 },
        output: { previewWebpPath: paths[0], stagingRoot, thumbnailWebpPath: paths[1] },
        previewMaxSide: input.previewMaxSide,
        thumbnailMaxSide: input.thumbnailMaxSide,
      })
      const preview = await verifyImageOutput(
        paths[0],
        response.preview,
        MAX_RESOURCE_PREVIEW_BYTES,
        'webp',
      )
      const thumbnail = await verifyImageOutput(
        paths[1],
        response.thumbnail,
        MAX_RESOURCE_THUMBNAIL_BYTES,
        'webp',
      )
      if (
        Math.max(preview.width, preview.height) > input.previewMaxSide ||
        Math.max(thumbnail.width, thumbnail.height) > input.thumbnailMaxSide
      ) {
        throw this.outputFailure('Resource preview dimensions exceed their requested limits.')
      }
      return { preview, thumbnail }
    })
  }

  async deriveImage(input: DeriveImageInput): Promise<VerifiedDerivativeResult> {
    return this.exclusive(async () => {
      const { paths, stagingRoot } = await this.validateOutputPaths(input.stagingRoot, [
        [input.mergedPngPath, '.png'],
        [input.thumbnailWebpPath, '.webp'],
      ])
      await validateInputPath(input.inputPath, input.inputSha256, paths)
      if (
        !Number.isSafeInteger(input.thumbnailMaxSide) ||
        input.thumbnailMaxSide < 32 ||
        input.thumbnailMaxSide > 1024
      ) {
        throw new ProjectWorkerError(
          'INVALID_REQUEST',
          'Thumbnail size is outside the worker range.',
        )
      }
      const response = await this.request('derive-image', 'derivative-done', {
        input: { colorSpace: 'srgb', path: input.inputPath, sha256: input.inputSha256 },
        output: {
          mergedPngPath: paths[0],
          stagingRoot,
          thumbnailWebpPath: paths[1],
        },
        thumbnailMaxSide: input.thumbnailMaxSide,
      })
      const merged = await verifyImageOutput(paths[0], response.merged, MAX_MERGED_BYTES, 'png')
      const thumbnail = await verifyImageOutput(
        paths[1],
        response.thumbnail,
        MAX_THUMBNAIL_BYTES,
        'webp',
      )
      if (merged.iccSha256 !== thumbnail.iccSha256) {
        throw this.outputFailure('Derivative ICC profiles do not match.')
      }
      return { merged, thumbnail }
    })
  }

  async fadeSmartPatch(input: SmartPatchFadeInput): Promise<SmartPatchFadeResult> {
    return this.exclusive(async () => {
      if (!this.ready.capabilities.includes('smart-patch-fade')) {
        throw new ProjectWorkerError(
          'WORKER_VERSION_MISMATCH',
          'The image worker cannot prepare Smart Patch contribution fade.',
        )
      }
      return fadeSmartPatchWithTransport(input, this.stagingBasePath, (payload) =>
        this.request('fade-smart-patch', 'smart-patch-faded', payload),
      )
    })
  }

  async normalizeImport(input: NormalizeImportInput): Promise<VerifiedImportResult> {
    return this.exclusive(async () => {
      const { paths, stagingRoot } = await this.validateOutputPaths(input.stagingRoot, [
        [input.normalizedPngPath, '.png'],
        [input.originalIccPath, '.icc'],
      ])
      await validateInputPath(input.inputPath, input.inputSha256, paths)
      const response = await this.request('normalize-import', 'import-done', {
        input: { path: input.inputPath, sha256: input.inputSha256 },
        output: {
          normalizedPngPath: paths[0],
          originalIccPath: paths[1],
          stagingRoot,
        },
      })
      if (
        typeof response.sourceFormat !== 'string' ||
        !['JPEG', 'PNG', 'WEBP'].includes(response.sourceFormat)
      ) {
        throw this.protocolFailure('The import source format is invalid.')
      }
      const normalized = await verifyImageOutput(
        paths[0],
        response.normalized,
        MAX_NORMALIZED_BYTES,
        'png',
      )
      let originalIcc: VerifiedOriginalIcc | null = null
      if (response.originalIcc === null) {
        if (await pathExists(paths[1])) {
          throw this.outputFailure('An unexpected original ICC file was created.')
        }
      } else {
        originalIcc = await verifyOriginalIcc(paths[1], response.originalIcc)
      }
      return {
        normalized,
        originalIcc,
        sourceFormat: response.sourceFormat as VerifiedImportResult['sourceFormat'],
      }
    })
  }

  async prepareSmartPatch(input: SmartPatchPreparationInput): Promise<SmartPatchPreparationResult> {
    return this.exclusive(async () => {
      if (!this.ready.capabilities.includes('smart-patch-preparation')) {
        throw new ProjectWorkerError(
          'WORKER_VERSION_MISMATCH',
          'The image worker cannot prepare Smart Patch masks.',
        )
      }
      return prepareSmartPatchWithTransport(input, this.stagingBasePath, (payload) =>
        this.request('prepare-smart-patch', 'smart-patch-prepared', payload),
      )
    })
  }

  async selfTest(): Promise<WorkerSelfTestResult> {
    return this.exclusive(async () => {
      const response = await this.request('self-test', 'self-test-result', {})
      const checks = object(response.checks, 'Self-test checks')
      if (
        response.runtimeProfile !== RUNTIME_PROFILE ||
        typeof checks.pillowVersion !== 'string' ||
        checks.pillowVersion.length === 0 ||
        !Array.isArray(checks.imageCodecs) ||
        !checks.imageCodecs.includes('PNG') ||
        !checks.imageCodecs.includes('WEBP') ||
        checks.colorConversion !== 'srgb'
      ) {
        throw this.protocolFailure('The image worker self-test response is invalid.')
      }
      return {
        colorConversion: 'srgb',
        imageCodecs: ['PNG', 'WEBP'],
        pillowVersion: checks.pillowVersion,
        runtimeProfile: RUNTIME_PROFILE,
      }
    })
  }

  private async closeOne(): Promise<void> {
    if (!this.closed) {
      this.fail(new ProjectWorkerError('CLOSED', 'The image worker was closed.'))
    }
    this.child.stdin.end()
    if (!this.exitObserved && !this.forcedTermination) {
      await this.waitForExit(this.shutdownWaitMs)
    }
    if (!this.exitObserved) {
      this.forcedTermination = true
      this.child.kill('SIGKILL')
      if (!(await this.waitForExit(this.shutdownWaitMs))) {
        throw new ProjectWorkerError(
          'WORKER_EXIT_UNCONFIRMED',
          'The image worker did not exit after termination was requested.',
        )
      }
    }
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) {
      throw new ProjectWorkerError('CLOSED', 'The image worker is unavailable.')
    }
    if (this.busy) {
      throw new ProjectWorkerError('BUSY', 'The image worker is already processing a request.')
    }
    this.busy = true
    try {
      return await operation()
    } catch (error) {
      if (
        error instanceof ProjectWorkerError &&
        (error.code === 'OUTPUT_MISMATCH' || error.code === 'PROTOCOL_ERROR')
      ) {
        this.fail(error)
      }
      throw error
    } finally {
      this.busy = false
    }
  }

  private fail(error: ProjectWorkerError): void {
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
    ProjectWorkerClient.unconfirmedExitChildren.delete(this)
    if (this.abortListener) {
      this.abortSignal?.removeEventListener('abort', this.abortListener)
      this.abortListener = null
    }

    if (!this.exitObserved) {
      this.exitObserved = true
      this.exitResolve()
    }
  }

  private onMessage(input: unknown): void {
    let message: Record<string, unknown>
    try {
      message = object(input, 'Worker response')
    } catch {
      this.fail(this.protocolFailure('The image worker response is invalid.'))
      return
    }
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      this.fail(
        new ProjectWorkerError(
          'WORKER_VERSION_MISMATCH',
          'The image worker protocol is incompatible.',
        ),
      )
      return
    }
    if (!this.startupTimer && !this.active) {
      this.fail(this.protocolFailure('The image worker sent an unsolicited response.'))
      return
    }
    if (this.startupTimer) {
      if (message.type !== 'ready' || !validReady(message)) {
        this.fail(
          new ProjectWorkerError(
            'WORKER_VERSION_MISMATCH',
            'The image worker version or capabilities are incompatible.',
          ),
        )
        return
      }
      clearTimeout(this.startupTimer)
      this.startupTimer = null
      this.startupResolve(message as unknown as WorkerReady)
      return
    }
    const active = this.active!
    if (message.requestId !== active.id) {
      this.fail(this.protocolFailure('The image worker response ID does not match the request.'))
      return
    }
    if (message.type === 'error') {
      if (
        typeof message.code !== 'string' ||
        typeof message.message !== 'string' ||
        message.code.length > 128 ||
        message.message.length > 512
      ) {
        this.fail(this.protocolFailure('The image worker error response is invalid.'))
        return
      }
      clearTimeout(active.timer)
      this.active = null
      active.reject(
        new ProjectWorkerError(
          message.code === 'IMAGE_TOO_LARGE' ? 'IMAGE_TOO_LARGE' : 'WORKER_REQUEST_FAILED',
          message.message,
          message.code,
        ),
      )
    } else if (message.type === active.type) {
      clearTimeout(active.timer)
      this.active = null
      active.resolve(message)
    } else {
      this.fail(this.protocolFailure('The image worker response type does not match the request.'))
    }
  }

  private onStdout(chunk: Buffer): void {
    if (this.closed) {
      return
    }
    this.stdoutBytes = Buffer.concat([this.stdoutBytes, chunk])
    while (true) {
      const newline = this.stdoutBytes.indexOf(0x0a)
      if (newline < 0) {
        if (this.stdoutBytes.length > MAX_PROTOCOL_LINE_BYTES) {
          this.fail(this.protocolFailure('The image worker sent an oversized message.'))
        }
        return
      }
      if (newline > MAX_PROTOCOL_LINE_BYTES) {
        this.fail(this.protocolFailure('The image worker sent an oversized message.'))
        return
      }
      const line = this.stdoutBytes.subarray(0, newline)
      this.stdoutBytes = this.stdoutBytes.subarray(newline + 1)
      let message: unknown
      try {
        message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)) as unknown
      } catch {
        this.fail(this.protocolFailure('The image worker sent invalid JSON.'))
        return
      }
      this.onMessage(message)
      if (this.closed) {
        return
      }
    }
  }

  private outputFailure(message: string): ProjectWorkerError {
    return new ProjectWorkerError('OUTPUT_MISMATCH', message)
  }

  private protocolFailure(message: string): ProjectWorkerError {
    return new ProjectWorkerError('PROTOCOL_ERROR', message)
  }

  private request(
    type:
      | 'compose-preview'
      | 'compose-target'
      | 'condition-smart-patch'
      | 'create-resource-preview'
      | 'derive-image'
      | 'fade-smart-patch'
      | 'normalize-import'
      | 'prepare-smart-patch'
      | 'self-test',
    resultType: PendingRequest['type'],
    fields: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.closed || this.active) {
      throw new ProjectWorkerError(
        this.closed ? 'CLOSED' : 'BUSY',
        'The image worker is unavailable.',
      )
    }
    const id = randomUUID()
    const line = Buffer.from(
      `${JSON.stringify({ protocolVersion: PROTOCOL_VERSION, requestId: id, type, ...fields })}\n`,
    )
    if (line.length > MAX_PROTOCOL_LINE_BYTES) {
      throw new ProjectWorkerError('INVALID_REQUEST', 'Worker request exceeds the protocol limit.')
    }
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new ProjectWorkerError('REQUEST_TIMEOUT', 'The image worker request timed out.'))
      }, this.requestTimeoutMs)
      this.active = { id, reject, resolve, timer, type: resultType }
      this.child.stdin.write(line, (error) => {
        if (error) {
          this.fail(new ProjectWorkerError('WORKER_EXITED', 'The image worker input closed.'))
        }
      })
    })
  }

  private async validateOutputPaths(
    stagingRootInput: string,
    outputs: [string, string][],
  ): Promise<OutputPaths> {
    return validateOutputPathsWithinBase(this.stagingBasePath, stagingRootInput, outputs)
  }

  private async waitForExit(timeoutMs: number): Promise<boolean> {
    if (this.exitObserved) {
      return true
    }
    let timeout: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      this.exitPromise,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs)
        timeout.unref()
      }),
    ])
    clearTimeout(timeout)
    return this.exitObserved
  }
}

/** Reuses target verification with a transport owned and serialized by the caller. */
export async function composeTargetWithTransport(
  input: ComposeTargetInput,
  stagingBasePath: string,
  request: (payload: ComposeTargetPayload) => Promise<Record<string, unknown>>,
): Promise<ComposeTargetResult> {
  // Freeze every caller-owned value before the first await. The worker rechecks each source
  // hash, so a subsequent file change cannot silently alter this target.
  const layers = snapshotCompositionLayers(input.layers)
  const bbox = { ...input.bbox }
  validateTargetBbox(bbox)
  const { paths, stagingRoot } = await validateOutputPathsWithinBase(
    stagingBasePath,
    input.stagingRoot,
    [[input.targetPngPath, '.png']],
  )
  for (const layer of layers) {
    await validateInputPath(layer.path, layer.sha256, paths)
    await verifyCompositionInput(layer)
  }
  const response = await request({
    bbox,
    layers,
    output: { stagingRoot, targetPngPath: paths[0] },
  })
  if (!['img2img', 'outpaint', 'txt2img'].includes(response.mode as string)) {
    throw new ProjectWorkerError('PROTOCOL_ERROR', 'The generation target mode is invalid.')
  }
  validateTargetRect(response.rect, bbox)
  const composite = await verifyImageOutput(paths[0], response.composite, MAX_TARGET_BYTES, 'png')
  if (composite.width !== bbox.width || composite.height !== bbox.height) {
    throw new ProjectWorkerError(
      'OUTPUT_MISMATCH',
      'The generation target dimensions differ from its frozen bbox.',
    )
  }
  const actualMode = await verifyTargetAlphaMode(composite)
  if (response.mode !== actualMode) {
    throw new ProjectWorkerError(
      'OUTPUT_MISMATCH',
      'The generation target mode differs from its pixels.',
    )
  }
  return { composite, mode: actualMode, rect: bbox }
}

/** Typed private CPU operation; caller transport supplies no substitute pixels. */
export async function prepareSmartPatchWithTransport(
  requestInput: SmartPatchPreparationInput,
  stagingBasePath: string,
  request: (payload: SmartPatchPreparationPayload) => Promise<Record<string, unknown>>,
): Promise<SmartPatchPreparationResult> {
  const input = structuredClone(requestInput)
  validateTargetBbox(input.bbox)
  assertSmartPatchProcessingSize(input.internalResolution)
  if (input.source.width !== input.bbox.width || input.source.height !== input.bbox.height) {
    throw new ProjectWorkerError(
      'INVALID_REQUEST',
      'Smart Patch source dimensions differ from bbox.',
    )
  }
  if (input.mask) {
    assertProjectMaskBounds(input.mask.bounds)
    if (
      input.mask.width !== input.mask.bounds.width ||
      input.mask.height !== input.mask.bounds.height
    ) {
      throw new ProjectWorkerError(
        'INVALID_REQUEST',
        'Smart Patch mask dimensions differ from bounds.',
      )
    }
  }
  const { paths, stagingRoot } = await validateOutputPathsWithinBase(
    stagingBasePath,
    input.stagingRoot,
    [
      [input.worldMaskPngPath, '.png'],
      [input.processingSourcePngPath, '.png'],
      [input.processingMaskPngPath, '.png'],
    ],
  )
  await validateInputPath(input.source.path, input.source.sha256, paths)
  const source = await verifyImageOutput(
    input.source.path,
    { ...input.source, colorSpace: 'srgb' },
    MAX_TARGET_BYTES,
    'png',
  )
  await verifyTargetAlphaMode(source)
  if (input.mask) {
    await validateInputPath(input.mask.path, input.mask.sha256, paths)
    await readProjectMaskSource(
      { sourcePath: input.mask.path },
      {
        bytes: input.mask.byteSize,
        height: input.mask.height,
        path: input.mask.path,
        sha256: input.mask.sha256,
        width: input.mask.width,
      },
    )
  }
  const response = await request({
    bbox: input.bbox,
    internalResolution: input.internalResolution,
    mask: input.mask,
    output: {
      processingMaskPngPath: paths[2],
      processingSourcePngPath: paths[1],
      stagingRoot,
      worldMaskPngPath: paths[0],
    },
    source: input.source,
  })
  const worldMask = await verifyCoverageOutput(paths[0], response.worldMask, input.bbox)
  const processingMask = await verifyCoverageOutput(
    paths[2],
    response.processingMask,
    input.internalResolution,
  )
  const processingSource = await verifyImageOutput(
    paths[1],
    response.processingSource,
    MAX_TARGET_BYTES,
    'png',
  )
  if (
    processingSource.width !== input.internalResolution.width ||
    processingSource.height !== input.internalResolution.height
  ) {
    throw new ProjectWorkerError(
      'OUTPUT_MISMATCH',
      'Smart Patch processing source has wrong dimensions.',
    )
  }
  await verifyTargetAlphaMode(processingSource)
  return { processingMask, processingSource, worldMask }
}

/** World-space output geometry; conditioning and original masks remain separate. */
export async function fadeSmartPatchWithTransport(
  requestInput: SmartPatchFadeInput,
  stagingBasePath: string,
  request: (payload: SmartPatchFadePayload) => Promise<Record<string, unknown>>,
): Promise<SmartPatchFadeResult> {
  const input = structuredClone(requestInput)
  if (!Number.isInteger(input.maskBlur) || input.maskBlur < 0 || input.maskBlur > 512) {
    throw new ProjectWorkerError('INVALID_REQUEST', 'Smart Patch blur is invalid.')
  }
  if (!['img2img', 'inpaint', 'outpaint', 'txt2img'].includes(input.mode)) {
    throw new ProjectWorkerError('INVALID_REQUEST', 'Smart Patch fade mode is invalid.')
  }
  assertSmartPatchProcessingSize(input.source)
  if (
    input.effectiveMask.width !== input.source.width ||
    input.effectiveMask.height !== input.source.height
  ) {
    throw new ProjectWorkerError('INVALID_REQUEST', 'Smart Patch fade planes differ in size.')
  }
  const { paths, stagingRoot } = await validateOutputPathsWithinBase(
    stagingBasePath,
    input.stagingRoot,
    [[input.contributionMaskPngPath, '.png']],
  )
  await validateInputPath(input.source.path, input.source.sha256, paths)
  await validateInputPath(input.effectiveMask.path, input.effectiveMask.sha256, paths)
  const source = await verifyImageOutput(
    input.source.path,
    { ...input.source, colorSpace: 'srgb' },
    MAX_TARGET_BYTES,
    'png',
  )
  const sourceMode = await verifyTargetAlphaMode(source)
  const maskBytes = await readSmartPatchPreparationOutput(
    input.effectiveMask.path,
    input.effectiveMask,
    'mask',
  )
  const coverage = decodeDerivedProjectMaskPng(maskBytes, input.effectiveMask)
  const actualMode =
    sourceMode === 'img2img' && coverage.some((value) => value > 0) ? 'inpaint' : sourceMode
  if (input.mode !== actualMode) {
    throw new ProjectWorkerError(
      'INVALID_REQUEST',
      'Smart Patch fade mode differs from its inputs.',
    )
  }
  const response = structuredClone(
    await request({
      effectiveMask: input.effectiveMask,
      maskBlur: input.maskBlur,
      mode: input.mode,
      output: { contributionMaskPngPath: paths[0], stagingRoot },
      source: input.source,
    }),
  )
  return {
    contributionMask: await verifyCoverageOutput(paths[0], response.contributionMask, input.source),
  }
}

/** Snapshot caller policy before any filesystem or worker await. */
export function captureSmartPatchCoherenceParameters(
  profile: SmartPatchCoherenceParameters,
): SmartPatchCoherenceParameters {
  if (!isSmartPatchCoherenceSettings(profile)) {
    throw new ProjectWorkerError('INVALID_REQUEST', 'Smart Patch coherence profile is invalid.')
  }
  return { edgeSize: profile.edgeSize, minimumDenoise: profile.minimumDenoise, mode: profile.mode }
}

/** Private numeric conditioning; it does not mutate authored masks or enter inference. */
export async function conditionSmartPatchWithTransport(
  requestInput: SmartPatchConditioningInput,
  stagingBasePath: string,
  request: (payload: SmartPatchConditioningPayload) => Promise<Record<string, unknown>>,
): Promise<SmartPatchConditioningResult> {
  const input = structuredClone(requestInput)
  input.coherence = captureSmartPatchCoherenceParameters(input.coherence)
  assertSmartPatchConditioningSize(input.internalResolution)
  assertSmartPatchProcessingSize(input.source)
  if (
    !Number.isInteger(input.maskBlur) ||
    input.maskBlur < 0 ||
    input.maskBlur > 512 ||
    !['img2img', 'inpaint', 'outpaint', 'txt2img'].includes(input.mode) ||
    input.effectiveMask.width !== input.source.width ||
    input.effectiveMask.height !== input.source.height
  ) {
    throw new ProjectWorkerError('INVALID_REQUEST', 'Smart Patch conditioning inputs are invalid.')
  }
  const { paths, stagingRoot } = await validateOutputPathsWithinBase(
    stagingBasePath,
    input.stagingRoot,
    [
      [input.worldKeepMaskPngPath, '.png'],
      [input.processingKeepMaskPngPath, '.png'],
      [input.latentKeepMaskPngPath, '.png'],
      [input.expandedProcessingKeepMaskPngPath, '.png'],
      [input.expandedWorldKeepMaskPngPath, '.png'],
      [input.finalContributionMaskPngPath, '.png'],
    ],
  )
  await validateInputPath(input.source.path, input.source.sha256, paths)
  await validateInputPath(input.effectiveMask.path, input.effectiveMask.sha256, paths)
  const source = await verifyImageOutput(
    input.source.path,
    { ...input.source, colorSpace: 'srgb' },
    MAX_TARGET_BYTES,
    'png',
  )
  const sourceMode = await verifyTargetAlphaMode(source)
  const maskBytes = await readSmartPatchPreparationOutput(
    input.effectiveMask.path,
    input.effectiveMask,
    'mask',
  )
  const coverage = decodeDerivedProjectMaskPng(maskBytes, input.effectiveMask)
  const actualMode =
    sourceMode === 'img2img' && coverage.some((value) => value > 0) ? 'inpaint' : sourceMode
  if (input.mode !== actualMode) {
    throw new ProjectWorkerError(
      'INVALID_REQUEST',
      'Smart Patch conditioning mode differs from its inputs.',
    )
  }
  const response = structuredClone(
    await request({
      coherence: input.coherence,
      effectiveMask: input.effectiveMask,
      internalResolution: input.internalResolution,
      maskBlur: input.maskBlur,
      mode: input.mode,
      output: {
        expandedProcessingKeepMaskPngPath: paths[3],
        expandedWorldKeepMaskPngPath: paths[4],
        finalContributionMaskPngPath: paths[5],
        latentKeepMaskPngPath: paths[2],
        processingKeepMaskPngPath: paths[1],
        stagingRoot,
        worldKeepMaskPngPath: paths[0],
      },
      source: input.source,
    }),
  )
  return {
    expandedProcessingKeepMask: await verifyCoverageOutput(
      paths[3],
      response.expandedProcessingKeepMask,
      input.internalResolution,
    ),
    expandedWorldKeepMask: await verifyCoverageOutput(
      paths[4],
      response.expandedWorldKeepMask,
      input.source,
    ),
    finalContributionMask: await verifyCoverageOutput(
      paths[5],
      response.finalContributionMask,
      input.source,
    ),
    latentKeepMask: await verifyCoverageOutput(paths[2], response.latentKeepMask, {
      height: input.internalResolution.height / 8,
      width: input.internalResolution.width / 8,
    }),
    processingKeepMask: await verifyCoverageOutput(
      paths[1],
      response.processingKeepMask,
      input.internalResolution,
    ),
    worldKeepMask: await verifyCoverageOutput(paths[0], response.worldKeepMask, input.source),
  }
}

/** Only latent conditioning requires an eight-pixel grid; ordinary prep still accepts one pixel. */
export function assertSmartPatchConditioningSize(size: { height: number; width: number }): void {
  assertSmartPatchProcessingSize(size)
  if (size.width < 8 || size.height < 8 || size.width % 8 !== 0 || size.height % 8 !== 0) {
    throw new ProjectWorkerError(
      'INVALID_REQUEST',
      'Smart Patch conditioning requires an eight-pixel internal grid.',
    )
  }
}

/** Existing finite CPU target limits, separate from portable/model size validity. */
export function assertSmartPatchProcessingSize(size: { height: number; width: number }): void {
  validateTargetBbox({ ...size, x: 0, y: 0 })
}

/** Recheck nominated files before Main consumes bytes, including adapters outside this client. */
export async function readSmartPatchPreparationOutput(
  expectedPath: string,
  artifactInput: VerifiedWorkerImage | VerifiedWorkerMask,
  kind: 'mask' | 'source',
): Promise<Buffer> {
  const artifact = { ...artifactInput }
  if (artifact.path !== expectedPath) {
    throw new ProjectWorkerError(
      'OUTPUT_MISMATCH',
      'Smart Patch output path differs from its nomination.',
    )
  }
  validateTargetBbox({ height: artifact.height, width: artifact.width, x: 0, y: 0 })
  if (kind === 'mask') {
    if (
      Object.keys(artifact).some(
        (key) => !['byteSize', 'height', 'path', 'sha256', 'width'].includes(key),
      )
    ) {
      throw new ProjectWorkerError(
        'OUTPUT_MISMATCH',
        'Numeric mask must not contain color metadata.',
      )
    }
    await verifyCoverageOutput(
      expectedPath,
      {
        byteSize: artifact.byteSize,
        height: artifact.height,
        sha256: artifact.sha256,
        width: artifact.width,
      },
      artifact,
    )
  } else {
    const verified = await verifyImageOutput(expectedPath, artifact, MAX_TARGET_BYTES, 'png')
    if (!('iccSha256' in artifact) || artifact.iccSha256 !== verified.iccSha256) {
      throw new ProjectWorkerError(
        'OUTPUT_MISMATCH',
        'Smart Patch source ICC differs from its pixels.',
      )
    }
  }
  const actual = await inspectVerifiedFile(expectedPath, MAX_TARGET_BYTES, async (file, size) => ({
    bytes: await readAt(file, 0, size),
  }))
  if (actual.byteSize !== artifact.byteSize || actual.sha256 !== artifact.sha256) {
    throw new ProjectWorkerError(
      'OUTPUT_MISMATCH',
      'Smart Patch output changed before consumption.',
    )
  }
  if (kind === 'mask') {
    decodeDerivedProjectMaskPng(actual.bytes, artifact)
  } else {
    classifyTargetPngAlpha(actual.bytes, artifact.width, artifact.height)
  }
  return actual.bytes
}

async function verifyCoverageOutput(
  filePath: string,
  rawMetadata: unknown,
  dimensions: { height: number; width: number },
): Promise<VerifiedWorkerMask> {
  const metadata = object(rawMetadata, 'Worker numeric mask metadata')
  if (
    Object.keys(metadata).some((key) => !['byteSize', 'height', 'sha256', 'width'].includes(key)) ||
    !Number.isSafeInteger(metadata.byteSize) ||
    (metadata.byteSize as number) < 1 ||
    (metadata.byteSize as number) > MAX_TARGET_BYTES ||
    metadata.width !== dimensions.width ||
    metadata.height !== dimensions.height ||
    typeof metadata.sha256 !== 'string' ||
    !SHA256_PATTERN.test(metadata.sha256)
  ) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker numeric mask metadata is invalid.')
  }
  const actual = await inspectVerifiedFile(filePath, MAX_TARGET_BYTES, async (file, size) => {
    decodeDerivedProjectMaskPng(await readAt(file, 0, size), dimensions)
    return {}
  })
  if (actual.byteSize !== metadata.byteSize || actual.sha256 !== metadata.sha256) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The numeric mask differs from its metadata.')
  }
  return {
    ...actual,
    height: dimensions.height,
    path: filePath,
    width: dimensions.width,
  }
}

async function validateOutputPathsWithinBase(
  stagingBasePath: string,
  stagingRootInput: string,
  outputs: [string, string][],
): Promise<OutputPaths> {
  const stagingRoot = await canonicalDirectory(stagingRootInput, 'Staging root')
  if (!isWithin(stagingBasePath, stagingRoot)) {
    throw new ProjectWorkerError('INVALID_PATH', 'Staging root is outside app-owned storage.')
  }
  const paths: string[] = []
  for (const [output, suffix] of outputs) {
    if (
      !path.isAbsolute(output) ||
      path.resolve(output) !== output ||
      path.extname(output).toLowerCase() !== suffix
    ) {
      throw new ProjectWorkerError('INVALID_PATH', 'Worker output path is invalid.')
    }
    if (
      !isWithin(stagingRoot, output) ||
      (await canonicalDirectory(path.dirname(output), 'Output directory')) !== path.dirname(output)
    ) {
      throw new ProjectWorkerError('INVALID_PATH', 'Worker output is outside staging.')
    }
    if (await pathExists(output)) {
      throw new ProjectWorkerError('INVALID_PATH', 'Worker output already exists.')
    }
    paths.push(output)
  }
  if (new Set(paths).size !== paths.length) {
    throw new ProjectWorkerError('INVALID_PATH', 'Worker output paths must be distinct.')
  }
  return { paths, stagingRoot }
}

function deadline(value: number | undefined, fallback: number, label: string): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < 1 || result > 30 * 60_000) {
    throw new ProjectWorkerError('INVALID_REQUEST', `${label} is outside the supported range.`)
  }
  return result
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProjectWorkerError('PROTOCOL_ERROR', `${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function validReady(message: Record<string, unknown>): boolean {
  const capabilities = message.capabilities
  if (!Array.isArray(capabilities)) {
    return false
  }
  return (
    message.workerVersion === WORKER_VERSION &&
    message.runtimeProfile === RUNTIME_PROFILE &&
    typeof message.pythonVersion === 'string' &&
    /^\d+\.\d+\.\d+$/.test(message.pythonVersion) &&
    capabilities.every((capability) => typeof capability === 'string') &&
    REQUIRED_CAPABILITIES.every((capability) => capabilities.includes(capability))
  )
}

async function canonicalDirectory(input: string, label: string): Promise<string> {
  if (!path.isAbsolute(input) || path.resolve(input) !== input) {
    throw new ProjectWorkerError('INVALID_PATH', `${label} must be absolute and canonical.`)
  }
  try {
    const entry = await lstat(input)
    if (!entry.isDirectory() || entry.isSymbolicLink() || (await realpath(input)) !== input) {
      throw new ProjectWorkerError('INVALID_PATH', `${label} is not a canonical directory.`)
    }
  } catch (error) {
    if (error instanceof ProjectWorkerError) {
      throw error
    }
    throw new ProjectWorkerError('INVALID_PATH', `${label} is unavailable.`)
  }
  return input
}

async function executableWithin(executable: string, runtimeRoot: string): Promise<string> {
  if (
    !path.isAbsolute(executable) ||
    path.resolve(executable) !== executable ||
    !isWithin(runtimeRoot, executable)
  ) {
    throw new ProjectWorkerError('INVALID_PATH', 'Python executable is outside the app runtime.')
  }
  try {
    const resolved = await realpath(executable)
    if (!isWithin(runtimeRoot, resolved) || !(await lstat(resolved)).isFile()) {
      throw new ProjectWorkerError('INVALID_PATH', 'Python executable escapes the app runtime.')
    }
    await access(resolved, constants.X_OK)
  } catch (error) {
    if (error instanceof ProjectWorkerError) {
      throw error
    }
    throw new ProjectWorkerError('INVALID_PATH', 'Python executable is unavailable.')
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

function snapshotCompositionLayers(input: ComposePreviewInput['layers']): ComposePreviewLayer[] {
  if (!Array.isArray(input) || input.length > MAX_COMPOSITION_LAYERS) {
    throw new ProjectWorkerError(
      'INVALID_REQUEST',
      'Composition layer count is outside the worker range.',
    )
  }
  // Copy before any asynchronous source/path validation: callers may still edit Project state.
  const layers = input.map((layer) => {
    validateCompositionLayer(layer)
    return {
      blendMode: layer.blendMode,
      height: layer.height,
      opacity: layer.opacity,
      path: layer.path,
      sha256: layer.sha256,
      transform: {
        rotationDegrees: layer.transform.rotationDegrees,
        scaleX: layer.transform.scaleX,
        scaleY: layer.transform.scaleY,
        x: layer.transform.x,
        y: layer.transform.y,
      },
      width: layer.width,
    }
  })
  if (
    layers.reduce((total, layer) => total + layer.width * layer.height, 0) >
    MAX_COMPOSITION_TOTAL_SOURCE_PIXELS
  ) {
    throw new ProjectWorkerError(
      'INVALID_REQUEST',
      'Composition source pixels exceed the worker limit.',
    )
  }
  return layers
}

function validateTargetBbox(bbox: IgsPreviewRectV1): void {
  const { height, width, x, y } = bbox
  if (
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y) ||
    Math.abs(x) > IGS_SAFETY_CEILINGS.coordinateMagnitude ||
    Math.abs(y) > IGS_SAFETY_CEILINGS.coordinateMagnitude ||
    !Number.isSafeInteger(width) ||
    width < 1 ||
    !Number.isSafeInteger(height) ||
    height < 1
  ) {
    throw new ProjectWorkerError('INVALID_REQUEST', 'Generation bbox is outside the worker range.')
  }
  if (width > MAX_TARGET_SIDE || height > MAX_TARGET_SIDE || width * height > MAX_TARGET_PIXELS) {
    throw new ProjectWorkerError(
      'IMAGE_TOO_LARGE',
      'Generation bbox exceeds the worker pixel limit.',
    )
  }
}

function validateTargetRect(rawRect: unknown, bbox: IgsPreviewRectV1): void {
  if (typeof rawRect !== 'object' || rawRect === null || Array.isArray(rawRect)) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The generation target rect is invalid.')
  }
  const rect = rawRect as Record<string, unknown>
  if (
    rect.x !== bbox.x ||
    rect.y !== bbox.y ||
    rect.width !== bbox.width ||
    rect.height !== bbox.height
  ) {
    throw new ProjectWorkerError(
      'OUTPUT_MISMATCH',
      'The generation target rect differs from its bbox.',
    )
  }
}

// Output-verification helpers live below. They consume nominated app-owned paths, never paths
// supplied by a worker response.

async function validateInputPath(input: string, sha256: string, outputs: string[]): Promise<void> {
  if (
    !SHA256_PATTERN.test(sha256) ||
    !path.isAbsolute(input) ||
    path.resolve(input) !== input ||
    outputs.includes(input)
  ) {
    throw new ProjectWorkerError('INVALID_REQUEST', 'Worker input identity is invalid.')
  }
  try {
    const entry = await lstat(input)
    if (!entry.isFile() || entry.isSymbolicLink() || (await realpath(input)) !== input) {
      throw new ProjectWorkerError('INVALID_PATH', 'Worker input is not a canonical regular file.')
    }
  } catch (error) {
    if (error instanceof ProjectWorkerError) {
      throw error
    }
    throw new ProjectWorkerError('INVALID_PATH', 'Worker input is unavailable.')
  }
}

function validateCompositionLayer(layer: ComposePreviewLayer): void {
  if (
    typeof layer !== 'object' ||
    layer === null ||
    !Number.isSafeInteger(layer.width) ||
    layer.width < 1 ||
    layer.width > MAX_IMAGE_SIDE ||
    !Number.isSafeInteger(layer.height) ||
    layer.height < 1 ||
    layer.height > MAX_IMAGE_SIDE ||
    layer.width * layer.height > MAX_COMPOSITION_SOURCE_PIXELS ||
    typeof layer.opacity !== 'number' ||
    !Number.isFinite(layer.opacity) ||
    layer.opacity < 0 ||
    layer.opacity > 1 ||
    !['multiply', 'normal', 'overlay', 'screen'].includes(layer.blendMode) ||
    typeof layer.path !== 'string' ||
    !['.png', '.webp'].includes(path.extname(layer.path).toLowerCase()) ||
    typeof layer.transform !== 'object' ||
    layer.transform === null
  ) {
    throw new ProjectWorkerError('INVALID_REQUEST', 'A composition layer is invalid.')
  }
  const { rotationDegrees, scaleX, scaleY, x, y } = layer.transform
  if (
    ![rotationDegrees, scaleX, scaleY, x, y].every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    ) ||
    Math.abs(rotationDegrees) > IGS_SAFETY_CEILINGS.rotationDegrees ||
    scaleX === 0 ||
    Math.abs(scaleX) > IGS_SAFETY_CEILINGS.scaleMagnitude ||
    scaleY === 0 ||
    Math.abs(scaleY) > IGS_SAFETY_CEILINGS.scaleMagnitude ||
    Math.abs(x) > IGS_SAFETY_CEILINGS.coordinateMagnitude ||
    Math.abs(y) > IGS_SAFETY_CEILINGS.coordinateMagnitude
  ) {
    throw new ProjectWorkerError('INVALID_REQUEST', 'A composition layer transform is invalid.')
  }
}

async function verifyCompositionInput(layer: ComposePreviewLayer): Promise<void> {
  const format = path.extname(layer.path).toLowerCase() === '.png' ? 'png' : 'webp'
  try {
    const actual = await inspectVerifiedFile(
      layer.path,
      MAX_COMPOSITION_SOURCE_BYTES,
      async (file, byteSize) => {
        if (format === 'png') {
          await validateSrgbPngStream(
            file.createReadStream({ autoClose: false, start: 0 }),
            layer.path,
            MAX_COMPOSITION_SOURCE_BYTES,
            MAX_IMAGE_SIDE,
          )
          return inspectPng(file, byteSize, true)
        }
        await validateSrgbWebpStream(
          file.createReadStream({ autoClose: false, start: 0 }),
          layer.path,
          MAX_COMPOSITION_SOURCE_BYTES,
          MAX_IMAGE_SIDE,
        )
        return inspectWebp(file, byteSize, true)
      },
    )
    if (
      actual.sha256 !== layer.sha256 ||
      actual.width !== layer.width ||
      actual.height !== layer.height ||
      actual.iccSha256 !== IGS_SRGB_ICC_SHA256
    ) {
      throw new ProjectWorkerError('INVALID_REQUEST', 'A frozen preview input has changed.')
    }
  } catch {
    throw new ProjectWorkerError('INVALID_REQUEST', 'A frozen preview input is invalid or changed.')
  }
}

function validatePreviewRect(rawRect: unknown, layers: ComposePreviewLayer[]): IgsPreviewRectV1 {
  if (typeof rawRect !== 'object' || rawRect === null || Array.isArray(rawRect)) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The rendered preview has no valid bounds.')
  }
  const rect = rawRect as Record<string, unknown>
  const { height, width, x, y } = rect
  const ceiling = IGS_SAFETY_CEILINGS.previewCoordinateMagnitude
  if (
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y) ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    (width as number) < 1 ||
    (width as number) > IGS_SAFETY_CEILINGS.previewExtent ||
    (height as number) < 1 ||
    (height as number) > IGS_SAFETY_CEILINGS.previewExtent ||
    (x as number) < -ceiling ||
    (y as number) < -ceiling ||
    (x as number) + (width as number) > ceiling ||
    (y as number) + (height as number) > ceiling
  ) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The rendered preview bounds are invalid.')
  }
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const layer of layers) {
    if (layer.opacity === 0) {
      continue
    }
    const { rotationDegrees, scaleX, scaleY, x: originX, y: originY } = layer.transform
    const radians = (rotationDegrees * Math.PI) / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    for (const [cornerX, cornerY] of [
      [0, 0],
      [layer.width, 0],
      [0, layer.height],
      [layer.width, layer.height],
    ]) {
      const scaledX = cornerX * scaleX
      const scaledY = cornerY * scaleY
      const px = originX + scaledX * cosine - scaledY * sine
      const py = originY + scaledX * sine + scaledY * cosine
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px)
      maxY = Math.max(maxY, py)
    }
  }
  if (
    !Number.isFinite(minX) ||
    (x as number) < Math.floor(minX) ||
    (y as number) < Math.floor(minY) ||
    (x as number) + (width as number) > Math.ceil(maxX) ||
    (y as number) + (height as number) > Math.ceil(maxY)
  ) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'Preview bounds exceed the frozen layers.')
  }
  return { height: height as number, width: width as number, x: x as number, y: y as number }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function verifyTargetAlphaMode(composite: VerifiedWorkerImage): Promise<ComposeTargetMode> {
  const inspected = await inspectVerifiedFile(
    composite.path,
    MAX_TARGET_BYTES,
    async (file, size) => {
      try {
        return {
          mode: classifyTargetPngAlpha(
            await readAt(file, 0, size),
            composite.width,
            composite.height,
          ),
        }
      } catch (error) {
        throw new ProjectWorkerError(
          'OUTPUT_MISMATCH',
          error instanceof Error ? error.message : 'The generation target pixels are invalid.',
        )
      }
    },
  )
  if (inspected.sha256 !== composite.sha256 || inspected.byteSize !== composite.byteSize) {
    throw new ProjectWorkerError(
      'OUTPUT_MISMATCH',
      'The generation target changed after verification.',
    )
  }
  return inspected.mode
}

async function verifyImageOutput(
  filePath: string,
  rawMetadata: unknown,
  maxBytes: number,
  format: 'png' | 'webp',
): Promise<VerifiedWorkerImage> {
  const metadata = object(rawMetadata, 'Worker image metadata')
  if (
    !Number.isSafeInteger(metadata.byteSize) ||
    (metadata.byteSize as number) < 1 ||
    (metadata.byteSize as number) > maxBytes ||
    !Number.isSafeInteger(metadata.width) ||
    (metadata.width as number) < 1 ||
    (metadata.width as number) > MAX_IMAGE_SIDE ||
    !Number.isSafeInteger(metadata.height) ||
    (metadata.height as number) < 1 ||
    (metadata.height as number) > MAX_IMAGE_SIDE ||
    typeof metadata.sha256 !== 'string' ||
    !SHA256_PATTERN.test(metadata.sha256) ||
    metadata.colorSpace !== 'srgb'
  ) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker image metadata is invalid.')
  }
  const actual = await inspectVerifiedFile(filePath, maxBytes, async (file, byteSize) => {
    if (format === 'png') {
      await validateSrgbPngStream(
        file.createReadStream({ autoClose: false, start: 0 }),
        filePath,
        maxBytes,
        MAX_IMAGE_SIDE,
      )
      return await inspectPng(file, byteSize)
    }
    await validateSrgbWebpStream(
      file.createReadStream({ autoClose: false, start: 0 }),
      filePath,
      maxBytes,
      MAX_IMAGE_SIDE,
    )
    return await inspectWebp(file, byteSize)
  })
  if (
    actual.byteSize !== metadata.byteSize ||
    actual.sha256 !== metadata.sha256 ||
    actual.width !== metadata.width ||
    actual.height !== metadata.height ||
    actual.iccSha256 !== IGS_SRGB_ICC_SHA256
  ) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker image does not match its metadata.')
  }
  return {
    byteSize: actual.byteSize,
    colorSpace: 'srgb',
    height: actual.height,
    iccSha256: actual.iccSha256,
    path: filePath,
    sha256: actual.sha256,
    width: actual.width,
  }
}

async function verifyOriginalIcc(
  filePath: string,
  rawMetadata: unknown,
): Promise<VerifiedOriginalIcc> {
  const metadata = object(rawMetadata, 'Original ICC metadata')
  if (
    !Number.isSafeInteger(metadata.byteSize) ||
    (metadata.byteSize as number) < 128 ||
    (metadata.byteSize as number) > MAX_ICC_BYTES ||
    typeof metadata.sha256 !== 'string' ||
    !SHA256_PATTERN.test(metadata.sha256)
  ) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The original ICC metadata is invalid.')
  }
  const actual = await inspectVerifiedFile(filePath, MAX_ICC_BYTES, async (file, byteSize) => {
    const profile = await readAt(file, 0, Math.min(byteSize, MAX_ICC_BYTES))
    validateIcc(profile, false)
    return {}
  })
  if (actual.byteSize !== metadata.byteSize || actual.sha256 !== metadata.sha256) {
    throw new ProjectWorkerError(
      'OUTPUT_MISMATCH',
      'The original ICC file differs from its metadata.',
    )
  }
  return { byteSize: actual.byteSize, path: filePath, sha256: actual.sha256 }
}

async function inspectVerifiedFile<T extends Record<string, unknown>>(
  filePath: string,
  maxBytes: number,
  inspect: (file: FileHandle, byteSize: number) => Promise<T>,
): Promise<InspectedFile & T> {
  let file: FileHandle
  try {
    file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker output is unavailable.')
  }
  try {
    const before = await file.stat({ bigint: true })
    if (!before.isFile() || before.size < 1n || before.size > BigInt(maxBytes)) {
      throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker output is not a bounded file.')
    }
    const byteSize = Number(before.size)
    const hash = createHash('sha256')
    let readBytes = 0
    for await (const chunk of file.createReadStream({ autoClose: false, start: 0 })) {
      readBytes += chunk.length
      if (readBytes > maxBytes) {
        throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker output grew while reading.')
      }
      hash.update(chunk)
    }
    if (readBytes !== byteSize) {
      throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker output changed while reading.')
    }
    const extra = await inspect(file, byteSize)
    const after = await file.stat({ bigint: true })
    const atPath = await lstat(filePath, { bigint: true })
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      before.dev !== atPath.dev ||
      before.ino !== atPath.ino ||
      atPath.isSymbolicLink() ||
      (await realpath(filePath)) !== filePath
    ) {
      throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker output changed while verifying.')
    }
    return { byteSize, sha256: hash.digest('hex'), ...extra }
  } catch (error) {
    if (error instanceof ProjectWorkerError) {
      throw error
    }
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker output could not be verified.')
  } finally {
    await file.close()
  }
}

async function readAt(file: FileHandle, position: number, length: number): Promise<Buffer> {
  if (!Number.isSafeInteger(position) || !Number.isSafeInteger(length) || length < 0) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker image structure is invalid.')
  }
  const buffer = Buffer.alloc(length)
  let offset = 0
  while (offset < length) {
    const { bytesRead } = await file.read(buffer, offset, length - offset, position + offset)
    if (bytesRead === 0) {
      throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker image is truncated.')
    }
    offset += bytesRead
  }
  return buffer
}

async function inspectPng(
  file: FileHandle,
  byteSize: number,
  acceptUntaggedSrgb = false,
): Promise<InspectedImage> {
  if (byteSize < 45 || !(await readAt(file, 0, 8)).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker PNG signature is invalid.')
  }
  let offset = 8
  let width = 0
  let height = 0
  let iccSha256: string | null = null
  let sawImageData = false
  let sawEnd = false
  const colorChunksSeen = new Set<string>()
  while (offset + 12 <= byteSize) {
    const chunk = await readAt(file, offset, 8)
    const chunkBytes = chunk.readUInt32BE(0)
    const tag = chunk.toString('ascii', 4, 8)
    const dataStart = offset + 8
    const next = dataStart + chunkBytes + 4
    if (next > byteSize) {
      throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker PNG is truncated.')
    }
    const colorChunkLength = pngColorChunkLength(tag)
    if (colorChunkLength !== undefined) {
      if (
        colorChunksSeen.has(tag) ||
        sawImageData ||
        chunkBytes !== colorChunkLength ||
        !isSrgbCompatiblePngColorChunk(tag, await readAt(file, dataStart, chunkBytes))
      ) {
        throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker PNG color metadata is invalid.')
      }
      colorChunksSeen.add(tag)
    }
    switch (tag) {
      case 'iCCP': {
        if (iccSha256 !== null || sawImageData || chunkBytes > MAX_ICC_BYTES) {
          throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker PNG ICC chunk is invalid.')
        }
        const chunkData = await readAt(file, dataStart, chunkBytes)
        const separator = chunkData.indexOf(0)
        if (separator < 1 || separator > 79 || chunkData[separator + 1] !== 0) {
          throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker PNG ICC encoding is invalid.')
        }
        let profile: Buffer
        try {
          profile = inflateSync(chunkData.subarray(separator + 2), {
            maxOutputLength: MAX_ICC_BYTES,
          })
        } catch {
          throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker PNG ICC profile is invalid.')
        }
        validateIcc(profile, true)
        iccSha256 = createHash('sha256').update(profile).digest('hex')
        break
      }
      case 'IDAT': {
        sawImageData = true
        break
      }
      case 'IEND': {
        if (chunkBytes !== 0 || next !== byteSize) {
          throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker PNG trailer is invalid.')
        }
        sawEnd = true
        break
      }
      case 'IHDR': {
        if (offset !== 8 || chunkBytes !== 13) {
          throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker PNG header is invalid.')
        }
        const header = await readAt(file, dataStart, 13)
        width = header.readUInt32BE(0)
        height = header.readUInt32BE(4)
        break
      }
      default: {
        break
      }
    }
    if (sawEnd) {
      break
    }
    offset = next
  }
  if (!sawImageData || !sawEnd || (!iccSha256 && !acceptUntaggedSrgb) || width < 1 || height < 1) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker PNG is incomplete.')
  }
  // The .igs v1 source contract interprets untagged RGB as sRGB. Output callers keep the
  // default strict mode, so a worker cannot present an untagged derivative as pinned sRGB.
  return { height, iccSha256: iccSha256 ?? IGS_SRGB_ICC_SHA256, width }
}

async function inspectWebp(
  file: FileHandle,
  byteSize: number,
  acceptUntaggedSrgb = false,
): Promise<InspectedImage> {
  if (byteSize < 30) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker WebP is too small.')
  }
  const riff = await readAt(file, 0, 12)
  if (
    riff.toString('ascii', 0, 4) !== 'RIFF' ||
    riff.toString('ascii', 8, 12) !== 'WEBP' ||
    riff.readUInt32LE(4) + 8 !== byteSize
  ) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker WebP RIFF header is invalid.')
  }
  let offset = 12
  let width = 0
  let height = 0
  let iccSha256: string | null = null
  let sawImageData = false
  while (offset + 8 <= byteSize) {
    const chunk = await readAt(file, offset, 8)
    const tag = chunk.toString('ascii', 0, 4)
    const chunkBytes = chunk.readUInt32LE(4)
    const dataStart = offset + 8
    const next = dataStart + chunkBytes + (chunkBytes & 1)
    if (next > byteSize) {
      throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker WebP is truncated.')
    }
    switch (tag) {
      case 'ICCP': {
        if (iccSha256 !== null || chunkBytes > MAX_ICC_BYTES) {
          throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker WebP ICC chunk is invalid.')
        }
        const profile = await readAt(file, dataStart, chunkBytes)
        validateIcc(profile, true)
        iccSha256 = createHash('sha256').update(profile).digest('hex')

        break
      }
      case 'VP8 ': {
        sawImageData = true
        if (!width && chunkBytes >= 10) {
          const header = await readAt(file, dataStart, 10)
          if (header[3] !== 0x9d || header[4] !== 0x01 || header[5] !== 0x2a) {
            throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker WebP frame is invalid.')
          }
          width = header.readUInt16LE(6) & 0x3f_ff
          height = header.readUInt16LE(8) & 0x3f_ff
        }

        break
      }
      case 'VP8L': {
        sawImageData = true
        if (!width && chunkBytes >= 5) {
          const header = await readAt(file, dataStart, 5)
          if (header[0] !== 0x2f) {
            throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker WebP frame is invalid.')
          }
          width = 1 + (header[1] | ((header[2] & 0x3f) << 8))
          height = 1 + ((header[2] >> 6) | (header[3] << 2) | ((header[4] & 0x0f) << 10))
        }

        break
      }
      case 'VP8X': {
        if (chunkBytes < 10) {
          throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker WebP VP8X is invalid.')
        }
        const header = await readAt(file, dataStart, 10)
        width = 1 + header.readUIntLE(4, 3)
        height = 1 + header.readUIntLE(7, 3)

        break
      }
      // No default
    }
    offset = next
  }
  if (
    offset !== byteSize ||
    !sawImageData ||
    (!iccSha256 && !acceptUntaggedSrgb) ||
    width < 1 ||
    height < 1
  ) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker WebP is incomplete.')
  }
  return { height, iccSha256: iccSha256 ?? IGS_SRGB_ICC_SHA256, width }
}

function validateIcc(profile: Buffer, requireRgb: boolean): void {
  if (
    profile.length < 128 ||
    profile.length > MAX_ICC_BYTES ||
    profile.readUInt32BE(0) !== profile.length ||
    profile.toString('ascii', 36, 40) !== 'acsp' ||
    (requireRgb && profile.toString('ascii', 16, 20) !== 'RGB ')
  ) {
    throw new ProjectWorkerError('OUTPUT_MISMATCH', 'The worker ICC profile is invalid.')
  }
}

/** Transport and portable Patch profiles share the same frozen defaults. */
export { SMART_PATCH_DEFAULT_COHERENCE_SETTINGS as DEFAULT_SMART_PATCH_COHERENCE } from '../../shared/projects/smart-patch-coherence-settings.js'
