export const MODEL_MANAGER_READ_KINDS = [
  'catalog',
  'jobs',
  'refresh',
  'removal',
  'storage',
  'token',
] as const
export type ModelManagerRead = (typeof MODEL_MANAGER_READ_KINDS)[number]

/** Presentation reads only; invalidation never cancels an installation or another Main command. */
export class ModelManagerReadGuard {
  private disposed = false
  private epoch = 0
  private readonly requests = new Map<ModelManagerRead, number>()

  constructor(private readonly isVisible: () => boolean) {}

  begin(kind: ModelManagerRead): () => boolean {
    const epoch = this.epoch
    const request = (this.requests.get(kind) ?? 0) + 1
    this.requests.set(kind, request)
    return () =>
      !this.disposed &&
      this.isVisible() &&
      this.epoch === epoch &&
      this.requests.get(kind) === request
  }

  dispose(): void {
    this.disposed = true
    this.invalidateAll()
  }

  invalidate(kind: ModelManagerRead): void {
    this.requests.set(kind, (this.requests.get(kind) ?? 0) + 1)
  }

  invalidateAll(): void {
    this.epoch += 1
  }
}
