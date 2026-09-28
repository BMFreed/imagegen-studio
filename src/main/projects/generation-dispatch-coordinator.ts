import type { GenerationOrchestrator } from './generation-orchestrator.js'
import type {
  GenerationProcessorResult,
  GenerationWorkerTransport,
} from './generation-processor.js'
import type { GenerationProcessor } from './generation-processor.js'

export interface GenerationWorkerLease {
  retryUnconfirmedGenerationExit: () => Promise<boolean>
  withGenerationWorker: <T>(
    scratchBasePath: string,
    use: (worker: GenerationWorkerTransport) => Promise<T>,
  ) => Promise<T | null>
}

export class GenerationDispatchError extends Error {
  constructor(
    readonly code: 'BUSY' | 'CLOSED' | 'RUNTIME_UNAVAILABLE' | 'WORKER_EXIT_UNCONFIRMED',
    message: string,
  ) {
    super(message)
    this.name = 'GenerationDispatchError'
  }
}

/**
 * App-owned dispatch boundary. One recovered processor and one GPU lease handle one oldest pending
 * row at a time. The runtime lease owns confirmed worker exit on completion, failure, cancellation
 * and idle. This has no renderer entry point or automatic queue drain yet.
 */
export class GenerationDispatchCoordinator {
  private activeRun: Promise<GenerationProcessorResult> | null = null
  private closed = false
  private shutdownPromise: Promise<void> | null = null

  constructor(
    private readonly runtime: GenerationWorkerLease,
    private readonly orchestrator: Pick<GenerationOrchestrator, 'runNext'>,
    private readonly processor: Pick<GenerationProcessor, 'stopAndCancelActive'>,
    private readonly scratchBasePath: string,
  ) {}

  async runNext(): Promise<GenerationProcessorResult> {
    if (this.closed) {
      throw new GenerationDispatchError('CLOSED', 'Generation dispatch has stopped.')
    }
    if (this.activeRun) {
      throw new GenerationDispatchError('BUSY', 'A generation job is already being processed.')
    }
    const operation = (async (): Promise<GenerationProcessorResult> => {
      const result = await this.runtime.withGenerationWorker(
        this.scratchBasePath,
        async (worker) => {
          if (this.closed) {
            return { kind: 'idle' as const }
          }
          return await this.orchestrator.runNext(worker)
        },
      )
      if (result === null) {
        throw new GenerationDispatchError(
          'RUNTIME_UNAVAILABLE',
          'The image runtime could not reserve a qualified generation worker.',
        )
      }
      return result
    })()
    this.activeRun = operation
    try {
      return await operation
    } finally {
      if (this.activeRun === operation) {
        this.activeRun = null
      }
    }
  }

  async shutdown(): Promise<void> {
    this.closed = true
    this.shutdownPromise ??= this.shutdownOne().catch((error: unknown) => {
      // An unconfirmed exit remains owned by RuntimeManager and can be retried explicitly.
      this.shutdownPromise = null
      throw error
    })
    await this.shutdownPromise
  }

  private async shutdownOne(): Promise<void> {
    const stopping = this.processor.stopAndCancelActive()
    const running = this.activeRun
    await Promise.allSettled([stopping, running ?? Promise.resolve()])
    if (!(await this.runtime.retryUnconfirmedGenerationExit())) {
      throw new GenerationDispatchError(
        'WORKER_EXIT_UNCONFIRMED',
        'The generation worker has not confirmed exit.',
      )
    }
    // The first stop may have run before a queue claim, or failed before acknowledging worker
    // exit. Repeat after the active lease settles so no newly claimed row remains running.
    await this.processor.stopAndCancelActive()
  }
}
