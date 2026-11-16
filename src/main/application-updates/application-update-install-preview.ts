/**
 * InvokeAI4875d96531ca6712b288f6e660fcbb34143408c1: shared/database/queries/session_queue.py
 * status_counts -> session_queue_default.py get_queue_status -> api/routers/session_queue.py
 * get_queue_status; model_install_default.py list_jobs -> api/routers/model_manager.py. Adapt those
 * existing operational inspections via Studio's close owners. Launcher c267bdb4 updater.ts ->
 * main-process-manager.ts has no combined pre-install impact review. This is an advisory
 * projection, never installation/close consent.
 */
import type { ProjectCloseImpact, ProjectTab } from '../../shared/api.js'
import type { ApplicationUpdateInstallPreview } from '../../shared/application-updates.js'

export interface ApplicationUpdateInstallPreviewDependencies {
  getModelImpact: () => {
    activeJobCount: number
    committingJobCount: number
    preparingInstallCount: number
    storageMutationActive: boolean
  }
  getOpenTabs: () => ProjectTab[]
  getProjectImpact: (tabId: string) => Promise<ProjectCloseImpact>
  getQueueImpact: () => Promise<{ unfinishedJobCount: number }> | null
}

type Impact = Omit<ApplicationUpdateInstallPreview, 'availableVersion'>
type TabSnapshot = Pick<ProjectTab, 'dirty' | 'id'>

/**
 * No Save/flush/fence/drain/close/cancel/discard/stage/activation command is admitted here. The
 * existing staging inspector may validate or harden operational directories; this does not claim
 * byte-for-byte filesystem read-only behavior. Ordinary close must reflush/reinspect later.
 */
export async function collectApplicationUpdateInstallPreview(
  dependencies: ApplicationUpdateInstallPreviewDependencies,
): Promise<Impact> {
  const before = snapshotTabs(dependencies.getOpenTabs())
  // One app-wide aggregate includes closed Projects/private operations. Never add per-tab jobs.
  // Read it before candidates so an intervening completion remains represented in this review.
  const queue = await dependencies.getQueueImpact()
  let unfinished: number | null = null
  if (queue !== null) {
    unfinished = queue.unfinishedJobCount
    assertCount(unfinished)
  }
  let unavailable = queue === null
  let candidates = 0
  for (const tab of before) {
    const impact = await dependencies.getProjectImpact(tab.id)
    assertCount(impact.completedCandidateCount)
    assertCount(impact.unfinishedJobCount)
    assertBoolean(impact.generationStorageUnavailable)
    unavailable ||= impact.generationStorageUnavailable
    candidates += impact.completedCandidateCount
    assertCount(candidates)
  }
  const models = dependencies.getModelImpact()
  assertCount(models.activeJobCount)
  assertCount(models.committingJobCount)
  assertCount(models.preparingInstallCount)
  assertBoolean(models.storageMutationActive)
  const after = snapshotTabs(dependencies.getOpenTabs())
  if (
    before.length !== after.length ||
    before.some((tab, index) => tab.id !== after[index].id || tab.dirty !== after[index].dirty)
  ) {
    throw new Error('Project close impact changed. Refresh the installation review.')
  }
  return {
    activeModelInstallCount: models.activeJobCount,
    generationStorageUnavailable: unavailable,
    openProjectCount: before.length,
    preparingModelInstallCount: models.preparingInstallCount,
    resourceRemovalActive: models.storageMutationActive,
    unacceptedResultCount: unavailable ? null : candidates,
    unfinishedJobCount: unavailable ? null : unfinished,
    unsavedProjectCount: before.filter((tab) => tab.dirty).length,
  }
}

function snapshotTabs(tabs: ProjectTab[]): TabSnapshot[] {
  if (!Array.isArray(tabs)) {
    throw new TypeError('Project close impact is unavailable.')
  }
  const ids = new Set<string>()
  return tabs
    .map((tab) => {
      if (typeof tab.id !== 'string' || tab.id.length === 0 || ids.has(tab.id)) {
        throw new Error('Project close impact is unavailable.')
      }
      ids.add(tab.id)
      assertBoolean(tab.dirty)
      return { dirty: tab.dirty, id: tab.id }
    })
    .sort((first, second) => (first.id < second.id ? -1 : first.id > second.id ? 1 : 0))
}

function assertCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Application close impact is unavailable.')
  }
}

function assertBoolean(value: boolean): void {
  if (typeof value !== 'boolean') {
    throw new TypeError('Application close impact is unavailable.')
  }
}
