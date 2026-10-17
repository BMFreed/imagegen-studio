import type { ProjectOpenResult, ProjectTab } from '../../shared/api.js'

import type { GenerationOrchestrator } from './generation-orchestrator.js'
import type { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import type { ProjectGenerationCloseServices } from './project-generation-close.js'
import type { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import type { ProjectService } from './project-service.js'

interface RecoveryServices {
  orchestrator: ProjectGenerationCloseServices['orchestrator']
  staging: { discardProject: (projectId: string) => Promise<{ cleanupDeferred: boolean }> }
}

export class ProjectGenerationRecoveryError extends Error {
  readonly code = 'PROJECT_GENERATION_RECOVERY_UNAVAILABLE'

  constructor() {
    super(
      'Temporary generation recovery is unavailable. Nothing was discarded from the document recovery. Repair recovery storage before discarding, or Recover the document for review.',
    )
    this.name = 'ProjectGenerationRecoveryError'
  }
}

/**
 * Resolve the ordinary document recovery decision with its Project-wide staging consequence.
 * Validation belongs to ProjectService; its discard callback runs before erasing the shadow.
 * Durable tombstones precede shadow deletion/open, while physical cleanup may resume on restart.
 */
export class ProjectGenerationRecovery {
  constructor(
    private readonly documents: Pick<ProjectService, 'open' | 'resolveRecovery'>,
    private readonly services: RecoveryServices | null,
    private readonly gate: ProjectGenerationOperationGate,
  ) {}

  async open(projectId: string): Promise<ProjectOpenResult> {
    return await this.gate.run(projectId, async () => await this.documents.open(projectId))
  }

  async resolve(projectId: string, decision: 'discard' | 'recover'): Promise<ProjectTab> {
    return await this.gate.run(projectId, async () => {
      let cleanupDeferred = false
      const tab = await this.documents.resolveRecovery(projectId, decision, async () => {
        const services = this.services
        if (!services) {
          throw new ProjectGenerationRecoveryError()
        }
        await services.orchestrator.fenceProjectGeneration(projectId)
        await services.orchestrator.cancelProjectJobs(projectId)
        const discarded = await services.staging.discardProject(projectId)
        cleanupDeferred = discarded.cleanupDeferred
        // The Project is still closed here. A subsequent successful open may release this
        // confirmed fence; failed tombstones/cancellation keep it until explicit retry/restart.
        services.orchestrator.completeProjectGenerationClose(projectId)
      })
      return cleanupDeferred
        ? {
            ...tab,
            storageWarning: [
              tab.storageWarning,
              'Temporary results were discarded. Some local image files still need cleanup; cleanup will be retried after restarting the app.',
            ]
              .filter(Boolean)
              .join(' '),
          }
        : tab
    })
  }
}

/** An already opened document stays reviewable when generation recovery retains its fence. */
export async function reconcileOpenedProjectGeneration(
  projectId: string,
  wasOpen: boolean,
  orchestrator: Pick<GenerationOrchestrator, 'reopenProjectGeneration'> | null,
  acceptance: Pick<ProjectGenerationAcceptance, 'reconcile'> | null,
): Promise<string | null> {
  try {
    if (!wasOpen) {
      orchestrator?.reopenProjectGeneration(projectId)
    }
    await acceptance?.reconcile(projectId)
    return null
  } catch (error) {
    // Match the generation action error boundary's existing 512-character diagnostic ceiling.
    const diagnostic = error instanceof Error ? error.message.slice(0, 512) : ''
    return `Generation recovery needs attention. The Project is open for review; check temporary results before generating. Repair local recovery and reopen or restart. ${diagnostic}`.trim()
  }
}
