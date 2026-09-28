import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, lstat, realpath } from 'node:fs/promises'
import path from 'node:path'

import type { GenerationWorkerTransport } from './generation-processor.js'
import type {
  IllustriousTxt2ImgRequestV1,
  InferenceWorkerReady,
} from './illustrious-txt2img-job.js'

const PROTOCOL_VERSION = '1'
const WORKER_VERSION = '0.2.0'
const RUNTIME_PROFILE = 'linux-nvidia'
const CAPABILITY = 'illustrious-txt2img'
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
  outputPath: string
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
      | 'INVALID_PATH'
      | 'INVALID_REQUEST'
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
    this.name = 'GenerationWorkerError'
  }
}

/**
 * Production JSONL transport for the separate Linux/NVIDIA inference worker. It owns one child and
 * admits one generation at a time. It does not claim queue rows or publish worker output.
 */
export class GenerationWorkerClient implements GenerationWorkerTransport {
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
  private readyMessage: GenerationWorkerReady | null = null
  private readonly requestTimeoutMs: number
  private readonly scratchBasePath: string
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

  static async start(
    location: GenerationWorkerLocation,
    options: GenerationWorkerOptions = {},
  ): Promise<GenerationWorkerClient> {
    deadline(options.requestTimeoutMs, 30 * 60_000, 'requestTimeoutMs')
    deadline(options.startupTimeoutMs, 120_000, 'startupTimeoutMs')
    deadline(options.shutdownWaitMs, SHUTDOWN_WAIT_MS, 'shutdownWaitMs')
    const runtimeRoot = await canonicalDirectory(location.runtimeRoot, 'Runtime root')
    const scratchBasePath = await canonicalDirectory(location.scratchBasePath, 'Scratch base')
    const executable = await executableWithin(location.pythonExecutable, runtimeRoot)
    const child = spawn(executable, ['-I', '-m', 'imagegen_worker.inference_main'], {
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
      client.readyMessage = ready
      return client
    } catch (error) {
      await client.close()
      throw error
    }
  }

  async close(): Promise<void> {
    this.closePromise ??= this.closeOne().catch((error: unknown) => {
      // A late OS exit or a retry of SIGKILL must remain observable after an unconfirmed close.
      this.closePromise = null
      throw error
    })
    await this.closePromise
  }

  async generate(request: IllustriousTxt2ImgRequestV1): Promise<unknown> {
    if (this.closed) {
      throw new GenerationWorkerError('CLOSED', 'The generation worker is unavailable.')
    }
    if (this.busy) {
      throw new GenerationWorkerError('BUSY', 'The generation worker is already processing a job.')
    }
    this.busy = true
    try {
      // Snapshot before any asynchronous path validation: the caller may still own mutable state.
      let frozen: IllustriousTxt2ImgRequestV1
      let line: Buffer
      try {
        frozen = structuredClone(request)
        line = Buffer.from(`${JSON.stringify(frozen)}\n`, 'utf8')
      } catch {
        throw new GenerationWorkerError('INVALID_REQUEST', 'The generation request is invalid.')
      }
      if (line.length > MAX_PROTOCOL_LINE_BYTES || !validRequestShape(frozen)) {
        throw new GenerationWorkerError('INVALID_REQUEST', 'The generation request is invalid.')
      }
      await this.validateRequestPaths(frozen)
      if (this.closed) {
        throw new GenerationWorkerError('CLOSED', 'The generation worker is unavailable.')
      }
      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.fail(
            new GenerationWorkerError('REQUEST_TIMEOUT', 'The generation worker timed out.'),
          )
        }, this.requestTimeoutMs)
        this.active = {
          outputPath: frozen.job.output.pngPath,
          reject,
          requestId: frozen.requestId,
          resolve,
          timer,
        }
        this.child.stdin.write(line, (error) => {
          if (error) {
            this.fail(new GenerationWorkerError('WORKER_EXITED', 'The worker input closed.'))
          }
        })
      })
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
          workerVersion: WORKER_VERSION,
        }),
      )
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
          'The generation worker rejected the job.',
          input.code,
        ),
      )
      return
    }
    if (
      input.type !== 'generation-done' ||
      input.outputPath !== active.outputPath ||
      !Number.isInteger(input.seed) ||
      (input.seed as number) < 0 ||
      (input.seed as number) > 0xff_ff_ff_ff
    ) {
      this.fail(new GenerationWorkerError('PROTOCOL_ERROR', 'Invalid generation completion.'))
      return
    }
    clearTimeout(active.timer)
    this.active = null
    active.resolve(input)
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

  private async validateRequestPaths(request: IllustriousTxt2ImgRequestV1): Promise<void> {
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
      path.basename(outputPath) !== 'result.png' ||
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

function validRequestShape(request: IllustriousTxt2ImgRequestV1): boolean {
  return (
    request?.type === 'generate-illustrious-txt2img' &&
    request.protocolVersion === PROTOCOL_VERSION &&
    typeof request.requestId === 'string' &&
    UUID_PATTERN.test(request.requestId) &&
    typeof request.job?.output?.stagingRoot === 'string' &&
    typeof request.job.output.pngPath === 'string' &&
    typeof request.job?.target?.path === 'string'
  )
}

function validReady(
  message: Record<string, unknown>,
): message is GenerationWorkerReady & Record<string, unknown> {
  return (
    message.type === 'ready' &&
    message.workerVersion === WORKER_VERSION &&
    message.runtimeProfile === RUNTIME_PROFILE &&
    typeof message.pythonVersion === 'string' &&
    /^\d+\.\d+\.\d+$/.test(message.pythonVersion) &&
    Array.isArray(message.capabilities) &&
    message.capabilities.every((capability) => typeof capability === 'string') &&
    message.capabilities.includes(CAPABILITY)
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
