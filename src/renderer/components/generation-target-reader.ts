import {
  hashGenerationTargetSignature,
  type ProjectGenerationTargetState,
} from '../../shared/projects/project-generation-target-state.js'

type Request = { documentId: string; projectKey: string; signature: string }
export class GenerationTargetReader {
  private current = 0
  private disposed = false
  private pending: (Request & { revision: number }) | null = null
  private running = false
  constructor(
    private readonly options: {
      onState: (state: ProjectGenerationTargetState | null, error: string | null) => void
      read: (
        projectKey: string,
        documentId: string,
        targetKey: string,
      ) => Promise<ProjectGenerationTargetState>
    },
  ) {}
  change(request: Request | null) {
    const revision = ++this.current
    this.pending = request ? { ...request, revision } : null
    this.options.onState(null, request ? null : 'The generation area inputs are unavailable.')
    if (!this.running) {
      void this.drain()
    }
  }
  dispose() {
    this.disposed = true
    this.current += 1
    this.pending = null
  }
  private async drain() {
    this.running = true
    try {
      while (this.pending && !this.disposed) {
        const request = this.pending
        this.pending = null
        try {
          const targetKey = await hashGenerationTargetSignature(request.signature)
          if (request.revision !== this.current || this.disposed) {
            continue
          }
          const state = await this.options.read(request.projectKey, request.documentId, targetKey)
          if (request.revision !== this.current || this.disposed) {
            continue
          }
          if (state.documentId !== request.documentId || state.targetKey !== targetKey) {
            throw new Error('The generation area response belongs to different inputs.')
          }
          this.options.onState(state, null)
        } catch (error) {
          if (request.revision === this.current && !this.disposed) {
            this.options.onState(
              null,
              error instanceof Error
                ? error.message
                : 'The generation area pixels are unavailable.',
            )
          }
        }
      }
    } finally {
      this.running = false
    }
  }
}
