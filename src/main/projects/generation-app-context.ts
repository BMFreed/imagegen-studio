import type { AppDatabase } from '../db/database.js'
import type { GenerationQueueRepository } from './generation-queue.js'
import type { GenerationStagingRepository } from './generation-staging.js'
import type { GenerationModelResolver } from './illustrious-generation-loras.js'
import type { ProjectIndexRepository } from './project-index.js'
import type { ProjectService } from './project-service.js'

import { recoverGenerationRepositories } from './generation-bootstrap.js'
import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationProcessor } from './generation-processor.js'

export interface GenerationAppDependencies {
  database: Pick<AppDatabase, 'db'>
  dataRoot: string
  modelService: GenerationModelResolver
  projectIndex: Pick<ProjectIndexRepository, 'getProject'>
  projectService: Pick<
    ProjectService,
    'getOpenDocumentId' | 'getOpenTabs' | 'prepareNormalGenerationContext'
  >
  scratchBasePath: string
}

export interface RecoveredGenerationServices {
  readonly orchestrator: GenerationOrchestrator
  readonly processor: GenerationProcessor
  readonly queue: GenerationQueueRepository
  readonly staging: GenerationStagingRepository
}

export type GenerationAppAvailability =
  | { readonly kind: 'closed' }
  | { readonly kind: 'recovery-failed' }
  | { readonly kind: 'storage-recovered' }

export interface GenerationAppContext {
  readonly availability: GenerationAppAvailability
  readonly recoveryFailure: unknown | null
  requireRecoveredServices: () => RecoveredGenerationServices
  shutdown: () => void
}

/**
 * Main-owned generation storage and orchestration. Storage recovery is a prerequisite, not a claim
 * that an inference runtime or any installed checkpoint can generate an image. This context owns no
 * worker process; shutdown only blocks future service retrieval. A caller holding services must
 * stop its own dispatch and confirm worker exit before the shared SQLite connection ends.
 */
class OwnedGenerationAppContext implements GenerationAppContext {
  get availability(): GenerationAppAvailability {
    if (this.closed) {
      return { kind: 'closed' }
    }
    return this.services ? { kind: 'storage-recovered' } : { kind: 'recovery-failed' }
  }

  private closed = false

  constructor(
    private services: RecoveredGenerationServices | null,
    readonly recoveryFailure: unknown | null,
  ) {}

  requireRecoveredServices(): RecoveredGenerationServices {
    if (this.closed) {
      throw new GenerationAppContextError(
        'GENERATION_CONTEXT_CLOSED',
        'Generation storage is closed.',
      )
    }
    if (!this.services) {
      throw new GenerationAppContextError(
        'GENERATION_STORAGE_UNAVAILABLE',
        'Generation storage did not recover and cannot accept work.',
      )
    }
    return this.services
  }

  shutdown(): void {
    this.closed = true
    this.services = null
  }
}

export class GenerationAppContextError extends Error {
  constructor(
    readonly code: 'GENERATION_CONTEXT_CLOSED' | 'GENERATION_STORAGE_UNAVAILABLE',
    message: string,
  ) {
    super(message)
    this.name = 'GenerationAppContextError'
  }
}

/** Recover exactly one pair, then bind one processor and orchestrator to those same instances. */
export async function createGenerationAppContext(
  dependencies: GenerationAppDependencies,
): Promise<GenerationAppContext> {
  try {
    const { queue, staging } = await recoverGenerationRepositories(
      dependencies.database,
      dependencies.dataRoot,
    )
    const processor = new GenerationProcessor(
      queue,
      staging,
      dependencies.modelService,
      dependencies.scratchBasePath,
    )
    const orchestrator = new GenerationOrchestrator(
      dependencies.projectService,
      dependencies.projectIndex,
      dependencies.modelService,
      queue,
      staging,
      processor,
      dependencies.scratchBasePath,
    )
    return new OwnedGenerationAppContext({ orchestrator, processor, queue, staging }, null)
  } catch (error) {
    // A partially recovered pair must never become reachable through this context.
    return new OwnedGenerationAppContext(null, error)
  }
}
