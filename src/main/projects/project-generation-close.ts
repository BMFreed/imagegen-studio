import type { ProjectCloseImpact, ProjectTab } from '../../shared/api.js'

import type { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'

/** The close owner sees the same recovered repositories used by generation dispatch. */
export interface ProjectGenerationCloseServices {
  orchestrator: {
    cancelProjectJobs: (tabId: string) => Promise<void>
    completeProjectGenerationClose: (tabId: string) => void
    fenceProjectGeneration: (tabId: string) => Promise<void>
    releaseProjectGenerationFence: (tabId: string) => void
  }
  queue: {
    listUnfinishedByProject: (tabId: string) => Promise<readonly unknown[]>
  }
  staging: {
    discardProject: (tabId: string) => Promise<unknown>
    /** Operational close impact may include private candidates hidden from Home/Results. */
    listOwnedCandidates?: (tabId: string) => Promise<readonly unknown[]>
    listVerifiedCandidates: (tabId: string) => Promise<readonly unknown[]>
  }
}

export interface ProjectGenerationCloseDocuments {
  close: (tabId: string) => Promise<void>
  discardAndClose: (tabId: string) => Promise<void>
  getOpenTabs: () => ProjectTab[]
}

export class ProjectGenerationCloseError extends Error {
  constructor(
    readonly code:
      | 'PROJECT_ACCEPTANCE_PENDING'
      | 'PROJECT_CLOSE_ALREADY_RUNNING'
      | 'PROJECT_CLOSE_CONFIRMATION_REQUIRED'
      | 'PROJECT_DIRTY'
      | 'PROJECT_NOT_OPEN',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectGenerationCloseError'
  }
}

/**
 * One Project close boundary. The preview is advisory: close fences enqueue/claim and re-reads
 * impact before any irreversible cancellation. A failed unconfirmed attempt releases its fence;
 * after cancellation starts the fence stays in place so a retry cannot publish a late result.
 */
export class ProjectGenerationClose {
  private readonly closing = new Set<string>()

  constructor(
    private readonly documents: ProjectGenerationCloseDocuments,
    private readonly services: ProjectGenerationCloseServices | null,
    private readonly gate?: ProjectGenerationOperationGate,
    private readonly hasPendingHandoff?: (tabId: string) => boolean,
  ) {}

  async close(
    tabId: string,
    options: { confirmCloseImpact: boolean; discardDocument: boolean },
  ): Promise<void> {
    if (this.closing.has(tabId)) {
      throw new ProjectGenerationCloseError(
        'PROJECT_CLOSE_ALREADY_RUNNING',
        'This Project is already closing.',
      )
    }
    this.closing.add(tabId)
    try {
      await (this.gate
        ? this.gate.run(tabId, async () => await this.closeUnlocked(tabId, options))
        : this.closeUnlocked(tabId, options))
    } finally {
      this.closing.delete(tabId)
    }
  }

  async getCloseImpact(tabId: string): Promise<ProjectCloseImpact> {
    this.assertOpen(tabId)
    this.assertNoPendingHandoff(tabId)
    return await this.readImpact(tabId)
  }

  private assertNoPendingHandoff(tabId: string): void {
    if (this.hasPendingHandoff?.(tabId)) {
      throw new ProjectGenerationCloseError(
        'PROJECT_ACCEPTANCE_PENDING',
        'Finish recovering the accepted generation results before closing this Project.',
      )
    }
  }

  private assertOpen(tabId: string): ProjectTab {
    const tab = this.documents.getOpenTabs().find((candidate) => candidate.id === tabId)
    if (!tab) {
      throw new ProjectGenerationCloseError('PROJECT_NOT_OPEN', 'This Project is not open.')
    }
    return tab
  }

  private async closeUnlocked(
    tabId: string,
    options: { confirmCloseImpact: boolean; discardDocument: boolean },
  ): Promise<void> {
    let destructiveStarted = false
    let fenced = false
    try {
      const tab = this.assertOpen(tabId)
      this.assertNoPendingHandoff(tabId)
      if (tab.dirty && !options.discardDocument) {
        // This preflight prevents discarding generation before the document close guard runs.
        throw new ProjectGenerationCloseError(
          'PROJECT_DIRTY',
          'Save or discard the Project changes before closing this tab.',
        )
      }
      const services = this.services
      if (!services) {
        // Recovery failed before this Project opened. We cannot enumerate or erase unknown
        // staging safely; an explicit degraded close preserves it for the next recovery attempt.
        if (!options.confirmCloseImpact) {
          throw new ProjectGenerationCloseError(
            'PROJECT_CLOSE_CONFIRMATION_REQUIRED',
            'Generation recovery storage is unavailable. Review the close warning first.',
          )
        }
        await (options.discardDocument
          ? this.documents.discardAndClose(tabId)
          : this.documents.close(tabId))
        return
      }
      await services.orchestrator.fenceProjectGeneration(tabId)
      fenced = true
      const impact = await this.readImpact(tabId)
      if (
        !options.confirmCloseImpact &&
        (impact.unfinishedJobCount > 0 || impact.completedCandidateCount > 0)
      ) {
        throw new ProjectGenerationCloseError(
          'PROJECT_CLOSE_CONFIRMATION_REQUIRED',
          'Generation jobs or unaccepted results appeared. Review them before closing.',
        )
      }
      destructiveStarted = true
      await services.orchestrator.cancelProjectJobs(tabId)
      await services.staging.discardProject(tabId)
      await (options.discardDocument
        ? this.documents.discardAndClose(tabId)
        : this.documents.close(tabId))
      services.orchestrator.completeProjectGenerationClose(tabId)
    } finally {
      if (fenced && !destructiveStarted) {
        this.services?.orchestrator.releaseProjectGenerationFence(tabId)
      }
    }
  }

  private async readImpact(tabId: string): Promise<ProjectCloseImpact> {
    const services = this.services
    if (!services) {
      return {
        completedCandidateCount: 0,
        generationStorageUnavailable: true,
        unfinishedJobCount: 0,
      }
    }
    // Queue is read first, then staging. A running row that completes between reads appears in
    // at least one snapshot; false negatives cannot silently discard a newly completed image.
    const unfinished = await services.queue.listUnfinishedByProject(tabId)
    const completed = await (services.staging.listOwnedCandidates
      ? services.staging.listOwnedCandidates(tabId)
      : services.staging.listVerifiedCandidates(tabId))
    return {
      completedCandidateCount: completed.length,
      generationStorageUnavailable: false,
      unfinishedJobCount: unfinished.length,
    }
  }
}
