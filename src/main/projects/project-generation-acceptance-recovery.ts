import type { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import type { GenerationAcceptanceKind } from './smart-patch-acceptance-journal.js'

export interface ProjectGenerationAcceptanceRecoveryOptions {
  documents: { getOpenDocumentId: (tabId: string) => string | null }
  gate: Pick<ProjectGenerationOperationGate, 'drain'>
  orchestrator: {
    fenceProjectGeneration: (tabId: string) => Promise<void>
    releaseProjectGenerationFence: (tabId: string) => void
  }
  raster: AcceptanceRecoveryOwner
  readKind: (tabId: string, documentId: string) => Promise<GenerationAcceptanceKind | null>
  smartPatch: AcceptanceRecoveryOwner & {
    hasUnjournaledOverlap: (tabId: string) => Promise<boolean>
  }
}

interface AcceptanceRecoveryOwner {
  hasPendingHandoff: (tabId: string) => boolean
  reconcile: (tabId: string) => Promise<'cleaned' | 'none'>
}

export class ProjectGenerationAcceptanceRecoveryError extends Error {
  readonly code = 'ACCEPTANCE_RECOVERY_REQUIRED'

  constructor(message: string) {
    super(message)
    this.name = 'ProjectGenerationAcceptanceRecoveryError'
  }
}

/**
 * Route the shared SQL intent to exactly one owner. Delegates own gate.run; nesting it here would
 * deadlock. This marker also protects close while classification has not yet chosen an owner.
 */
export class ProjectGenerationAcceptanceRecovery {
  private readonly inFlight = new Map<
    string,
    {
      mode: 'before-raster' | 'full' | 'raster-add' | 'smart-add'
      operation: Promise<'cleaned' | 'none'>
    }
  >()
  private readonly unresolved = new Set<string>()

  constructor(private readonly options: ProjectGenerationAcceptanceRecoveryOptions) {}

  /** Preserve Raster Add's own pending-selection policy; recover only a foreign Smart owner. */
  async beforeRasterAdd(tabId: string): Promise<'cleaned' | 'none'> {
    return await this.run(tabId, 'before-raster')
  }

  hasPendingHandoff(tabId: string): boolean {
    return (
      this.inFlight.has(tabId) ||
      this.unresolved.has(tabId) ||
      this.options.raster.hasPendingHandoff(tabId) ||
      this.options.smartPatch.hasPendingHandoff(tabId)
    )
  }

  async reconcile(tabId: string): Promise<'cleaned' | 'none'> {
    return await this.run(tabId, 'full')
  }

  /** Keep one synchronous marker from completed classification through actual Raster gate admission. */
  async withRasterAdd<T>(tabId: string, add: () => Promise<T>): Promise<T> {
    for (;;) {
      await this.beforeRasterAdd(tabId)
      // A full open/recovery may have started after the narrow check resolved but before its
      // caller resumed. Wait for that owner, then classify again rather than racing its fence.
      const existing = this.inFlight.get(tabId)
      if (existing) {
        await existing.operation
        continue
      }
      let settle!: (value: 'none') => void
      const operation = new Promise<'none'>((resolve) => {
        settle = resolve
      })
      const marker = { mode: 'raster-add' as const, operation }
      this.inFlight.set(tabId, marker)
      try {
        // The callback registers normal.accept's gate.run synchronously, before yielding. No
        // recovery classifier can slip between that admission and the marker above.
        return await add()
      } finally {
        // Admission/acceptance errors belong to the normal owner. Wake waiting recovery even
        // when Add failed; its own pending map/fence records any uncertain handoff.
        settle('none')
        if (this.inFlight.get(tabId) === marker) {
          this.inFlight.delete(tabId)
        }
      }
    }
  }

  /** Hold the recovery marker through CPU preflight and the Smart owner's gate/journal. */
  async withSmartPatchAdd<T>(tabId: string, add: () => Promise<T>): Promise<T> {
    for (;;) {
      await this.reconcile(tabId)
      const existing = this.inFlight.get(tabId)
      if (existing) {
        await existing.operation
        continue
      }
      let settle!: (value: 'none') => void
      const operation = new Promise<'none'>((resolve) => {
        settle = resolve
      })
      const marker = { mode: 'smart-add' as const, operation }
      this.inFlight.set(tabId, marker)
      try {
        return await add()
      } finally {
        settle('none')
        if (this.inFlight.get(tabId) === marker) {
          this.inFlight.delete(tabId)
        }
      }
    }
  }

  private async reconcileOnce(
    tabId: string,
    mode: 'before-raster' | 'full',
    wasUnresolved: boolean,
  ): Promise<'cleaned' | 'none'> {
    try {
      await this.options.orchestrator.fenceProjectGeneration(tabId)
      // An already-admitted Add may still be writing its intent. Read only after it leaves the
      // shared gate; all new Main Add handlers reconcile through this dispatcher first.
      await this.options.gate.drain(tabId)
      const documentId = this.options.documents.getOpenDocumentId(tabId)
      if (!documentId) {
        throw new ProjectGenerationAcceptanceRecoveryError(
          'Open the Project before recovering accepted results.',
        )
      }
      const kind = await this.options.readKind(tabId, documentId)
      if (this.options.documents.getOpenDocumentId(tabId) !== documentId) {
        throw new ProjectGenerationAcceptanceRecoveryError(
          'The Project document changed while its acceptance intent was inspected.',
        )
      }
      let rasterPending = this.options.raster.hasPendingHandoff(tabId)
      let smartPending = this.options.smartPatch.hasPendingHandoff(tabId)
      const smartOverlap =
        kind === null && !smartPending
          ? await this.options.smartPatch.hasUnjournaledOverlap(tabId)
          : false
      if (this.options.documents.getOpenDocumentId(tabId) !== documentId) {
        throw new ProjectGenerationAcceptanceRecoveryError(
          'The Project changed during temporary-result inspection.',
        )
      }
      rasterPending = this.options.raster.hasPendingHandoff(tabId)
      smartPending = this.options.smartPatch.hasPendingHandoff(tabId)
      if (
        (rasterPending && (smartPending || smartOverlap || kind === 'smart-patch-variants')) ||
        (smartPending && kind === 'raster')
      ) {
        throw new ProjectGenerationAcceptanceRecoveryError(
          'Conflicting acceptance owners require recovery. Temporary results were preserved.',
        )
      }
      if (
        mode === 'before-raster' &&
        !wasUnresolved &&
        kind !== 'smart-patch-variants' &&
        !smartPending &&
        !smartOverlap
      ) {
        // A prior Raster intent must reach Raster.accept's own selection check. An existing
        // owner's Set-based fence is not ours to release, even when no SQL write was confirmed.
        if (!rasterPending) {
          this.options.orchestrator.releaseProjectGenerationFence(tabId)
        }
        this.unresolved.delete(tabId)
        return 'none'
      }
      const owner =
        kind === 'smart-patch-variants' || smartPending || smartOverlap
          ? this.options.smartPatch
          : this.options.raster
      const result = await owner.reconcile(tabId)
      if (
        this.options.documents.getOpenDocumentId(tabId) !== documentId ||
        this.options.raster.hasPendingHandoff(tabId) ||
        this.options.smartPatch.hasPendingHandoff(tabId)
      ) {
        throw new ProjectGenerationAcceptanceRecoveryError(
          'Accepted-result recovery is still pending. Temporary results were preserved.',
        )
      }
      this.unresolved.delete(tabId)
      return result
    } catch (error) {
      // A delegate may have released its own Set-based fence in finally. Classification and
      // owner failures must remain fenced until a later successful, explicitly routed retry.
      await this.options.orchestrator.fenceProjectGeneration(tabId).catch(() => undefined)
      throw error
    }
  }

  private async run(tabId: string, mode: 'before-raster' | 'full'): Promise<'cleaned' | 'none'> {
    if (!/^project-v1-[a-f0-9]{64}$/.test(tabId)) {
      throw new ProjectGenerationAcceptanceRecoveryError(
        'The Project recovery identity is invalid.',
      )
    }
    const existing = this.inFlight.get(tabId)
    if (existing) {
      const result = await existing.operation
      // Full open/recovery must not be satisfied by a narrow Add check that skipped Raster
      // reconciliation. Run that remaining work after the earlier operation leaves its marker.
      if (
        (mode === 'full' && existing.mode !== 'full') ||
        existing.mode === 'raster-add' ||
        existing.mode === 'smart-add'
      ) {
        const full = await this.run(tabId, mode)
        return result === 'cleaned' || full === 'cleaned' ? 'cleaned' : 'none'
      }
      return result
    }
    const wasUnresolved = this.unresolved.has(tabId)
    this.unresolved.add(tabId)
    const operation = this.reconcileOnce(tabId, mode, wasUnresolved).finally(() => {
      if (this.inFlight.get(tabId)?.operation === operation) {
        this.inFlight.delete(tabId)
      }
    })
    this.inFlight.set(tabId, { mode, operation })
    return await operation
  }
}
