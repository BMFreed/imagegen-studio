/**
 * Fresh Invoke4875 startup_utils.check_cuda_build_compatibility + run_app caller and launcher c267
 * gpu-detection + InstallFlow callers: inspect OS/build/device facts, with a bounded NVIDIA query.
 * Their advisory diagnostics do not supply a signed release/glibc admission gate. This disclosed
 * Studio adaptation fails closed and reuses the existing command owner for physical process exit.
 */
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'

import type {
  OfflineRuntimeCommandResult,
  OfflineRuntimeCommandRunner,
} from './offline-runtime-assembly.js'
import type { RuntimeReleaseManifest } from './runtime-release.js'

import {
  hasUnconfirmedOfflineRuntimeCommands,
  runOfflineRuntimeCommand,
} from './offline-runtime-assembly.js'

const PROBE_DEADLINE_MS = 3000
const MAX_PROBE_BYTES = 64 * 1024
const MAX_GPU_ROWS = 64
export interface RuntimeHostFacts {
  arch: string
  glibcVersion: string | null
  platform: string
}

export interface RuntimeHostPreflightOptions {
  commandRunner?: OfflineRuntimeCommandRunner
  logDirectory: string
  /** Internal test seam; production always uses the absolute system NVIDIA utility. */
  nvidiaSmiExecutable?: string
  /** Internal deadline test seam; it cannot increase the upstream three-second budget. */
  probeDeadlineMs?: number
  readHost?: () => RuntimeHostFacts
  signal?: AbortSignal
}

export interface RuntimeHostPreflightReceipt {
  arch: 'x64'
  glibcVersion: string
  gpus: readonly Readonly<{ architecture: string; driverVersion: string }>[]
  logPath: string
  platform: 'linux'
  /** CUDA here is the declared artifact build, not a measurement of installed toolkit/runtime. */
  requirements: HostRequirements
  scope: 'host-preflight'
}

type HostRequirements = RuntimeReleaseManifest['host']

export class RuntimeHostPreflightError extends Error {
  constructor(
    readonly code:
      | 'RUNTIME_HOST_CANCELED'
      | 'RUNTIME_HOST_DRIVER_UNSUPPORTED'
      | 'RUNTIME_HOST_EXIT_UNCONFIRMED'
      | 'RUNTIME_HOST_GLIBC_UNSUPPORTED'
      | 'RUNTIME_HOST_GPU_UNSUPPORTED'
      | 'RUNTIME_HOST_PROBE_FAILED'
      | 'RUNTIME_HOST_REQUIREMENTS_INVALID'
      | 'RUNTIME_HOST_STORAGE_INVALID'
      | 'RUNTIME_HOST_TIMEOUT'
      | 'RUNTIME_HOST_UNSUPPORTED',
    message: string,
    readonly exitConfirmed = true,
  ) {
    super(message)
    this.name = 'RuntimeHostPreflightError'
  }
}

/** Prerequisite only. Actual installed worker/CUDA self-tests remain mandatory after assembly. */
export async function preflightRuntimeHost(
  supplied: HostRequirements,
  options: RuntimeHostPreflightOptions,
): Promise<RuntimeHostPreflightReceipt> {
  options = { ...options }
  const requirements = captureRequirements(supplied)
  const deadlineMs = options.probeDeadlineMs ?? PROBE_DEADLINE_MS
  const executable = options.nvidiaSmiExecutable ?? '/usr/bin/nvidia-smi'
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > PROBE_DEADLINE_MS) {
    refuse('RUNTIME_HOST_REQUIREMENTS_INVALID', 'The host probe deadline is invalid.')
  }
  if (!canonicalPath(executable) || !canonicalPath(options.logDirectory)) {
    refuse('RUNTIME_HOST_STORAGE_INVALID', 'The host probe location is invalid.')
  }
  canceled(options.signal)
  if (hasUnconfirmedOfflineRuntimeCommands()) {
    unconfirmed()
  }
  let host: RuntimeHostFacts
  try {
    const observed = (options.readHost ?? readHostFacts)()
    host = { arch: observed.arch, glibcVersion: observed.glibcVersion, platform: observed.platform }
  } catch {
    refuse('RUNTIME_HOST_PROBE_FAILED', 'Host compatibility could not be inspected.')
  }
  if (host.platform !== 'linux' || host.arch !== 'x64') {
    refuse('RUNTIME_HOST_UNSUPPORTED', 'This image runtime requires Linux x64 with NVIDIA.')
  }
  if (
    !version(host.glibcVersion) ||
    compareVersions(host.glibcVersion, requirements.glibcMinimum) < 0
  ) {
    refuse(
      'RUNTIME_HOST_GLIBC_UNSUPPORTED',
      'The system C library is unknown or older than this runtime requires.',
    )
  }

  const glibcVersion = host.glibcVersion
  return await withLogDirectory(
    options.logDirectory,
    async (anchoredDirectory, directoryIdentity) => {
      // No diagnostic report is serialized. Only this one libc field reaches the receipt.
      const logPath = path.join(options.logDirectory, `runtime-host-preflight-${randomUUID()}.log`)
      let logIdentity: Readonly<{ dev: string; ino: string }>
      try {
        const log = await fs.open(
          path.join(anchoredDirectory, path.basename(logPath)),
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        )
        try {
          const created = await log.stat({ bigint: true })
          logIdentity = Object.freeze({ dev: created.dev.toString(), ino: created.ino.toString() })
          await log.sync()
        } finally {
          await log.close()
        }
        await sameDirectory(options.logDirectory, directoryIdentity)
      } catch {
        refuse(
          'RUNTIME_HOST_STORAGE_INVALID',
          'The host compatibility log could not be created safely.',
        )
      }
      canceled(options.signal)
      const controller = new AbortController()
      let stopReason: 'cancel' | 'timeout' | null = null
      const stop = (reason: 'cancel' | 'timeout') => {
        stopReason ??= reason
        controller.abort()
      }
      const abort = () => stop('cancel')
      options.signal?.addEventListener('abort', abort, { once: true })
      if (options.signal?.aborted) {
        abort()
      }
      const timer = setTimeout(() => stop('timeout'), deadlineMs)
      let result: OfflineRuntimeCommandResult
      try {
        // Await the existing owner's close/group fence after cancellation; no Promise.race timeout.
        result = await (options.commandRunner ?? runOfflineRuntimeCommand)({
          args: ['--query-gpu=driver_version,compute_cap', '--format=csv,noheader,nounits'],
          cwd: '/',
          environment: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
          executable,
          logIdentity,
          logPath: path.join(anchoredDirectory, path.basename(logPath)),
          signal: controller.signal,
        })
        if (!result.exitConfirmed) {
          unconfirmed()
        }
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'exitConfirmed' in error &&
          error.exitConfirmed === false
        ) {
          unconfirmed()
        }
        if (stopReason === 'cancel') {
          canceledFailure()
        }
        if (stopReason === 'timeout') {
          timeoutFailure()
        }
        refuse('RUNTIME_HOST_PROBE_FAILED', 'The NVIDIA driver query could not complete.')
      } finally {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', abort)
      }
      if (stopReason === 'cancel') {
        canceledFailure()
      }
      if (stopReason === 'timeout') {
        timeoutFailure()
      }
      try {
        await sameDirectory(options.logDirectory, directoryIdentity)
      } catch {
        refuse(
          'RUNTIME_HOST_STORAGE_INVALID',
          'The host compatibility log location changed during inspection.',
        )
      }
      if (
        result.code !== 0 ||
        Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > MAX_PROBE_BYTES
      ) {
        refuse(
          'RUNTIME_HOST_PROBE_FAILED',
          'The NVIDIA driver query failed or exceeded its output limit.',
        )
      }
      const rows = result.stdout.trim().split(/\r?\n/)
      if (!result.stdout.trim() || rows.length > MAX_GPU_ROWS) {
        refuse(
          'RUNTIME_HOST_PROBE_FAILED',
          'The NVIDIA driver query did not return a supported device list.',
        )
      }
      const gpus = rows.map((row) => {
        const fields = row.split(',').map((field) => field.trim())
        const driverVersion = fields[0]
        const compute = fields[1]?.match(/^([1-9]\d?)\.(\d)$/)
        if (fields.length !== 2 || !version(driverVersion) || !compute) {
          refuse(
            'RUNTIME_HOST_PROBE_FAILED',
            'The NVIDIA driver query returned incomplete or malformed device data.',
          )
        }
        if (compareVersions(driverVersion, requirements.minimumNvidiaDriver) < 0) {
          refuse(
            'RUNTIME_HOST_DRIVER_UNSUPPORTED',
            'The NVIDIA driver is older than this runtime requires.',
          )
        }
        const architecture = `sm_${compute[1]}${compute[2]}`
        // Invoke inspects every CUDA device. Without selected-device binding, require every queried
        // device to match the signed allowlist; never choose a convenient GPU or guess from the lowest SM.
        if (!requirements.gpuArchitectures.includes(architecture)) {
          refuse(
            'RUNTIME_HOST_GPU_UNSUPPORTED',
            "An NVIDIA GPU is outside this runtime release's supported architectures.",
          )
        }
        return Object.freeze({ architecture, driverVersion })
      })
      return Object.freeze({
        arch: 'x64',
        glibcVersion,
        gpus: Object.freeze(gpus),
        logPath,
        platform: 'linux',
        requirements,
        scope: 'host-preflight',
      })
    },
  )
}

/** Same Linux directory-FD anchoring as runtime-installation.withDirectory. */
async function withLogDirectory<T>(
  directory: string,
  work: (anchored: string, identity: string) => Promise<T>,
): Promise<T> {
  let handle: fs.FileHandle
  try {
    handle = await fs.open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
  } catch {
    refuse('RUNTIME_HOST_STORAGE_INVALID', 'The host compatibility log directory is unavailable.')
  }
  try {
    const info = await handle.stat({ bigint: true })
    if (!info.isDirectory()) {
      refuse('RUNTIME_HOST_STORAGE_INVALID', 'The host compatibility log directory is invalid.')
    }
    const identity = `${info.dev}:${info.ino}`
    try {
      await sameDirectory(directory, identity)
    } catch {
      refuse('RUNTIME_HOST_STORAGE_INVALID', 'The host compatibility log directory changed.')
    }
    return await work(`/proc/self/fd/${handle.fd}`, identity)
  } finally {
    await handle.close()
  }
}

function readHostFacts(): RuntimeHostFacts {
  let glibcVersion: string | null = null
  try {
    const report = process.report.getReport()
    if (
      'header' in report &&
      typeof report.header === 'object' &&
      report.header !== null &&
      'glibcVersionRuntime' in report.header
    ) {
      const value = report.header.glibcVersionRuntime
      if (typeof value === 'string') {
        glibcVersion = value
      }
    }
  } catch {
    /* Missing libc information fails closed; no system Python or shell fallback. */
  }
  return { arch: process.arch, glibcVersion, platform: process.platform }
}

function captureRequirements(value: HostRequirements): HostRequirements {
  if (
    !value ||
    value.os !== 'linux' ||
    value.arch !== 'x64' ||
    !version(value.glibcMinimum) ||
    !version(value.minimumNvidiaDriver) ||
    !version(value.cudaVersion) ||
    !Array.isArray(value.gpuArchitectures) ||
    !value.gpuArchitectures.length ||
    value.gpuArchitectures.length > 64 ||
    !Array.from(value.gpuArchitectures).every(
      (entry) => typeof entry === 'string' && /^[\w.+-]{1,32}$/.test(entry),
    ) ||
    new Set(value.gpuArchitectures).size !== value.gpuArchitectures.length
  ) {
    refuse('RUNTIME_HOST_REQUIREMENTS_INVALID', 'The signed runtime host requirements are invalid.')
  }
  return Object.freeze({
    arch: 'x64',
    cudaVersion: value.cudaVersion,
    glibcMinimum: value.glibcMinimum,
    gpuArchitectures: Object.freeze([...value.gpuArchitectures]),
    minimumNvidiaDriver: value.minimumNvidiaDriver,
    os: 'linux',
  })
}

function version(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    /^\d+(?:\.\d+){1,3}$/.test(value) &&
    value.split('.').every((part) => Number.isSafeInteger(Number(part)))
  )
}
function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) {
      return Math.sign(difference)
    }
  }
  return 0
}
async function sameDirectory(directory: string, expected: string): Promise<void> {
  const info = await fs.lstat(directory, { bigint: true })
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    `${info.dev}:${info.ino}` !== expected ||
    (await fs.realpath(directory)) !== directory
  ) {
    throw new Error('Log directory changed')
  }
}
function canonicalPath(value: string): boolean {
  return (
    typeof value === 'string' &&
    !value.includes('\0') &&
    path.isAbsolute(value) &&
    path.normalize(value) === value
  )
}
function canceled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    canceledFailure()
  }
}
function canceledFailure(): never {
  return refuse('RUNTIME_HOST_CANCELED', 'Runtime host inspection was canceled.')
}
function timeoutFailure(): never {
  return refuse('RUNTIME_HOST_TIMEOUT', 'The NVIDIA driver query exceeded its deadline.')
}
function unconfirmed(): never {
  throw new RuntimeHostPreflightError(
    'RUNTIME_HOST_EXIT_UNCONFIRMED',
    'The NVIDIA driver query has not confirmed physical exit.',
    false,
  )
}
function refuse(code: RuntimeHostPreflightError['code'], message: string): never {
  throw new RuntimeHostPreflightError(code, message)
}
