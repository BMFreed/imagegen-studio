import type { ProjectGenerationDraftChange, ProjectTab } from '../../shared/api.js'
import { getEffectiveDynamicPromptSettings } from '../../shared/projects/generation-dynamic-settings.js'
import { reconcilePromptEmbeddings } from '../../shared/projects/prompt-embeddings.js'

export interface ProjectDraftSyncOptions {
  onAcknowledged: (tab: ProjectTab) => void
  onError: (tabId: string, error: Error) => void
  onOverlay: (tabId: string, draft: GenerationDraft | null, targetLayerId?: string) => void
  seal?: (tabId: string, historyGroupId?: string, targetLayerId?: string) => Promise<ProjectTab>
  send: (
    tabId: string,
    change: ProjectGenerationDraftChange,
    historyGroupId?: string,
    targetLayerId?: string,
  ) => Promise<ProjectTab>
}
type GenerationDraft = ProjectTab['generationDraft']

type DraftOperation =
  | { change: ProjectGenerationDraftChange; historyGroupId?: string; key: string; kind: 'change' }
  | { historyGroupId?: string; kind: 'seal' }

interface DraftState {
  desired: GenerationDraft
  disposed: boolean
  error: Error | null
  ownerKey: string
  pending: DraftOperation[]
  running: Promise<void> | null
  tabId: string
  targetLayerId?: string
}

/** Keeps local typing visible while serializing incremental draft IPC for one Project. */
export class ProjectDraftSync {
  private readonly states = new Map<string, DraftState>()

  constructor(private readonly options: ProjectDraftSyncOptions) {}

  change(
    tab: ProjectTab,
    change: ProjectGenerationDraftChange,
    historyGroupId?: string,
    targetLayerId?: string,
  ): void {
    const ownerKey = draftOwnerKey(tab.id, targetLayerId)
    if (change.kind === 'dynamic-prompt') {
      change = { kind: change.kind, value: { ...change.value } }
    } else if (isEmbeddingChoice(change)) {
      change = { ...change, embeddingSelection: { ...change.embeddingSelection } }
    }
    let state = this.states.get(ownerKey)
    if (!state) {
      state = {
        desired: structuredClone(tab.generationDraft),
        disposed: false,
        error: null,
        ownerKey,
        pending: [],
        running: null,
        tabId: tab.id,
        targetLayerId,
      }
      this.states.set(ownerKey, state)
    }
    if (!applyChange(state.desired, change)) {
      if (state.pending.length === 0 && !state.running) {
        this.states.delete(ownerKey)
      }
      return
    }
    state.error = null
    const key = changeKey(change)
    const previous = state.pending.at(-1)
    if (
      previous?.kind === 'change' &&
      previous.key === key &&
      previous.historyGroupId === historyGroupId &&
      !isEmbeddingChoice(previous.change) &&
      !isEmbeddingChoice(change)
    ) {
      // Only adjacent updates commute. Moving an edit before an intervening
      // setting change or history seal would change the resulting Undo order.
      previous.change = change
    } else {
      state.pending.push({ change, historyGroupId, key, kind: 'change' })
    }
    this.options.onOverlay(tab.id, structuredClone(state.desired), state.targetLayerId)
    this.start(state)
  }

  async flush(tabId: string): Promise<void> {
    const keys = [...this.states.values()]
      .filter((state) => state.tabId === tabId)
      .map((state) => state.ownerKey)
    const results = await Promise.allSettled(keys.map((key) => this.flushOwner(key)))
    const failure = results.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected') {
      throw failure.reason
    }
  }

  async flushAll(): Promise<void> {
    const results = await Promise.allSettled(
      [...new Set([...this.states.values()].map((state) => state.tabId))].map((tabId) =>
        this.flush(tabId),
      ),
    )
    const failure = results.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected') {
      throw failure.reason
    }
  }

  forget(tabId: string): void {
    for (const [ownerKey, state] of this.states) {
      if (state.tabId !== tabId) {
        continue
      }
      state.disposed = true
      this.states.delete(ownerKey)
      this.options.onOverlay(tabId, null, state.targetLayerId)
    }
    this.options.onOverlay(tabId, null)
  }

  /** Serializes blur's history boundary after all preceding incremental edits. */
  sealPromptHistory(tab: ProjectTab, historyGroupId?: string, targetLayerId?: string): void {
    const ownerKey = draftOwnerKey(tab.id, targetLayerId)
    if (!this.options.seal) {
      return
    }
    let state = this.states.get(ownerKey)
    if (!state) {
      state = {
        desired: structuredClone(tab.generationDraft),
        disposed: false,
        error: null,
        ownerKey,
        pending: [],
        running: null,
        tabId: tab.id,
        targetLayerId,
      }
      this.states.set(ownerKey, state)
    }
    state.error = null
    state.pending.push({ historyGroupId, kind: 'seal' })
    this.start(state)
  }

  private async flushOwner(ownerKey: string): Promise<void> {
    while (true) {
      const state = this.states.get(ownerKey)
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
      if (this.states.get(ownerKey) !== state) {
        continue
      }
      if (state.pending.length === 0) {
        return
      }
    }
  }

  private async run(state: DraftState): Promise<void> {
    while (state.pending.length > 0 && !state.disposed) {
      const operation = state.pending.shift()
      if (!operation) {
        break
      }
      try {
        const tab =
          operation.kind === 'change'
            ? await this.options.send(
                state.tabId,
                operation.change,
                operation.historyGroupId,
                state.targetLayerId,
              )
            : await this.options.seal?.(state.tabId, operation.historyGroupId, state.targetLayerId)
        if (state.disposed) {
          return
        }
        if (tab) {
          this.options.onAcknowledged(tab)
        }
      } catch (cause) {
        if (state.disposed) {
          return
        }
        state.pending.unshift(operation)
        state.error = cause instanceof Error ? cause : new Error('The draft could not be updated.')
        this.options.onError(state.tabId, state.error)
        return
      }
    }
    if (!state.disposed && state.pending.length === 0) {
      this.states.delete(state.ownerKey)
      this.options.onOverlay(state.tabId, null, state.targetLayerId)
    }
  }

  private start(state: DraftState): void {
    if (state.running || state.pending.length === 0 || state.disposed) {
      return
    }
    const running = this.run(state)
    state.running = running
    void running.finally(() => {
      if (state.running === running) {
        state.running = null
        if (!state.error && state.pending.length > 0) {
          this.start(state)
        }
      }
    })
  }
}

export function draftOwnerKey(tabId: string, targetLayerId?: string): string {
  return targetLayerId === undefined ? tabId : `${tabId}:patch:${targetLayerId}`
}

function applyChange(draft: GenerationDraft, change: ProjectGenerationDraftChange): boolean {
  if (change.kind === 'anima-method') {
    if (draft.sampling.animaMethod === (change.value ?? undefined)) {
      return false
    }
    if (change.value === null) {
      delete draft.sampling.animaMethod
    } else {
      draft.sampling.animaMethod = change.value
    }
    return true
  }
  if (change.kind === 'vae-precision') {
    if (draft.vaePrecision === (change.value ?? undefined)) {
      return false
    }
    if (change.value === null) {
      delete draft.vaePrecision
    } else {
      draft.vaePrecision = change.value
    }
    return true
  }
  if (change.kind === 'denoising-strength') {
    if (draft.sampling.denoisingStrength === change.value) {
      return false
    }
    draft.sampling.denoisingStrength = change.value
    return true
  }
  if (change.kind === 'cfg-rescale') {
    if (draft.cfgRescale === (change.value ?? undefined)) {
      return false
    }
    if (change.value === null) {
      delete draft.cfgRescale
    } else {
      draft.cfgRescale = change.value
    }
    return true
  }
  if (change.kind === 'dynamic-prompt') {
    const before = getEffectiveDynamicPromptSettings(draft.dynamicPrompt)
    if (
      before.maxPrompts === change.value.maxPrompts &&
      before.seedBehavior === change.value.seedBehavior
    ) {
      return false
    }
    draft.dynamicPrompt = { ...change.value }
    return true
  }
  if (change.kind === 'lora-enabled' || change.kind === 'lora-weight') {
    const lora = draft.loras.find(
      (entry) =>
        entry.resource.localModelId === change.resourceId &&
        entry.resource.localVersionId === change.versionId,
    )
    if (!lora) {
      return false
    }
    if (change.kind === 'lora-enabled') {
      if (lora.enabled === change.value) {
        return false
      }
      lora.enabled = change.value
    } else {
      if (lora.weight === change.value) {
        return false
      }
      lora.weight = change.value
    }
    return true
  }
  if (change.kind === 'positive-prompt') {
    if (draft.positivePrompt.text === change.text && !change.embeddingSelection) {
      return false
    }
    draft.positivePrompt = reconcilePromptEmbeddings(
      { ...draft.positivePrompt, text: change.text },
      [],
    )
    return true
  }
  if (change.kind === 'negative-prompt') {
    if (draft.negativePrompt.text === change.text && !change.embeddingSelection) {
      return false
    }
    draft.negativePrompt = reconcilePromptEmbeddings(
      { ...draft.negativePrompt, text: change.text },
      [],
    )
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
  if (change.kind === 'sampling-pair') {
    if (
      draft.sampling.sampler === change.sampler &&
      draft.sampling.scheduler === change.scheduler
    ) {
      return false
    }
    draft.sampling.sampler = change.sampler
    draft.sampling.scheduler = change.scheduler
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

function isEmbeddingChoice(change: ProjectGenerationDraftChange): change is Extract<
  ProjectGenerationDraftChange,
  { kind: 'negative-prompt' | 'positive-prompt' }
> & {
  embeddingSelection: NonNullable<
    Extract<
      ProjectGenerationDraftChange,
      { kind: 'negative-prompt' | 'positive-prompt' }
    >['embeddingSelection']
  >
} {
  return (
    (change.kind === 'positive-prompt' || change.kind === 'negative-prompt') &&
    change.embeddingSelection !== undefined
  )
}

function changeKey(change: ProjectGenerationDraftChange): string {
  return change.kind === 'lora-enabled' || change.kind === 'lora-weight'
    ? JSON.stringify([change.kind, change.resourceId, change.versionId])
    : change.kind
}
