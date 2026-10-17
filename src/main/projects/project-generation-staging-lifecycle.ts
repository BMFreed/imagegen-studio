import type { GenerationStagingRepository } from './generation-staging.js'
import type { SmartPatchGenerationStagingRepository } from './smart-patch-generation-staging.js'

/** Presence and Project-wide teardown share both recovered stores; acceptance stays typed. */
export class ProjectGenerationStagingLifecycle {
  constructor(
    private readonly normal: Pick<
      GenerationStagingRepository,
      'discardProject' | 'listVerifiedCandidates'
    >,
    private readonly smart: Pick<
      SmartPatchGenerationStagingRepository,
      'discardProject' | 'listVerifiedCandidates'
    >,
  ) {}

  async discardProject(tabId: string): Promise<{ cleanupDeferred: boolean }> {
    // Validate both stores before the first tombstone. Caller fences/drains the whole Project.
    await this.listVerifiedCandidates(tabId)
    const normal = await this.normal.discardProject(tabId)
    const smart = await this.smart.discardProject(tabId)
    return { cleanupDeferred: normal.cleanupDeferred || smart.cleanupDeferred }
  }

  async listVerifiedCandidates(tabId: string) {
    const normal = await this.normal.listVerifiedCandidates(tabId)
    const smart = await this.smart.listVerifiedCandidates(tabId)
    const ids = new Set(normal.map((candidate) => candidate.candidateId))
    const sessions = new Set(normal.map((candidate) => candidate.stagingSessionId))
    if (
      smart.some(
        (candidate) => ids.has(candidate.candidateId) || sessions.has(candidate.stagingSessionId),
      )
    ) {
      throw new Error(
        'Raster and Smart Patch temporary ownership overlap. Recovery storage was retained.',
      )
    }
    return [...normal, ...smart]
  }
}
