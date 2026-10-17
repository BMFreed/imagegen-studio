import type { GenerationProgressSnapshot } from '../../shared/projects/generation-progress.js'
import { isGenerationProgressSnapshot } from '../../shared/projects/generation-progress.js'

import { isDeepStrictEqual } from 'node:util'

export interface GenerationProgressInput {
  getProgressSnapshot: () => GenerationProgressSnapshot
  onProgress: (listener: (snapshot: GenerationProgressSnapshot) => void) => () => void
}

/** App-lifetime telemetry owner across typed processors, with independent global revisions. */
export class GenerationProgressSource {
  private disposed = false
  private readonly inputs: {
    current: GenerationProgressSnapshot['current']
    order: number
    revision: number
  }[] = []
  private readonly listeners = new Set<(snapshot: GenerationProgressSnapshot) => void>()
  private order = 0
  private progress: GenerationProgressSnapshot = { current: null, revision: 0 }
  private readonly unsubscribe: (() => void)[] = []

  constructor(sources: readonly GenerationProgressInput[]) {
    for (const source of sources) {
      const state = { current: null, order: 0, revision: -1 }
      this.inputs.push(state)
      this.unsubscribe.push(source.onProgress((snapshot) => this.receive(state, snapshot)))
      this.receive(state, source.getProgressSnapshot())
    }
  }

  dispose(): void {
    this.disposed = true
    for (const unsubscribe of this.unsubscribe.splice(0)) {
      unsubscribe()
    }
    this.listeners.clear()
  }

  getProgressSnapshot(): GenerationProgressSnapshot {
    return structuredClone(this.progress)
  }

  onProgress(listener: (snapshot: GenerationProgressSnapshot) => void): () => void {
    if (this.disposed) {
      return () => undefined
    }
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private receive(state: (typeof this.inputs)[number], snapshot: GenerationProgressSnapshot): void {
    if (
      this.disposed ||
      !isGenerationProgressSnapshot(snapshot) ||
      snapshot.revision <= state.revision
    ) {
      return
    }
    state.revision = snapshot.revision
    state.current = structuredClone(snapshot.current)
    if (state.current) {
      state.order = ++this.order
    }
    const current =
      this.inputs
        .filter((input) => input.current)
        .reduce<(typeof this.inputs)[number] | null>(
          (latest, input) => (!latest || input.order > latest.order ? input : latest),
          null,
        )?.current ?? null
    if (isDeepStrictEqual(current, this.progress.current)) {
      return
    }
    this.progress = { current: structuredClone(current), revision: this.progress.revision + 1 }
    for (const listener of this.listeners) {
      try {
        listener(this.getProgressSnapshot())
      } catch {
        /* UI listeners neither own source telemetry nor other listeners' snapshots. */
      }
    }
  }
}
