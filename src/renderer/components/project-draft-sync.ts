import type { ProjectGenerationDraftChange, ProjectTab } from '../../shared/api.js'

export interface ProjectDraftSyncOptions {
  onAcknowledged: (tab: ProjectTab) => void
  onError: (tabId: string, error: Error) => void
  onOverlay: (tabId: string, draft: GenerationDraft | null) => void
  send: (tabId: string, change: ProjectGenerationDraftChange) => Promise<ProjectTab>
}
type GenerationDraft = ProjectTab['generationDraft']

type DraftField = ProjectGenerationDraftChange['kind']

interface DraftState {
  desired: GenerationDraft
  disposed: boolean
  error: Error | null
  pending: Set<DraftField>
  running: Promise<void> | null
  tabId: string
}

/** Keeps local typing visible while serializing incremental draft IPC for one Project. */
export class ProjectDraftSync {
  private readonly states = new Map<string, DraftState>()

  constructor(private readonly options: ProjectDraftSyncOptions) {}

  change(tab: ProjectTab, change: ProjectGenerationDraftChange): void {
    let state = this.states.get(tab.id)
    if (!state) {
      state = {
        desired: structuredClone(tab.generationDraft),
        disposed: false,
        error: null,
        pending: new Set(),
        running: null,
        tabId: tab.id,
      }
      this.states.set(tab.id, state)
    }
    if (!applyChange(state.desired, change)) {
      if (state.pending.size === 0 && !state.running) {
        this.states.delete(tab.id)
      }
      return
    }
    state.error = null
    state.pending.add(change.kind)
    this.options.onOverlay(tab.id, structuredClone(state.desired))
    this.start(state)
  }

  async flush(tabId: string): Promise<void> {
    while (true) {
      const state = this.states.get(tabId)
      if (!state || state.disposed) {
        return
      }
      if (state.error) {
        state.error = null
      }
      this.start(state)
      const running = state.running
      if (!running) {
        return
      }
      await running
      if (state.error) {
        throw state.error
      }
      if (this.states.get(tabId) !== state) {
        continue
      }
      if (state.pending.size === 0) {
        return
      }
    }
  }

  async flushAll(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.states.keys()].map((tabId) => this.flush(tabId)),
    )
    const failure = results.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected') {
      throw failure.reason
    }
  }

  forget(tabId: string): void {
    const state = this.states.get(tabId)
    if (state) {
      state.disposed = true
      this.states.delete(tabId)
    }
    this.options.onOverlay(tabId, null)
  }

  private async run(state: DraftState): Promise<void> {
    while (state.pending.size > 0 && !state.disposed) {
      const field = state.pending.values().next().value
      if (!field) {
        break
      }
      const change = changeForField(field, state.desired)
      state.pending.delete(field)
      try {
        const tab = await this.options.send(state.tabId, change)
        if (state.disposed) {
          return
        }
        this.options.onAcknowledged(tab)
      } catch (cause) {
        if (state.disposed) {
          return
        }
        state.pending.add(field)
        state.error = cause instanceof Error ? cause : new Error('The draft could not be updated.')
        this.options.onError(state.tabId, state.error)
        return
      }
    }
    if (!state.disposed && state.pending.size === 0) {
      this.states.delete(state.tabId)
      this.options.onOverlay(state.tabId, null)
    }
  }

  private start(state: DraftState): void {
    if (state.running || state.pending.size === 0 || state.disposed) {
      return
    }
    const running = this.run(state)
    state.running = running
    void running.finally(() => {
      if (state.running === running) {
        state.running = null
        if (!state.error && state.pending.size > 0) {
          this.start(state)
        }
      }
    })
  }
}

function applyChange(draft: GenerationDraft, change: ProjectGenerationDraftChange): boolean {
  if (change.kind === 'positive-prompt') {
    if (draft.positivePrompt.text === change.text) {
      return false
    }
    draft.positivePrompt.text = change.text
    return true
  }
  if (change.kind === 'negative-prompt') {
    if (draft.negativePrompt.text === change.text) {
      return false
    }
    draft.negativePrompt.text = change.text
    return true
  }
  if (change.kind === 'seed') {
    if (draft.seed.policy === change.policy && draft.seed.value === change.value) {
      return false
    }
    draft.seed = { policy: change.policy, value: change.value }
    return true
  }
  if (change.kind === 'sampling-steps') {
    if (draft.sampling.steps === change.value) {
      return false
    }
    draft.sampling.steps = change.value
    return true
  }
  if (change.kind === 'sampling-cfg-scale') {
    if (draft.sampling.cfgScale === change.value) {
      return false
    }
    draft.sampling.cfgScale = change.value
    return true
  }
  return false
}

function changeForField(field: DraftField, draft: GenerationDraft): ProjectGenerationDraftChange {
  if (field === 'positive-prompt') {
    return { kind: field, text: draft.positivePrompt.text }
  }
  if (field === 'negative-prompt') {
    return { kind: field, text: draft.negativePrompt.text }
  }
  if (field === 'sampling-steps') {
    return { kind: field, value: draft.sampling.steps }
  }
  if (field === 'sampling-cfg-scale') {
    return { kind: field, value: draft.sampling.cfgScale }
  }
  const seed = draft.seed
  return seed.policy === 'fixed'
    ? { kind: 'seed', policy: 'fixed', value: seed.value ?? 0 }
    : { kind: 'seed', policy: seed.policy, value: null }
}
