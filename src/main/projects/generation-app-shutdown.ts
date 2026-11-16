import type { GenerationAppContext } from './generation-app-context.js'
import type { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'

/** The queue owns its own shutdown transaction; this boundary only orders it after worker exit. */
export interface PendingGenerationShutdown {
  cancelPendingForShutdown: () => Promise<unknown>
}

export interface GenerationRuntimeExit {
  preventNewGenerationWork: () => void
  retryUnconfirmedGenerationExit: () => Promise<boolean>
}

/** Invoke model manager stop joins installer/download owners before shared database disposal. */
export interface ModelInstallationShutdown {
  shutdown: () => Promise<void>
}

export interface GenerationAppShutdownDependencies {
  closeDatabase: () => Promise<void>
  context: Pick<GenerationAppContext, 'shutdown'>
  coordinator: Pick<GenerationDispatchCoordinator, 'shutdown'> | null
  modelInstalls?: ModelInstallationShutdown | null
  pendingJobs: PendingGenerationShutdown | null
  runtimeExit?: GenerationRuntimeExit | null
  shutdownImageReads?: () => Promise<void>
}

export class GenerationAppShutdownError extends Error {
  readonly code = 'WORKER_EXIT_UNCONFIRMED'

  constructor() {
    super('The image worker has not confirmed exit.')
    this.name = 'GenerationAppShutdownError'
  }
}

/**
 * App-lifetime close barrier. Failed worker exit, queue cancellation or resource drain keeps SQLite
 * open and permits a later close attempt. Call prepareWindowClose only after the user's
 * Save/Discard choice; finalize after Project tabs have closed, before allowing Electron to quit.
 */
export class GenerationAppShutdown {
  private contextClosed = false
  private finalized = false
  private finalizing: Promise<void> | null = null
  private prepared = false
  private preparing: Promise<void> | null = null

  constructor(private readonly dependencies: GenerationAppShutdownDependencies) {}

  /** Read-only quiescence assertion; never starts closing or claims physical Main exit. */
  assertFinalized(): void {
    if (!this.finalized) {
      throw new Error('The application close barrier has not completed.')
    }
  }

  finalize(): Promise<void> {
    if (this.finalized) {
      return Promise.resolve()
    }
    if (!this.finalizing) {
      const operation = this.finalizeOne()
      this.finalizing = operation
      void operation.catch(() => {
        if (this.finalizing === operation) {
          this.finalizing = null
        }
      })
    }
    return this.finalizing
  }

  prepareWindowClose(): Promise<void> {
    if (this.prepared) {
      return Promise.resolve()
    }
    if (!this.preparing) {
      const operation = this.prepareOne()
      this.preparing = operation
      void operation.catch(() => {
        if (this.preparing === operation) {
          this.preparing = null
        }
      })
    }
    return this.preparing
  }

  private async finalizeOne(): Promise<void> {
    await this.prepareWindowClose()
    if (!this.contextClosed) {
      this.dependencies.context.shutdown()
      this.contextClosed = true
    }
    await this.dependencies.closeDatabase()
    this.finalized = true
  }

  private async prepareGeneration(): Promise<void> {
    if (this.dependencies.shutdownImageReads) {
      await this.dependencies.shutdownImageReads()
    }
    await this.dependencies.coordinator?.shutdown()
    await this.dependencies.pendingJobs?.cancelPendingForShutdown()
    if (
      this.dependencies.runtimeExit &&
      !(await this.dependencies.runtimeExit.retryUnconfirmedGenerationExit())
    ) {
      throw new GenerationAppShutdownError()
    }
  }

  private async prepareOne(): Promise<void> {
    // This runs synchronously when prepareWindowClose creates the promise. No status probe or
    // generation lease can be admitted while the remaining shutdown steps await I/O.
    this.dependencies.runtimeExit?.preventNewGenerationWork()
    let modelShutdown: Promise<void>
    try {
      // Closing admission must happen synchronously, before either owner awaits
      // I/O. Both settlements are awaited even if the other owner fails.
      modelShutdown = this.dependencies.modelInstalls?.shutdown() ?? Promise.resolve()
    } catch (error) {
      modelShutdown = Promise.reject(error)
    }
    const outcomes = await Promise.allSettled([this.prepareGeneration(), modelShutdown])
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        throw outcome.reason
      }
    }
    this.prepared = true
  }
}
