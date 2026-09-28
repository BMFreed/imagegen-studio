import type { ApiResult, RuntimeStatus } from '../../shared/api.js'

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import type { GenerationWorkerLocation } from '../projects/generation-worker-client.js'

import { GenerationWorkerClient } from '../projects/generation-worker-client.js'

const POINTER_SCHEMA_VERSION = 1
const MAX_POINTER_BYTES = 16 * 1024
const RUNTIME_ID_PATTERN = /^[a-z0-9][\w.-]{0,127}$/i
const QUALIFICATION_CACHE_MS = 60_000
const MAX_CONFIG_FILES = 32
const MAX_CONFIG_BYTES = 8 * 1024 * 1024

export interface RuntimeRoots {
  appDataDir: string
  cacheDir: string
  downloadsDir: string
  environmentsDir: string
  logsDir: string
  pointerFile: string
  pythonDir: string
  runtimeDir: string
  uvCacheDir: string
  workerLogsDir: string
}

export interface RuntimeHost {
  arch: string
  platform: NodeJS.Platform
}

export interface QualifiedGenerationWorker {
  environment: NodeJS.ProcessEnv
  location: GenerationWorkerLocation
  runtimeId: string
}

interface ActiveRuntimePointer {
  pythonExecutable: string
  runtimeId: string
  schemaVersion: number
}

type PointerRead =
  { kind: 'invalid' } | { kind: 'missing' } | { kind: 'valid'; value: ActiveRuntimePointer }

interface PreparedQualification {
  key: string
  worker: QualifiedGenerationWorker
}

interface CachedQualification {
  expiresAt: number
  key: string
  promise: Promise<boolean>
}

interface QualificationClient {
  close: () => Promise<void>
}

interface GenerationLease {
  advisoryReadyKey: string | null
  client: GenerationWorkerClient | null
  key: string | null
  phase: 'qualifying' | 'running' | 'unconfirmed-exit'
  retry: Promise<boolean> | null
  runtimeId: string | null
}

type StartQualificationClient = (
  location: GenerationWorkerLocation,
  environment: NodeJS.ProcessEnv,
) => Promise<QualificationClient>

const startQualificationClient: StartQualificationClient = async (location, environment) =>
  await GenerationWorkerClient.start(location, { environment })

export class RuntimeManager {
  private cachedQualification: CachedQualification | null = null
  private generationLease: GenerationLease | null = null
  private readonly host: RuntimeHost
  private readonly listeners = new Set<(status: RuntimeStatus) => void>()
  private previousStatus: RuntimeStatus | null = null
  private qualificationTail: Promise<void> = Promise.resolve()
  private readonly roots: RuntimeRoots
  private readonly startClient: StartQualificationClient
  private unconfirmedClient: QualificationClient | null = null

  constructor(
    roots: RuntimeRoots,
    host: RuntimeHost = { arch: process.arch, platform: process.platform },
    startClient: StartQualificationClient = startQualificationClient,
  ) {
    this.roots = roots
    this.host = host
    this.startClient = startClient
  }

  async getStatus(): Promise<ApiResult<RuntimeStatus>> {
    let status: RuntimeStatus
    if (this.host.platform !== 'linux' || this.host.arch !== 'x64') {
      this.cachedQualification = null
      status = {
        detail: 'The first release supports Linux x64 with an NVIDIA GPU.',
        kind: 'unsupported',
        profile: null,
      }
    } else {
      let pointer: PointerRead
      try {
        pointer = await readPointer(this.roots)
      } catch {
        return {
          error: {
            code: 'RUNTIME_STATUS_UNAVAILABLE',
            message: 'Cannot inspect the application runtime.',
          },
          ok: false,
        }
      }

      if (pointer.kind === 'missing') {
        this.cachedQualification = null
        status = this.generationLease
          ? {
              detail:
                'The active runtime metadata is missing; probing is blocked during generation.',
              kind: 'needs-repair',
              profile: 'linux-nvidia',
            }
          : {
              detail:
                'The Linux/NVIDIA runtime has not been installed. GPU compatibility is checked during setup.',
              kind: 'not-installed',
              profile: 'linux-nvidia',
            }
      } else if (pointer.kind === 'invalid') {
        this.cachedQualification = null
        status = {
          detail: 'The installed runtime metadata or Python executable is missing or invalid.',
          kind: 'needs-repair',
          profile: 'linux-nvidia',
        }
      } else {
        const prepared = await this.prepareQualification(pointer.value, this.roots.downloadsDir)
        // A generation may have acquired its lease while pointer/config inspection awaited I/O.
        // Never start a second CUDA child merely to answer an advisory status request.
        const lease = this.generationLease
        const ready = lease
          ? this.leaseIsAdvisoryReady(lease, prepared)
          : prepared !== null && (await this.qualify(prepared, true))
        if (!ready) {
          this.cachedQualification = null
        }
        status = ready
          ? {
              detail: lease
                ? 'The Linux/NVIDIA image runtime is in use; a separate status probe is deferred.'
                : 'The Linux/NVIDIA image runtime is ready.',
              kind: 'ready',
              profile: 'linux-nvidia',
              runtimeId: pointer.value.runtimeId,
            }
          : {
              detail: lease
                ? lease.phase === 'unconfirmed-exit'
                  ? 'The generation worker has not confirmed exit; runtime probing is blocked.'
                  : 'The image runtime is starting; a separate status probe is deferred.'
                : 'The installed Linux/NVIDIA image runtime failed its worker self-test.',
              kind: 'needs-repair',
              profile: 'linux-nvidia',
              runtimeId: pointer.value.runtimeId,
            }
      }
    }

    if (this.previousStatus && JSON.stringify(this.previousStatus) !== JSON.stringify(status)) {
      for (const listener of this.listeners) {
        try {
          listener(status)
        } catch {
          // A failed event consumer must not turn a successful status query into an IPC error.
        }
      }
    }
    this.previousStatus = status
    return { ok: true, value: status }
  }

  async install(): Promise<ApiResult<RuntimeStatus>> {
    return {
      error: {
        code: 'RUNTIME_INSTALL_UNAVAILABLE',
        message:
          'Runtime installation will be available after the verified installer is implemented.',
      },
      ok: false,
    }
  }

  onStatusChanged(listener: (status: RuntimeStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async repair(): Promise<ApiResult<RuntimeStatus>> {
    return {
      error: {
        code: 'RUNTIME_INSTALL_UNAVAILABLE',
        message: 'Runtime repair will be available after the verified installer is implemented.',
      },
      ok: false,
    }
  }

  /**
   * Resolve a worker for one actual launch. This deliberately bypasses the status cache: a
   * qualified status is advisory, while the next job must observe its own live handshake. This
   * legacy location-only method is not a lifecycle lease; production dispatch uses
   * withGenerationWorker() so a status probe cannot compete with the live job.
   */
  async resolveQualifiedGenerationWorker(
    scratchBasePath: string,
  ): Promise<QualifiedGenerationWorker | null> {
    if (this.host.platform !== 'linux' || this.host.arch !== 'x64' || this.generationLease) {
      return null
    }
    try {
      const pointer = await readPointer(this.roots)
      if (pointer.kind !== 'valid') {
        this.cachedQualification = null
        return null
      }
      const prepared = await this.prepareQualification(pointer.value, scratchBasePath)
      if (this.generationLease) {
        return null
      }
      // A dispatch qualification supersedes any earlier advisory status result.
      this.cachedQualification = null
      if (prepared && (await this.qualify(prepared, false))) {
        return this.generationLease ? null : prepared.worker
      }
      this.cachedQualification = null
      return null
    } catch {
      this.cachedQualification = null
      return null
    }
  }

  /** Confirm exit of a failed generation, qualification or startup child without starting another. */
  async retryUnconfirmedGenerationExit(): Promise<boolean> {
    const lease = this.generationLease
    if (lease && (lease.phase !== 'unconfirmed-exit' || !lease.client)) {
      return false
    }
    if (lease?.retry) {
      return await lease.retry
    }
    // A failed qualification has no generation lease, but its child is retained separately.
    // Serialize both retry paths with status qualification and generation admission.
    const retry = this.withGpuSlot(async () => {
      if (this.generationLease !== lease) {
        return false
      }
      if (lease) {
        try {
          await lease.client!.close()
        } catch {
          return false
        }
        this.generationLease = null
      }
      if (!(await this.confirmPreviousExit())) {
        return false
      }
      return await GenerationWorkerClient.retryUnconfirmedStartExit()
    })
    if (lease) {
      lease.retry = retry
      void retry.finally(() => {
        if (lease.retry === retry) {
          lease.retry = null
        }
      })
    }
    return await retry
  }

  /**
   * Own one CUDA generation child from live qualification through the caller's last operation and
   * confirmed child exit. The callback may cancel via worker.close(); final close is idempotent. A
   * second caller receives null instead of queueing another GPU worker behind a long job.
   */
  async withGenerationWorker<T>(
    scratchBasePath: string,
    use: (worker: GenerationWorkerClient, runtime: QualifiedGenerationWorker) => Promise<T>,
  ): Promise<T | null> {
    if (this.host.platform !== 'linux' || this.host.arch !== 'x64' || this.generationLease) {
      return null
    }
    const cached = this.cachedQualification
    const lease: GenerationLease = {
      advisoryReadyKey:
        cached && Number.isFinite(cached.expiresAt) && cached.expiresAt > Date.now()
          ? cached.key
          : null,
      client: null,
      key: null,
      phase: 'qualifying',
      retry: null,
      runtimeId: null,
    }
    // Reserve synchronously, before any pointer I/O or wait for an earlier status qualification.
    this.generationLease = lease
    this.cachedQualification = null
    try {
      return await this.withGpuSlot(async () => {
        const pointer = await readPointer(this.roots)
        if (pointer.kind !== 'valid') {
          return null
        }
        const prepared = await this.prepareQualification(pointer.value, scratchBasePath)
        if (!prepared) {
          return null
        }
        lease.key = prepared.key
        lease.runtimeId = pointer.value.runtimeId
        if (!(await this.qualifyLiveUnlocked(prepared))) {
          return null
        }
        const client = await GenerationWorkerClient.start(prepared.worker.location, {
          environment: prepared.worker.environment,
        })
        lease.client = client
        lease.phase = 'running'
        try {
          // Activation may race the second startup. Do not pass a stale environment to a job.
          const currentPointer = await readPointer(this.roots)
          const current =
            currentPointer.kind === 'valid'
              ? await this.prepareQualification(currentPointer.value, scratchBasePath)
              : null
          if (current?.key !== prepared.key) {
            return null
          }
          return await use(client, prepared.worker)
        } finally {
          try {
            await client.close()
          } catch (error) {
            // Keep a strong owner and reject all new probes/leases until explicit exit retry.
            lease.phase = 'unconfirmed-exit'
            throw error
          }
        }
      })
    } finally {
      if (lease.phase !== 'unconfirmed-exit' && this.generationLease === lease) {
        this.generationLease = null
      }
    }
  }

  private async confirmPreviousExit(): Promise<boolean> {
    if (!this.unconfirmedClient) {
      return true
    }
    try {
      await this.unconfirmedClient.close()
      this.unconfirmedClient = null
      return true
    } catch {
      return false
    }
  }

  private leaseIsAdvisoryReady(
    lease: GenerationLease,
    prepared: PreparedQualification | null,
  ): boolean {
    if (!prepared || prepared.key !== lease.key || prepared.worker.runtimeId !== lease.runtimeId) {
      return false
    }
    if (lease.phase === 'qualifying') {
      return lease.advisoryReadyKey === prepared.key
    }
    if (lease.phase === 'unconfirmed-exit' || !lease.client) {
      return false
    }
    try {
      return lease.client.ready.workerVersion === '0.2.0'
    } catch {
      return false
    }
  }

  private async prepareQualification(
    pointer: ActiveRuntimePointer,
    scratchBasePath: string,
  ): Promise<PreparedQualification | null> {
    try {
      const environmentRoot = path.join(this.roots.environmentsDir, pointer.runtimeId)
      const configDir = path.join(environmentRoot, 'resources', 'sdxl-config')
      const [scratch, config, cache, executable] = await Promise.all([
        fs.realpath(scratchBasePath),
        fs.realpath(configDir),
        fs.realpath(this.roots.cacheDir),
        fs.stat(pointer.pythonExecutable),
      ])
      if (
        !isWithin(this.roots.appDataDir, scratch) ||
        scratch !== scratchBasePath ||
        !(await fs.lstat(scratch)).isDirectory() ||
        !isWithin(environmentRoot, config) ||
        config !== configDir ||
        !(await fs.lstat(config)).isDirectory() ||
        cache !== this.roots.cacheDir ||
        !(await fs.lstat(cache)).isDirectory() ||
        !executable.isFile()
      ) {
        return null
      }
      const configFingerprint = await fingerprintConfig(config)

      const location: GenerationWorkerLocation = {
        pythonExecutable: pointer.pythonExecutable,
        runtimeRoot: this.roots.runtimeDir,
        scratchBasePath: scratch,
      }
      const environment: NodeJS.ProcessEnv = {
        HF_DATASETS_OFFLINE: '1',
        HF_HOME: cache,
        HF_HUB_OFFLINE: '1',
        IGS_SDXL_CONFIG_DIR: config,
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        TRANSFORMERS_OFFLINE: '1',
      }
      return {
        key: JSON.stringify([
          pointer.runtimeId,
          pointer.pythonExecutable,
          executable.dev,
          executable.ino,
          executable.size,
          executable.mtimeMs,
          configFingerprint,
        ]),
        worker: { environment, location, runtimeId: pointer.runtimeId },
      }
    } catch {
      return null
    }
  }

  private async qualify(prepared: PreparedQualification, useCache: boolean): Promise<boolean> {
    if (useCache) {
      const cached = this.cachedQualification
      if (cached?.key === prepared.key && cached.expiresAt > Date.now()) {
        return await cached.promise
      }
    }
    const qualification = this.qualifyLive(prepared)
    if (useCache) {
      this.cachedQualification = {
        expiresAt: Number.POSITIVE_INFINITY,
        key: prepared.key,
        promise: qualification,
      }
    }
    const succeeded = await qualification
    if (useCache && this.cachedQualification?.promise === qualification) {
      this.cachedQualification = succeeded
        ? {
            expiresAt: Date.now() + QUALIFICATION_CACHE_MS,
            key: prepared.key,
            promise: Promise.resolve(true),
          }
        : null
    }
    return succeeded
  }

  private async qualifyLive(prepared: PreparedQualification): Promise<boolean> {
    return await this.withGpuSlot(async () =>
      this.generationLease ? false : await this.qualifyLiveUnlocked(prepared),
    )
  }

  private async qualifyLiveUnlocked(prepared: PreparedQualification): Promise<boolean> {
    try {
      if (!(await this.confirmPreviousExit())) {
        return false
      }
      const before = await readPointer(this.roots)
      if (before.kind !== 'valid') {
        return false
      }
      const unchanged = await this.prepareQualification(
        before.value,
        prepared.worker.location.scratchBasePath,
      )
      if (unchanged?.key !== prepared.key) {
        return false
      }
      const client = await this.startClient(prepared.worker.location, prepared.worker.environment)
      try {
        // A ready line alone is insufficient: the child must stop before qualification is published.
        await client.close()
      } catch {
        // Do not start another GPU worker while the exit of this one remains unconfirmed.
        this.unconfirmedClient = client
        return false
      }
      const pointer = await readPointer(this.roots)
      if (pointer.kind !== 'valid' || pointer.value.runtimeId !== prepared.worker.runtimeId) {
        return false
      }
      const current = await this.prepareQualification(
        pointer.value,
        prepared.worker.location.scratchBasePath,
      )
      return current?.key === prepared.key
    } catch {
      return false
    }
  }

  private async withGpuSlot<T>(operation: () => Promise<T>): Promise<T> {
    let release!: () => void
    const previous = this.qualificationTail
    this.qualificationTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }
}

/**
 * Creates only app-owned directories. The caller passes Electron's userData path; no path here is
 * derived from PATH, a project file, or renderer input.
 */
export async function createRuntimeRoots(appDataDirectory: string): Promise<RuntimeRoots> {
  if (!path.isAbsolute(appDataDirectory)) {
    throw new Error('The application data directory must be absolute.')
  }

  await fs.mkdir(appDataDirectory, { recursive: true })
  const appDataDir = await fs.realpath(appDataDirectory)

  async function addDirectory(parent: string, name: string): Promise<string> {
    const directory = path.join(parent, name)
    try {
      await fs.mkdir(directory)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
    }

    // A pre-existing symlink must not move runtime operations outside userData.
    const entry = await fs.lstat(directory)
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      (await fs.realpath(directory)) !== directory
    ) {
      throw new Error(`Invalid application data directory: ${name}`)
    }
    return directory
  }

  const runtimeDir = await addDirectory(appDataDir, 'runtime')
  const pythonDir = await addDirectory(runtimeDir, 'python')
  const environmentsDir = await addDirectory(runtimeDir, 'environments')
  const cacheDir = await addDirectory(appDataDir, 'cache')
  const uvCacheDir = await addDirectory(cacheDir, 'uv')
  const downloadsDir = await addDirectory(cacheDir, 'runtime-downloads')
  const logsDir = await addDirectory(appDataDir, 'logs')
  const workerLogsDir = await addDirectory(logsDir, 'worker')

  return {
    appDataDir,
    cacheDir,
    downloadsDir,
    environmentsDir,
    logsDir,
    pointerFile: path.join(runtimeDir, 'current-runtime.json'),
    pythonDir,
    runtimeDir,
    uvCacheDir,
    workerLogsDir,
  }
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

/**
 * Cheap content identity for the small, pinned SDXL configuration. The Python worker validates the
 * expected file names and hashes; this digest only invalidates an advisory status cache.
 */
async function fingerprintConfig(root: string): Promise<string> {
  const digest = createHash('sha256')
  const pending: { depth: number; directory: string }[] = [{ depth: 0, directory: root }]
  let entriesSeen = 0
  let filesSeen = 0
  let bytesSeen = 0
  while (pending.length > 0) {
    const next = pending.pop()!
    const entries = await fs.readdir(next.directory)
    for (const name of entries.sort()) {
      if (++entriesSeen > MAX_CONFIG_FILES * 2) {
        throw new Error('The inference configuration has too many entries.')
      }
      const absolute = path.join(next.directory, name)
      const entry = await fs.lstat(absolute)
      if (entry.isSymbolicLink()) {
        throw new Error('The inference configuration contains a symlink.')
      }
      const relative = path.relative(root, absolute)
      if (entry.isDirectory()) {
        if (next.depth >= 3 || (await fs.realpath(absolute)) !== absolute) {
          throw new Error('The inference configuration has an unsafe directory.')
        }
        digest.update(`dir:${relative}\0`)
        pending.push({ depth: next.depth + 1, directory: absolute })
        continue
      }
      if (!entry.isFile() || ++filesSeen > MAX_CONFIG_FILES) {
        throw new Error('The inference configuration has an unsafe file.')
      }
      const handle = await fs.open(
        absolute,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      )
      try {
        const opened = await handle.stat()
        if (
          !opened.isFile() ||
          opened.size > MAX_CONFIG_BYTES - bytesSeen ||
          opened.size !== entry.size
        ) {
          throw new Error('The inference configuration exceeds its byte limit.')
        }
        const bytes = Buffer.alloc(opened.size + 1)
        let offset = 0
        while (offset < bytes.length) {
          const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
          if (bytesRead === 0) {
            break
          }
          offset += bytesRead
        }
        if (offset !== opened.size) {
          throw new Error('The inference configuration changed during inspection.')
        }
        bytesSeen += offset
        digest.update(`file:${relative}\0`)
        digest.update(bytes.subarray(0, offset))
        digest.update('\0')
      } finally {
        await handle.close()
      }
    }
  }
  return digest.digest('hex')
}

async function readPointer(roots: RuntimeRoots): Promise<PointerRead> {
  let handle: fs.FileHandle
  try {
    // NOFOLLOW prevents a pointer symlink from reading an arbitrary user file.
    handle = await fs.open(
      roots.pointerFile,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { kind: 'missing' }
    }
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      return { kind: 'invalid' }
    }
    throw error
  }

  try {
    const entry = await handle.stat()
    if (!entry.isFile() || entry.size > MAX_POINTER_BYTES) {
      return { kind: 'invalid' }
    }

    // Bound the actual read as well as stat(): another process may grow the file
    // after the size check, and a corrupt pointer must not exhaust the main process.
    const bytes = Buffer.alloc(MAX_POINTER_BYTES + 1)
    let totalRead = 0
    while (totalRead < bytes.length) {
      const { bytesRead } = await handle.read(bytes, totalRead, bytes.length - totalRead, totalRead)
      if (bytesRead === 0) {
        break
      }
      totalRead += bytesRead
    }
    if (totalRead > MAX_POINTER_BYTES) {
      return { kind: 'invalid' }
    }
    const contents = bytes.subarray(0, totalRead).toString('utf8')

    let parsed: unknown
    try {
      parsed = JSON.parse(contents)
    } catch {
      return { kind: 'invalid' }
    }
    if (typeof parsed !== 'object' || parsed === null) {
      return { kind: 'invalid' }
    }

    const pointer = parsed as Partial<ActiveRuntimePointer>
    if (
      pointer.schemaVersion !== POINTER_SCHEMA_VERSION ||
      typeof pointer.runtimeId !== 'string' ||
      !RUNTIME_ID_PATTERN.test(pointer.runtimeId) ||
      pointer.runtimeId === '.' ||
      pointer.runtimeId === '..' ||
      typeof pointer.pythonExecutable !== 'string' ||
      !path.isAbsolute(pointer.pythonExecutable)
    ) {
      return { kind: 'invalid' }
    }

    const environmentDir = path.join(roots.environmentsDir, pointer.runtimeId)
    const expectedPython = path.join(environmentDir, 'bin', 'python')
    if (path.normalize(pointer.pythonExecutable) !== expectedPython) {
      return { kind: 'invalid' }
    }

    try {
      const environment = await fs.lstat(environmentDir)
      if (!environment.isDirectory() || environment.isSymbolicLink()) {
        return { kind: 'invalid' }
      }
      if ((await fs.realpath(environmentDir)) !== environmentDir) {
        return { kind: 'invalid' }
      }

      const executable = await fs.realpath(expectedPython)
      if (!isWithin(roots.runtimeDir, executable) || !(await fs.stat(executable)).isFile()) {
        return { kind: 'invalid' }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { kind: 'invalid' }
      }
      throw error
    }

    return {
      kind: 'valid',
      value: {
        pythonExecutable: expectedPython,
        runtimeId: pointer.runtimeId,
        schemaVersion: POINTER_SCHEMA_VERSION,
      },
    }
  } finally {
    await handle.close()
  }
}
