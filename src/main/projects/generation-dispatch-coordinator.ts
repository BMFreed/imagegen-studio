import type { GenerationOrchestrator } from './generation-orchestrator.js'
import type { PrivateSmartPatchExecution } from './generation-orchestrator.js'
import type { PrivateRegionalExecution } from './generation-orchestrator.js'
import type {
  GenerationProcessorResult,
  GenerationWorkerTransport,
} from './generation-processor.js'
import type { GenerationProcessor } from './generation-processor.js'
import type {
  RegionalGenerationProcessorResult,
  RegionalGenerationTransport,
} from './regional-generation-processor.js'
import type {
  SmartPatchInferenceTransport,
  SmartPatchProcessorResult,
} from './smart-patch-generation-processor.js'

export interface GenerationWorkerLease {
  retryUnconfirmedGenerationExit: () => Promise<boolean>
  withGenerationWorker: <T>(
    scratchBasePath: string,
    use: (worker: GenerationWorkerTransport) => Promise<T>,
  ) => Promise<T | null>
}

type DispatchResult =
  GenerationProcessorResult | RegionalGenerationProcessorResult | SmartPatchProcessorResult

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
 * row at a time. Empty or fenced work is checked before acquiring the GPU; the later verified claim
 * still owns dispatch. The runtime lease owns confirmed exit after completion, failure or cancel.
 */
export class GenerationDispatchCoordinator {
  private activeRun: Promise<DispatchResult> | null = null
  private closed = false
  private shutdownPromise: Promise<void> | null = null

  constructor(
    private readonly runtime: GenerationWorkerLease,
    private readonly orchestrator: Partial<Pick<GenerationOrchestrator, 'nextDispatchableKind'>> &
      Partial<Pick<GenerationOrchestrator, 'stopRegionalExecutions'>> &
      Pick<GenerationOrchestrator, 'hasDispatchablePending' | 'runNext'>,
    private readonly processor: Pick<GenerationProcessor, 'stopAndCancelActive'>,
    private readonly scratchBasePath: string,
    private readonly smartPatch?: {
      execution: PrivateSmartPatchExecution
      nextPending: () => Promise<'normal' | 'regional' | 'smart-patch' | null>
    },
    private readonly regional?: Pick<PrivateRegionalExecution, 'onChanged' | 'runNext'>,
  ) {}

  onChanged(listener: () => void): () => void {
    const stopSmart = this.smartPatch?.execution.onChanged?.(listener)
    const stopRegional = this.regional?.onChanged(listener)
    return () => {
      stopSmart?.()
      stopRegional?.()
    }
  }

  async runNext(): Promise<DispatchResult> {
    if (this.closed) {
      throw new GenerationDispatchError('CLOSED', 'Generation dispatch has stopped.')
    }
    if (this.activeRun) {
      throw new GenerationDispatchError('BUSY', 'A generation job is already being processed.')
    }
    const operation = (async (): Promise<DispatchResult> => {
      const nextKind = async () =>
        this.smartPatch
          ? await this.smartPatch.nextPending()
          : this.regional && this.orchestrator.nextDispatchableKind
            ? await this.orchestrator.nextDispatchableKind()
            : (await this.orchestrator.hasDispatchablePending())
              ? 'normal'
              : null
      const kind = await nextKind()
      if (!kind || this.closed) {
        return { kind: 'idle' }
      }
      const result = await this.runtime.withGenerationWorker(
        this.scratchBasePath,
        async (worker) => {
          if (this.closed) {
            return { kind: 'idle' as const }
          }
          const currentKind = await nextKind()
          if (!currentKind) {
            return { kind: 'idle' as const }
          }
          if (currentKind === 'regional') {
            const transport = worker as GenerationWorkerTransport &
              Partial<RegionalGenerationTransport>
            if (!this.regional || typeof transport.executeCurrentCanvasRegional !== 'function') {
              throw new GenerationDispatchError(
                'RUNTIME_UNAVAILABLE',
                'The installed worker cannot execute Regional Guidance.',
              )
            }
            return await this.regional.runNext({
              close: transport.close.bind(transport),
              executeCurrentCanvasRegional: transport.executeCurrentCanvasRegional.bind(transport),
              ready: transport.ready,
            })
          }
          if (currentKind === 'smart-patch' && this.smartPatch) {
            const transport = worker as GenerationWorkerTransport &
              Partial<SmartPatchInferenceTransport>
            if (typeof transport.executeSmartPatch !== 'function') {
              throw new GenerationDispatchError(
                'RUNTIME_UNAVAILABLE',
                'The installed worker cannot execute Smart Patches.',
              )
            }
            return await this.smartPatch.execution.runNext({
              close: transport.close.bind(transport),
              executeSmartPatch: transport.executeSmartPatch.bind(transport),
              ...(typeof transport.executeAnimaSmartPatchRegional === 'function'
                ? {
                    executeAnimaSmartPatchRegional:
                      transport.executeAnimaSmartPatchRegional.bind(transport),
                  }
                : {}),
              ready: transport.ready,
            })
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
    const stopping = Promise.all([
      this.processor.stopAndCancelActive(),
      this.smartPatch?.execution.stopAndCancelActive(),
      this.orchestrator.stopRegionalExecutions?.(),
    ])
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
    await this.smartPatch?.execution.stopAndCancelActive()
    await this.orchestrator.stopRegionalExecutions?.()
  }
}
