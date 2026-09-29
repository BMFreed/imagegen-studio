/**
 * Serializes operations that can consume a Project's generation staging. The same instance must
 * guard acceptance and Project close; a per-repository lock alone cannot protect their handoff.
 */
export class ProjectGenerationOperationGate {
  private readonly pending = new Map<string, Promise<void>>()

  /** Wait for operations already admitted on this Project, without reserving a new operation. */
  async drain(tabId: string): Promise<void> {
    await this.pending.get(tabId)
  }

  async run<T>(tabId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(tabId)
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    this.pending.set(tabId, current)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.pending.get(tabId) === current) {
        this.pending.delete(tabId)
      }
    }
  }
}
