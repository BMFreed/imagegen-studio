import type { ApiResult, RuntimeStatus } from '../../shared/api.js'
import { isQualifiedInferenceWorkerReady } from '../../shared/projects/inference-worker-capabilities.js'

import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import type { GenerationWorkerLocation } from '../projects/generation-worker-client.js'
import type { InferenceWorkerReady } from '../projects/illustrious-txt2img-job.js'
import type { SmartPatchExecutionPreparationWorker } from '../projects/project-smart-patch-execution.js'
import type { SmartPatchOutputWorker } from '../projects/smart-patch-generation-processor.js'
import type { ProjectWorkerLocation } from '../projects/worker-client.js'

import { GenerationWorkerClient } from '../projects/generation-worker-client.js'
import { ProjectWorkerClient, ProjectWorkerError } from '../projects/worker-client.js'

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

export interface InstalledProjectWorker {
  environment: NodeJS.ProcessEnv
  location: ProjectWorkerLocation
}

export interface GenerationPreparation {
  inferenceReady: InferenceWorkerReady
  targetWorker: Pick<ProjectWorkerClient, 'composeTarget'>
}

export interface SmartPatchGenerationPreparation {
  inferenceReady: InferenceWorkerReady
  preparationWorker: SmartPatchExecutionPreparationWorker
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
  readonly ready?: InferenceWorkerReady
}

interface GenerationLease {
  advisoryReadyKey: string | null
  client: GenerationWorkerClient | null
  key: string | null
  phase: 'closing' | 'qualifying' | 'running' | 'unconfirmed-exit'
  retry: Promise<boolean> | null
  runtimeId: string | null
}

interface PreparationLease {
  client: ProjectWorkerClient | null
  controller: AbortController
  key: string | null
  phase: 'running' | 'starting' | 'unconfirmed-exit'
  runtimeId: string | null
  startupSettled: Promise<void>
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
  private generationWorkPrevented = false
  private readonly host: RuntimeHost
  private lastQualifiedReady: {
    expiresAt: number
    key: string
    ready: InferenceWorkerReady
  } | null = null
  private readonly listeners = new Set<(status: RuntimeStatus) => void>()
  private preparationLease: PreparationLease | null = null
  private previousStatus: RuntimeStatus | null = null
  private qualificationTail: Promise<void> = Promise.resolve()
  private readonly roots: RuntimeRoots
  private readonly startClient: StartQualificationClient
  private statusRevision = 0
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
    const observedRevision = this.statusRevision
    if (this.generationWorkPrevented) {
      return this.shuttingDownStatus()
    }
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
        if (this.generationWorkPrevented) {
          return this.shuttingDownStatus()
        }
        return {
          error: {
            code: 'RUNTIME_STATUS_UNAVAILABLE',
            message: 'Cannot inspect the application runtime.',
          },
          ok: false,
        }
      }

      if (this.generationWorkPrevented) {
        return this.shuttingDownStatus()
      }

      if (pointer.kind === 'missing') {
        this.cachedQualification = null
        status =
          this.generationLease || this.preparationLease
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
        const prepared = await this.prepareQualification(
          pointer.value,
          path.join(this.roots.appDataDir, 'scratch'),
        )
        if (this.generationWorkPrevented) {
          return this.shuttingDownStatus()
        }
        // A generation may have acquired its lease while pointer/config inspection awaited I/O.
        // Never start a second CUDA child merely to answer an advisory status request.
        const lease = this.generationLease
        const preparation = this.preparationLease
        const ready = preparation
          ? preparation.phase === 'running' &&
            !this.hasUnconfirmedGenerationExit() &&
            prepared?.key === preparation.key &&
            prepared.worker.runtimeId === preparation.runtimeId
          : ProjectWorkerClient.hasUnconfirmedExit()
            ? false
            : lease
              ? this.leaseIsAdvisoryReady(lease, prepared)
              : prepared !== null && (await this.qualify(prepared, true))
        if (lease !== this.generationLease || preparation !== this.preparationLease) {
          return await this.getStatus()
        }
        if (this.generationWorkPrevented) {
          return this.shuttingDownStatus()
        }
        if (!ready) {
          this.cachedQualification = null
        }
        // An owned startup is a connection transition, not evidence of a broken runtime.
        // Metadata changes and unconfirmed exits must still fail closed.
        const checking =
          prepared !== null &&
          !this.unconfirmedClient &&
          !GenerationWorkerClient.hasUnconfirmedStartExit() &&
          !ProjectWorkerClient.hasUnconfirmedExit() &&
          !this.hasUnconfirmedGenerationExit() &&
          (preparation
            ? preparation.phase === 'starting' &&
              prepared.key === preparation.key &&
              prepared.worker.runtimeId === preparation.runtimeId
            : lease?.phase === 'qualifying' &&
              (lease.key === null ||
                (prepared.key === lease.key && prepared.worker.runtimeId === lease.runtimeId)))
        status = ready
          ? {
              detail: lease
                ? 'The Linux/NVIDIA image runtime is in use; a separate status probe is deferred.'
                : 'The Linux/NVIDIA image runtime is ready.',
              kind: 'ready',
              profile: 'linux-nvidia',
              runtimeId: pointer.value.runtimeId,
            }
          : checking
            ? {
                detail: preparation
                  ? 'Target preparation is starting; a separate status probe is deferred.'
                  : 'The image runtime is starting; a separate status probe is deferred.',
                kind: 'checking',
                profile: 'linux-nvidia',
                runtimeId: pointer.value.runtimeId,
              }
            : {
                detail: preparation
                  ? preparation.phase === 'unconfirmed-exit'
                    ? 'The preparation worker has not confirmed exit; runtime probing is blocked.'
                    : 'Target preparation is in progress; a separate status probe is deferred.'
                  : lease
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

    if (this.generationWorkPrevented) {
      return this.shuttingDownStatus()
    }

    // A lifecycle callback may have settled a preceding check while this query awaited I/O.
    if (observedRevision !== this.statusRevision) {
      return await this.getStatus()
    }
    this.publishStatus(status)
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

  /** Permanently stop new status qualifications and generation leases before app shutdown awaits. */
  preventNewGenerationWork(): void {
    this.generationWorkPrevented = true
    this.cachedQualification = null
    this.preparationLease?.controller.abort()
  }

  /** Read advisory capabilities without starting a CUDA child or borrowing its transport. */
  async readQualifiedInferenceReady(): Promise<InferenceWorkerReady | null> {
    if (
      this.generationWorkPrevented ||
      this.host.platform !== 'linux' ||
      this.host.arch !== 'x64' ||
      this.unconfirmedClient ||
      this.hasUnconfirmedGenerationExit() ||
      GenerationWorkerClient.hasUnconfirmedStartExit() ||
      ProjectWorkerClient.hasUnconfirmedExit()
    ) {
      return null
    }
    try {
      const pointer = await readPointer(this.roots)
      if (pointer.kind !== 'valid') {
        return null
      }
      const prepared = await this.prepareQualification(
        pointer.value,
        path.join(this.roots.appDataDir, 'scratch'),
      )
      if (
        !prepared ||
        this.generationWorkPrevented ||
        this.unconfirmedClient ||
        this.hasUnconfirmedGenerationExit() ||
        GenerationWorkerClient.hasUnconfirmedStartExit() ||
        ProjectWorkerClient.hasUnconfirmedExit()
      ) {
        return null
      }
      const lease = this.generationLease
      if (lease) {
        if (
          lease.phase !== 'running' ||
          lease.key !== prepared.key ||
          !lease.client ||
          !isQualifiedInferenceWorkerReady(lease.client.ready)
        ) {
          return null
        }
        return copyInferenceReady(lease.client.ready)
      }
      const preparation = this.preparationLease
      if (preparation && (preparation.phase !== 'running' || preparation.key !== prepared.key)) {
        return null
      }
      const cached = this.lastQualifiedReady
      return cached && cached.key === prepared.key && cached.expiresAt > Date.now()
        ? copyInferenceReady(cached.ready)
        : null
    } catch {
      return null
    }
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
   * Resolve the installed CPU image worker without probing CUDA or requiring ML configuration. The
   * caller owns startup cancellation, requests and confirmed exit; this is not a lease.
   */
  async resolveInstalledProjectWorker(
    scratchBasePath: string,
  ): Promise<InstalledProjectWorker | null> {
    if (!this.projectWorkerResolutionAllowed()) {
      return null
    }
    try {
      const pointer = await readPointer(this.roots)
      if (
        pointer.kind !== 'valid' ||
        !this.projectWorkerResolutionAllowed(pointer.value.runtimeId)
      ) {
        return null
      }
      const [scratch, cache, runtime, appData] = await Promise.all([
        fs.realpath(scratchBasePath),
        fs.realpath(this.roots.cacheDir),
        fs.realpath(this.roots.runtimeDir),
        fs.realpath(this.roots.appDataDir),
      ])
      const entries = await Promise.all([fs.lstat(scratch), fs.lstat(cache), fs.lstat(runtime)])
      if (
        appData !== this.roots.appDataDir ||
        scratch !== scratchBasePath ||
        !isWithin(appData, scratch) ||
        cache !== this.roots.cacheDir ||
        !isWithin(appData, cache) ||
        runtime !== this.roots.runtimeDir ||
        !isWithin(appData, runtime) ||
        entries.some((entry) => !entry.isDirectory() || entry.isSymbolicLink())
      ) {
        return null
      }
      // Re-read the pointer after asynchronous path inspection. A location is advisory until the
      // owning client revalidates it and observes its own derivatives-only handshake.
      const current = await readPointer(this.roots)
      if (
        current.kind !== 'valid' ||
        current.value.runtimeId !== pointer.value.runtimeId ||
        current.value.pythonExecutable !== pointer.value.pythonExecutable ||
        !this.projectWorkerResolutionAllowed(pointer.value.runtimeId)
      ) {
        return null
      }
      return {
        environment: {
          CUDA_VISIBLE_DEVICES: '',
          HF_DATASETS_OFFLINE: '1',
          HF_HOME: cache,
          HF_HUB_OFFLINE: '1',
          LANG: 'C.UTF-8',
          LC_ALL: 'C.UTF-8',
          TRANSFORMERS_OFFLINE: '1',
        },
        location: {
          pythonExecutable: current.value.pythonExecutable,
          runtimeRoot: runtime,
          stagingBasePath: scratch,
        },
      }
    } catch {
      return null
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
    if (
      this.generationWorkPrevented ||
      this.host.platform !== 'linux' ||
      this.host.arch !== 'x64' ||
      this.generationLease ||
      this.preparationLease ||
      ProjectWorkerClient.hasUnconfirmedExit()
    ) {
      return null
    }
    try {
      const pointer = await readPointer(this.roots)
      if (this.generationWorkPrevented) {
        return null
      }
      if (pointer.kind !== 'valid') {
        this.cachedQualification = null
        return null
      }
      const prepared = await this.prepareQualification(pointer.value, scratchBasePath)
      if (
        this.generationWorkPrevented ||
        this.generationLease ||
        this.preparationLease ||
        ProjectWorkerClient.hasUnconfirmedExit()
      ) {
        return null
      }
      // A dispatch qualification supersedes any earlier advisory status result.
      this.cachedQualification = null
      if (prepared && (await this.qualify(prepared, false))) {
        return this.generationWorkPrevented ||
          this.generationLease ||
          this.preparationLease ||
          ProjectWorkerClient.hasUnconfirmedExit()
          ? null
          : prepared.worker
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
    const preparation = this.preparationLease
    if (preparation) {
      if (!this.generationWorkPrevented && preparation.phase !== 'unconfirmed-exit') {
        return false
      }
      preparation.controller.abort()
      await preparation.startupSettled
      try {
        await preparation.client?.close()
        if (!(await ProjectWorkerClient.retryUnconfirmedExit())) {
          return false
        }
        if (this.preparationLease === preparation) {
          this.preparationLease = null
        }
      } catch {
        preparation.phase = 'unconfirmed-exit'
        return false
      }
    } else if (!(await ProjectWorkerClient.retryUnconfirmedExit())) {
      return false
    }
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

  /** Processor owns this installed CPU child and must drain it before releasing its GPU lease. */
  async startSmartPatchOutputWorker(
    scratchBasePath: string,
    signal: AbortSignal,
  ): Promise<SmartPatchOutputWorker> {
    const source = await this.resolveInstalledProjectWorker(scratchBasePath)
    if (!source) {
      throw new ProjectWorkerError(
        'CLOSED',
        'The installed Smart Patch output worker is unavailable.',
      )
    }
    return await ProjectWorkerClient.start(source.location, {
      environment: { ...source.environment, CUDA_VISIBLE_DEVICES: '' },
      signal,
    })
  }

  /**
   * Admit metadata-only preparation using a qualified active child's fresh ready message. This
   * never shares its transport or takes ownership of its lease; busy inference must keep its
   * existing child until the owning generation callback finishes. Idle admission uses the normal
   * live qualification and confirmed-exit path.
   */
  async withGenerationAdmission<T>(
    scratchBasePath: string,
    use: (ready: InferenceWorkerReady) => Promise<T>,
  ): Promise<T | null> {
    if (
      this.generationWorkPrevented ||
      this.host.platform !== 'linux' ||
      this.host.arch !== 'x64' ||
      this.preparationLease ||
      ProjectWorkerClient.hasUnconfirmedExit()
    ) {
      return null
    }
    const lease = this.generationLease
    if (!lease) {
      return await this.withGenerationWorker(scratchBasePath, async (worker) =>
        use(copyInferenceReady(worker.ready)),
      )
    }
    if (lease.phase !== 'running' || !lease.client) {
      return null
    }
    let ready: InferenceWorkerReady
    try {
      const current = lease.client.ready
      if (!isQualifiedInferenceWorkerReady(current)) {
        return null
      }
      ready = copyInferenceReady(current)
    } catch {
      // A closed child cannot lend readiness, even while its original callback still owns a lease.
      return null
    }
    return await use(ready)
  }

  /**
   * Freeze a new target while inference owns CUDA. The auxiliary child is the same installed
   * image-derivatives worker with CUDA hidden, and never receives an inference command. Its
   * transport and exit are owned here; the running GPU lends only a copied ready snapshot.
   */
  async withGenerationPreparation<T>(
    scratchBasePath: string,
    use: (preparation: GenerationPreparation) => Promise<T>,
  ): Promise<T | null> {
    if (
      this.generationWorkPrevented ||
      this.host.platform !== 'linux' ||
      this.host.arch !== 'x64' ||
      this.preparationLease ||
      ProjectWorkerClient.hasUnconfirmedExit()
    ) {
      return null
    }
    const generation = this.generationLease
    if (!generation) {
      return await this.withGenerationWorker(scratchBasePath, async (worker) =>
        use({ inferenceReady: copyInferenceReady(worker.ready), targetWorker: worker }),
      )
    }
    if (generation.phase !== 'running' || !generation.client || !generation.key) {
      return null
    }
    let ready: InferenceWorkerReady
    try {
      if (!isQualifiedInferenceWorkerReady(generation.client.ready)) {
        return null
      }
      ready = copyInferenceReady(generation.client.ready)
    } catch {
      return null
    }
    let settleStart!: () => void
    const preparation: PreparationLease = {
      client: null,
      controller: new AbortController(),
      key: generation.key,
      phase: 'starting',
      runtimeId: generation.runtimeId,
      startupSettled: new Promise<void>((resolve) => {
        settleStart = resolve
      }),
    }
    // Reserve before any asynchronous metadata inspection. This also excludes a new GPU launch
    // if the original generation naturally finishes during preparation.
    this.preparationLease = preparation
    try {
      const pointer = await readPointer(this.roots)
      if (this.generationWorkPrevented || pointer.kind !== 'valid') {
        return null
      }
      const prepared = await this.prepareQualification(pointer.value, scratchBasePath)
      if (
        this.generationWorkPrevented ||
        this.hasUnconfirmedGenerationExit() ||
        prepared?.key !== preparation.key
      ) {
        return null
      }
      // Do not queue this CPU work behind withGpuSlot: the running generation owns that slot.
      const client = await ProjectWorkerClient.start(
        {
          pythonExecutable: prepared.worker.location.pythonExecutable,
          runtimeRoot: prepared.worker.location.runtimeRoot,
          stagingBasePath: scratchBasePath,
        },
        {
          environment: { ...prepared.worker.environment, CUDA_VISIBLE_DEVICES: '' },
          signal: preparation.controller.signal,
        },
      )
      preparation.client = client
      preparation.phase = 'running'
      settleStart()
      try {
        const currentPointer = await readPointer(this.roots)
        const current =
          currentPointer.kind === 'valid'
            ? await this.prepareQualification(currentPointer.value, scratchBasePath)
            : null
        if (
          this.generationWorkPrevented ||
          this.hasUnconfirmedGenerationExit() ||
          current?.key !== prepared.key ||
          !client.ready.capabilities.includes('target-composition')
        ) {
          return null
        }
        await this.refreshCheckingStatus()
        return await use({
          inferenceReady: ready,
          targetWorker: { composeTarget: (input) => client.composeTarget(input) },
        })
      } finally {
        try {
          await client.close()
        } catch (error) {
          preparation.phase = 'unconfirmed-exit'
          throw error
        }
      }
    } finally {
      settleStart()
      if (ProjectWorkerClient.hasUnconfirmedExit()) {
        preparation.phase = 'unconfirmed-exit'
      }
      if (preparation.phase !== 'unconfirmed-exit' && this.preparationLease === preparation) {
        this.preparationLease = null
      }
      this.failCheckingStatus()
    }
  }

  async withGenerationWorker<T>(
    scratchBasePath: string,
    use: (worker: GenerationWorkerClient, runtime: QualifiedGenerationWorker) => Promise<T>,
  ): Promise<T | null> {
    if (
      this.generationWorkPrevented ||
      this.host.platform !== 'linux' ||
      this.host.arch !== 'x64' ||
      this.generationLease ||
      this.preparationLease ||
      ProjectWorkerClient.hasUnconfirmedExit()
    ) {
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
        if (this.generationWorkPrevented) {
          return null
        }
        const pointer = await readPointer(this.roots)
        if (this.generationWorkPrevented || pointer.kind !== 'valid') {
          return null
        }
        const prepared = await this.prepareQualification(pointer.value, scratchBasePath)
        if (this.generationWorkPrevented || !prepared) {
          return null
        }
        lease.key = prepared.key
        lease.runtimeId = pointer.value.runtimeId
        if (!(await this.qualifyLiveUnlocked(prepared)) || this.generationWorkPrevented) {
          return null
        }
        const client = await GenerationWorkerClient.start(prepared.worker.location, {
          environment: prepared.worker.environment,
        })
        lease.client = client
        lease.phase = 'running'
        // A callback may close this exact transport before returning (Cancel/failure), or the
        // lease may close it in finally. Track only an intentional close of a healthy child.
        const close = client.close.bind(client)
        client.close = async () => {
          if (lease.phase === 'running') {
            try {
              if (isQualifiedInferenceWorkerReady(client.ready)) {
                lease.phase = 'closing'
              }
            } catch {
              // Unexpectedly closed/failed clients cannot lend normal-close readiness.
            }
          }
          try {
            await close()
          } catch (error) {
            // Revocation must be immediate even if the callback handles the rejected close.
            // Only retryUnconfirmedGenerationExit may release this retained lease.
            lease.phase = 'unconfirmed-exit'
            throw error
          }
        }
        try {
          // Activation may race the second startup. Do not pass a stale environment to a job.
          const currentPointer = await readPointer(this.roots)
          const current =
            currentPointer.kind === 'valid'
              ? await this.prepareQualification(currentPointer.value, scratchBasePath)
              : null
          if (this.generationWorkPrevented || current?.key !== prepared.key) {
            return null
          }
          this.lastQualifiedReady = {
            expiresAt: Date.now() + QUALIFICATION_CACHE_MS,
            key: prepared.key,
            ready: copyInferenceReady(client.ready),
          }
          await this.refreshCheckingStatus()
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
      if (!this.preparationLease || lease.phase === 'unconfirmed-exit') {
        this.failCheckingStatus()
      }
    }
  }

  /**
   * Own one CUDA generation child from live qualification through the caller's last operation and
   * confirmed child exit. The callback may cancel via worker.close(); final close is idempotent. A
   * second caller receives null instead of queueing another GPU worker behind a long job.
   */
  async withSmartPatchGenerationPreparation<T>(
    scratchBasePath: string,
    use: (preparation: SmartPatchGenerationPreparation) => Promise<T>,
  ): Promise<T | null> {
    return await this.withGenerationAdmission(scratchBasePath, async (ready) => {
      const generation = this.generationLease
      if (
        !generation?.key ||
        generation.phase !== 'running' ||
        this.preparationLease ||
        ready.workerVersion !== '0.14.0' ||
        !ready.capabilities.includes('smart-patch-execution') ||
        !ready.capabilities.includes('smart-patch-seed-confirmation')
      ) {
        return null
      }
      let settle!: () => void
      const preparation: PreparationLease = {
        client: null,
        controller: new AbortController(),
        key: generation.key,
        phase: 'starting',
        runtimeId: generation.runtimeId,
        startupSettled: new Promise<void>((resolve) => {
          settle = resolve
        }),
      }
      this.preparationLease = preparation
      try {
        const pointer = await readPointer(this.roots)
        const prepared =
          pointer.kind === 'valid'
            ? await this.prepareQualification(pointer.value, scratchBasePath)
            : null
        if (
          this.generationWorkPrevented ||
          prepared?.key !== generation.key ||
          this.hasUnconfirmedGenerationExit()
        ) {
          return null
        }
        const client = await ProjectWorkerClient.start(
          {
            pythonExecutable: prepared.worker.location.pythonExecutable,
            runtimeRoot: prepared.worker.location.runtimeRoot,
            stagingBasePath: scratchBasePath,
          },
          {
            environment: { ...prepared.worker.environment, CUDA_VISIBLE_DEVICES: '' },
            signal: preparation.controller.signal,
          },
        )
        preparation.client = client
        preparation.phase = 'running'
        settle()
        try {
          const latestPointer = await readPointer(this.roots)
          const latest =
            latestPointer.kind === 'valid'
              ? await this.prepareQualification(latestPointer.value, scratchBasePath)
              : null
          if (
            this.generationWorkPrevented ||
            this.hasUnconfirmedGenerationExit() ||
            latest?.key !== generation.key
          ) {
            return null
          }
          await this.refreshCheckingStatus()
          return await use({ inferenceReady: copyInferenceReady(ready), preparationWorker: client })
        } finally {
          try {
            await client.close()
          } catch (error) {
            preparation.phase = 'unconfirmed-exit'
            throw error
          }
        }
      } finally {
        settle()
        if (ProjectWorkerClient.hasUnconfirmedExit()) {
          preparation.phase = 'unconfirmed-exit'
        }
        if (preparation.phase !== 'unconfirmed-exit' && this.preparationLease === preparation) {
          this.preparationLease = null
        }
        this.failCheckingStatus()
      }
    })
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

  private failCheckingStatus(): void {
    if (!this.generationWorkPrevented && this.previousStatus?.kind === 'checking') {
      this.publishStatus({
        ...this.previousStatus,
        detail: 'The image runtime could not complete startup.',
        kind: 'needs-repair',
      })
    }
  }

  private hasUnconfirmedGenerationExit(): boolean {
    return (
      this.generationLease?.phase === 'unconfirmed-exit' || ProjectWorkerClient.hasUnconfirmedExit()
    )
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
    if (lease.phase === 'closing') {
      return (
        !this.unconfirmedClient &&
        !GenerationWorkerClient.hasUnconfirmedStartExit() &&
        !ProjectWorkerClient.hasUnconfirmedExit()
      )
    }
    try {
      return isQualifiedInferenceWorkerReady(lease.client.ready)
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

  private projectWorkerResolutionAllowed(runtimeId?: string): boolean {
    if (
      this.generationWorkPrevented ||
      this.host.platform !== 'linux' ||
      this.host.arch !== 'x64' ||
      this.unconfirmedClient ||
      GenerationWorkerClient.hasUnconfirmedStartExit() ||
      ProjectWorkerClient.hasUnconfirmedExit()
    ) {
      return false
    }
    for (const lease of [this.generationLease, this.preparationLease]) {
      if (lease && (lease.phase !== 'running' || (runtimeId && lease.runtimeId !== runtimeId))) {
        return false
      }
    }
    return true
  }

  private publishStatus(status: RuntimeStatus): void {
    const previous = this.previousStatus
    if (previous && JSON.stringify(previous) === JSON.stringify(status)) {
      return
    }
    this.previousStatus = status
    this.statusRevision += 1
    if (previous) {
      for (const listener of this.listeners) {
        try {
          listener(status)
        } catch {
          // A failed event consumer must not turn a successful status query into an IPC error.
        }
      }
    }
  }

  private async qualify(prepared: PreparedQualification, useCache: boolean): Promise<boolean> {
    if (
      this.generationWorkPrevented ||
      this.preparationLease ||
      ProjectWorkerClient.hasUnconfirmedExit()
    ) {
      return false
    }
    if (useCache) {
      const cached = this.cachedQualification
      if (cached?.key === prepared.key && cached.expiresAt > Date.now()) {
        const ready = await cached.promise
        return !this.generationWorkPrevented && !ProjectWorkerClient.hasUnconfirmedExit() && ready
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
    if (this.generationWorkPrevented || ProjectWorkerClient.hasUnconfirmedExit()) {
      this.cachedQualification = null
      return false
    }
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
      this.generationWorkPrevented ||
      this.generationLease ||
      this.preparationLease ||
      ProjectWorkerClient.hasUnconfirmedExit()
        ? false
        : await this.qualifyLiveUnlocked(prepared),
    )
  }

  private async qualifyLiveUnlocked(prepared: PreparedQualification): Promise<boolean> {
    // A new self-test supersedes the previous snapshot even when this exact environment fails.
    this.lastQualifiedReady = null
    try {
      if (
        this.generationWorkPrevented ||
        this.preparationLease ||
        ProjectWorkerClient.hasUnconfirmedExit() ||
        !(await this.confirmPreviousExit())
      ) {
        return false
      }
      if (this.generationWorkPrevented) {
        return false
      }
      const before = await readPointer(this.roots)
      if (this.generationWorkPrevented || before.kind !== 'valid') {
        return false
      }
      const unchanged = await this.prepareQualification(
        before.value,
        prepared.worker.location.scratchBasePath,
      )
      if (
        this.generationWorkPrevented ||
        ProjectWorkerClient.hasUnconfirmedExit() ||
        unchanged?.key !== prepared.key
      ) {
        return false
      }
      const client = await this.startClient(prepared.worker.location, prepared.worker.environment)
      const ready = isQualifiedInferenceWorkerReady(client.ready)
        ? copyInferenceReady(client.ready)
        : null
      try {
        // A ready line alone is insufficient: the child must stop before qualification is published.
        await client.close()
      } catch {
        // Do not start another GPU worker while the exit of this one remains unconfirmed.
        this.unconfirmedClient = client
        return false
      }
      const pointer = await readPointer(this.roots)
      if (
        this.generationWorkPrevented ||
        pointer.kind !== 'valid' ||
        pointer.value.runtimeId !== prepared.worker.runtimeId
      ) {
        return false
      }
      const current = await this.prepareQualification(
        pointer.value,
        prepared.worker.location.scratchBasePath,
      )
      const qualified =
        !this.generationWorkPrevented &&
        !ProjectWorkerClient.hasUnconfirmedExit() &&
        current?.key === prepared.key
      if (qualified && ready) {
        this.lastQualifiedReady = {
          expiresAt: Date.now() + QUALIFICATION_CACHE_MS,
          key: prepared.key,
          ready,
        }
      }
      return qualified
    } catch {
      return false
    }
  }

  private async refreshCheckingStatus(): Promise<void> {
    if (!this.generationWorkPrevented && this.previousStatus?.kind === 'checking') {
      // Only called with the validated running lease still held: this cannot start a probe.
      await this.getStatus()
    }
  }

  private shuttingDownStatus(): ApiResult<RuntimeStatus> {
    return {
      error: {
        code: 'RUNTIME_SHUTTING_DOWN',
        message: 'The image runtime is shutting down.',
      },
      ok: false,
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

function copyInferenceReady(ready: InferenceWorkerReady): InferenceWorkerReady {
  return {
    capabilities: [...ready.capabilities],
    protocolVersion: ready.protocolVersion,
    runtimeProfile: ready.runtimeProfile,
    workerVersion: ready.workerVersion,
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
