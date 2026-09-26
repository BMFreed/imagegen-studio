import {
  IGS_SRGB_ICC_SHA256,
  isSrgbCompatiblePngColorChunk,
  pngColorChunkLength,
} from '../../shared/projects/color-profile.js'
import { IGS_SAFETY_CEILINGS, type IgsPreviewRectV1 } from '../../shared/projects/project-schema.js'

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, type FileHandle, lstat, open, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { inflateSync } from 'node:zlib'

import { validateSrgbPngStream, validateSrgbWebpStream } from './igs-package.js'

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
const MAX_ICC_BYTES = 4 * 1024 * 1024
const MAX_IMAGE_SIDE = 16_384
const SHA256_PATTERN = /^[a-f0-9]{64}$/

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
  type: 'derivative-done' | 'import-done' | 'preview-done' | 'self-test-result'
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
      | 'INVALID_PATH'
      | 'INVALID_REQUEST'
      | 'OUTPUT_MISMATCH'
      | 'PROTOCOL_ERROR'
      | 'REQUEST_TIMEOUT'
      | 'STARTUP_TIMEOUT'
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
  get ready(): WorkerReady {
    if (!this.readyMessage) {
      throw new ProjectWorkerError('CLOSED', 'The image worker is not ready.')
    }
    return this.readyMessage
  }

  private active: PendingRequest | null = null
  private busy = false
  private closed = false
  private readonly exitPromise: Promise<void>
  private exitResolve!: () => void
  private readyMessage: WorkerReady | null = null
  private readonly requestTimeoutMs: number
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
      this.exitResolve()
    })
    this.child.on('exit', () => {
      this.fail(new ProjectWorkerError('WORKER_EXITED', 'The image worker exited.'))
      this.exitResolve()
    })
  }

  static async start(
    location: ProjectWorkerLocation,
    options: ProjectWorkerOptions = {},
  ): Promise<ProjectWorkerClient> {
    deadline(options.requestTimeoutMs, 120_000, 'requestTimeoutMs')
    deadline(options.startupTimeoutMs, 15_000, 'startupTimeoutMs')
    const runtimeRoot = await canonicalDirectory(location.runtimeRoot, 'Runtime root')
    const stagingBasePath = await canonicalDirectory(location.stagingBasePath, 'Staging base')
    const executable = await executableWithin(location.pythonExecutable, runtimeRoot)
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
      await client.close()
      throw error
    }
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.fail(new ProjectWorkerError('CLOSED', 'The image worker was closed.'))
    }
    this.child.stdin.end()
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill('SIGTERM')
      let timeout: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        this.exitPromise,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, 2000)
          timeout.unref()
        }),
      ])
      clearTimeout(timeout)
      if (this.child.exitCode === null && this.child.signalCode === null) {
        this.child.kill('SIGKILL')
      }
    }
  }

  async composePreview(input: ComposePreviewInput): Promise<ComposePreviewResult> {
    return this.exclusive(async () => {
      if (!this.ready.capabilities.includes('preview-composition')) {
        throw new ProjectWorkerError(
          'WORKER_VERSION_MISMATCH',
          'The image worker cannot compose Project previews.',
        )
      }
      if (!Array.isArray(input.layers) || input.layers.length > MAX_COMPOSITION_LAYERS) {
        throw new ProjectWorkerError(
          'INVALID_REQUEST',
          'Preview request is outside the worker range.',
        )
      }
      // Copy the caller-owned snapshot before any await: validating one version and sending
      // another would make a changed Project look like a successful preview of this revision.
      const layers = input.layers.map((layer) => {
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
          'Preview source pixels exceed the worker limit.',
        )
      }
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
      active.reject(new ProjectWorkerError('WORKER_REQUEST_FAILED', message.message, message.code))
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
    type: 'compose-preview' | 'derive-image' | 'normalize-import' | 'self-test',
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
    const stagingRoot = await canonicalDirectory(stagingRootInput, 'Staging root')
    if (!isWithin(this.stagingBasePath, stagingRoot)) {
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
        (await canonicalDirectory(path.dirname(output), 'Output directory')) !==
          path.dirname(output)
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
    throw new ProjectWorkerError('INVALID_REQUEST', 'A preview layer is invalid.')
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
    throw new ProjectWorkerError('INVALID_REQUEST', 'A preview layer transform is invalid.')
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
