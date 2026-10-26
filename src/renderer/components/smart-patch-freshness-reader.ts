import type { ProjectSmartPatchVariantsInspection } from '../../shared/api.js'

export interface SmartPatchFreshnessRequest {
  documentId: string
  documentRevision: string
  layerId: string
  tabId: string
  variantIds: readonly string[]
}

export interface SmartPatchFreshnessState {
  error: string | null
  inspection: ProjectSmartPatchVariantsInspection | null
  loading: boolean
  owner: SmartPatchFreshnessRequest | null
}

interface PendingRead {
  generation: number
  owner: SmartPatchFreshnessRequest
}

/** Serialized, read-only diagnostics; every change, including refresh, replaces the prior owner. */
export class SmartPatchFreshnessReader {
  private disposed = false
  private generation = 0
  private readonly onState: (state: SmartPatchFreshnessState) => void
  private pending: PendingRead | null = null
  private readonly read: (
    owner: SmartPatchFreshnessRequest,
  ) => Promise<ProjectSmartPatchVariantsInspection>
  private running = false

  constructor(options: {
    /**
     * Receives independent snapshots. The callback may change/dispose the reader; it must not
     * throw.
     */
    onState: (state: SmartPatchFreshnessState) => void
    read: (owner: SmartPatchFreshnessRequest) => Promise<ProjectSmartPatchVariantsInspection>
  }) {
    this.read = options.read
    this.onState = options.onState
  }

  change(owner: SmartPatchFreshnessRequest | null): void {
    if (this.disposed) {
      return
    }
    const generation = ++this.generation
    const request = owner ? { generation, owner: captureOwner(owner) } : null
    this.pending = request
    try {
      this.publish({
        error: null,
        inspection: null,
        loading: request !== null,
        owner: request?.owner ?? null,
      })
    } finally {
      // The callback may have replaced or cleared pending work synchronously.
      this.pump()
    }
  }

  dispose(): void {
    this.disposed = true
    this.generation += 1
    this.pending = null
  }

  private current(request: PendingRead): boolean {
    return !this.disposed && request.generation === this.generation
  }

  private publish(state: SmartPatchFreshnessState): void {
    if (!this.disposed) {
      this.onState({
        ...state,
        inspection: state.inspection ? structuredClone(state.inspection) : null,
        owner: state.owner ? captureOwner(state.owner) : null,
      })
    }
  }

  private pump(): void {
    if (this.disposed || this.running || !this.pending) {
      return
    }
    const request = this.pending
    this.pending = null
    this.running = true
    void this.run(request)
  }

  private async run(request: PendingRead): Promise<void> {
    try {
      let inspection: ProjectSmartPatchVariantsInspection | null = null
      let error: string | null = null
      try {
        const response = await this.read(captureOwner(request.owner))
        if (!this.current(request)) {
          return
        }
        if (!matchesOwner(request.owner, response)) {
          throw new Error(
            'The Project changed while variant diagnostics were being read. Refresh to retry.',
          )
        }
        inspection = response
      } catch (cause) {
        if (!this.current(request)) {
          return
        }
        error = cause instanceof Error ? cause.message : 'Variant diagnostics could not be read.'
      }
      // Keep consumer callbacks outside the read-error boundary.
      if (this.current(request)) {
        this.publish({ error, inspection, loading: false, owner: request.owner })
      }
    } finally {
      this.running = false
      this.pump()
    }
  }
}

function captureOwner(owner: SmartPatchFreshnessRequest): SmartPatchFreshnessRequest {
  return {
    documentId: owner.documentId,
    documentRevision: owner.documentRevision,
    layerId: owner.layerId,
    tabId: owner.tabId,
    variantIds: [...owner.variantIds],
  }
}

function matchesOwner(
  owner: SmartPatchFreshnessRequest,
  inspection: ProjectSmartPatchVariantsInspection,
): boolean {
  const expectedIds = new Set(owner.variantIds)
  const actualIds = new Set(inspection.variants.map(({ id }) => id))
  return (
    inspection.documentId === owner.documentId &&
    inspection.documentRevision === owner.documentRevision &&
    inspection.layerId === owner.layerId &&
    expectedIds.size === owner.variantIds.length &&
    actualIds.size === inspection.variants.length &&
    actualIds.size === expectedIds.size &&
    [...actualIds].every((id) => expectedIds.has(id))
  )
}
