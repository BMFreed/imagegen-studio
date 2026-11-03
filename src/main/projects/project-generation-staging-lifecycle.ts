import type { GenerationStagingRepository } from './generation-staging.js'
import type { SmartPatchGenerationStagingRepository } from './smart-patch-generation-staging.js'

/** Public presence stays typed; Project-wide teardown also owns private regional candidates. */
export class ProjectGenerationStagingLifecycle {
  constructor(
    private readonly normal: Partial<
      Pick<GenerationStagingRepository, 'listVerifiedRegionalCandidates'>
    > &
      Pick<GenerationStagingRepository, 'discardProject' | 'listVerifiedCandidates'>,
    private readonly smart: Pick<
      SmartPatchGenerationStagingRepository,
      'discardProject' | 'listVerifiedCandidates'
    >,
  ) {}

  async discardProject(tabId: string): Promise<{ cleanupDeferred: boolean }> {
    // Validate every owner before the first tombstone. Caller fences/drains the whole Project.
    await this.listOwnedCandidates(tabId)
    const normal = await this.normal.discardProject(tabId)
    const smart = await this.smart.discardProject(tabId)
    return { cleanupDeferred: normal.cleanupDeferred || smart.cleanupDeferred }
  }

  /** Lifecycle-only inspection; private candidates never enter public Results/Home discovery. */
  async listOwnedCandidates(tabId: string) {
    const publicCandidates = await this.listVerifiedCandidates(tabId)
    const regional = (await this.normal.listVerifiedRegionalCandidates?.(tabId)) ?? []
    const ids = new Set(publicCandidates.map((candidate) => candidate.candidateId))
    const sessions = new Set(publicCandidates.map((candidate) => candidate.stagingSessionId))
    if (
      regional.some(
        (candidate) => ids.has(candidate.candidateId) || sessions.has(candidate.stagingSessionId),
      )
    ) {
      throw new Error(
        'Public and private regional temporary ownership overlap. Recovery storage was retained.',
      )
    }
    return [...publicCandidates, ...regional]
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
