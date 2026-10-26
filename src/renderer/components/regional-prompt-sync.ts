import type { ProjectTab } from '../../shared/api.js'
import type { IgsRegionalGuidanceV1 } from '../../shared/projects/project-schema.js'
import {
  promptEmbeddingLiteralRanges,
  reconcilePromptEmbeddings,
} from '../../shared/projects/prompt-embeddings.js'
import type {
  ProjectRegionalGuidanceOwner,
  ProjectRegionalGuidancePromptChange,
} from '../../shared/projects/regional-guidance.js'

export interface RegionalPromptSyncOptions {
  current: (tabId: string) => ProjectTab | undefined
  onAcknowledged: (tab: ProjectTab) => void
  onError: (tabId: string, error: Error | null) => void
  onOverlay: (tabId: string, overlay: RegionalOverlay | null) => void
  seal: (tabId: string, groupId: string) => Promise<ProjectTab>
  send: (
    tabId: string,
    owner: ProjectRegionalGuidanceOwner,
    change: ProjectRegionalGuidancePromptChange,
  ) => Promise<ProjectTab>
}
type RegionalOverlay = Record<string, IgsRegionalGuidanceV1>

type Operation =
  | { change: ProjectRegionalGuidancePromptChange; kind: 'change'; regionId: string }
  | { groupId: string; kind: 'seal'; regionId: string }

interface Stream {
  disposed: boolean
  documentId: string
  error: Error | null
  expectedRevision: string
  failedOperation: Operation | null
  invalidated: boolean
  knownRevisions: Set<string>
  pending: Operation[]
  regions: IgsRegionalGuidanceV1[]
  running: Promise<void> | null
  sending: Operation | null
  tabId: string
}

/** One regional stream per document; only its own acknowledgements advance its revision. */
export class RegionalPromptSync {
  private readonly streams = new Map<string, Stream>()

  constructor(private readonly options: RegionalPromptSyncOptions) {}

  change(
    tab: ProjectTab,
    owner: ProjectRegionalGuidanceOwner,
    change: ProjectRegionalGuidancePromptChange,
  ): void {
    const stream = this.capture(tab, owner)
    if (!stream) {
      return
    }
    const captured = structuredClone(change)
    supersedeRefusedText(stream, { change: captured, kind: 'change', regionId: owner.regionId })
    const previous = stream.pending.at(-1)
    if (
      previous?.kind === 'change' &&
      previous !== stream.sending &&
      previous.regionId === owner.regionId &&
      previous.change.kind === 'text' &&
      captured.kind === 'text' &&
      previous.change.polarity === captured.polarity &&
      previous.change.historyGroupId === captured.historyGroupId &&
      !previous.change.embeddingSelection &&
      !captured.embeddingSelection
    ) {
      previous.change = captured
    } else {
      stream.pending.push({ change: captured, kind: 'change', regionId: owner.regionId })
    }
    if (!stream.invalidated) {
      stream.error = null
      this.options.onError(tab.id, null)
    }
    this.publishOverlay(stream)
    this.start(stream)
  }

  /** Drops only unpublished local operations; acknowledged document changes stay intact. */
  discard(tabId: string): void {
    const stream = this.streams.get(tabId)
    if (stream?.running) {
      throw new Error('Wait for the regional update to finish before discarding pending edits.')
    }
    this.forget(tabId)
    this.options.onError(tabId, null)
  }

  async flush(tabId: string): Promise<void> {
    while (true) {
      const stream = this.streams.get(tabId)
      if (!stream || stream.disposed) {
        return
      }
      if (stream.invalidated) {
        throw stream.error ?? changedProject()
      }
      for (const candidate of stream.pending.slice(1)) {
        if (supersedeRefusedText(stream, candidate)) {
          break
        }
      }
      stream.error = null
      this.start(stream)
      const running = stream.running
      if (!running) {
        return
      }
      await running
      if (stream.error) {
        throw stream.error
      }
    }
  }

  async flushAll(): Promise<void> {
    for (const tabId of this.streams.keys()) {
      await this.flush(tabId)
    }
  }

  forget(tabId: string): void {
    const stream = this.streams.get(tabId)
    if (stream) {
      stream.disposed = true
      this.streams.delete(tabId)
    }
    this.options.onOverlay(tabId, null)
  }

  hasPending(tabId: string): boolean {
    return this.streams.has(tabId)
  }

  /** Called for every externally adopted tab, including observed edit/Undo roundtrips. */
  observe(tab: ProjectTab): void {
    const stream = this.streams.get(tab.id)
    if (stream && !this.matches(stream, tab)) {
      this.conflict(stream)
    }
  }

  seal(tab: ProjectTab, owner: ProjectRegionalGuidanceOwner, groupId: string): void {
    const stream = this.capture(tab, owner)
    if (!stream) {
      return
    }
    stream.pending.push({ groupId, kind: 'seal', regionId: owner.regionId })
    this.publishOverlay(stream)
    this.start(stream)
  }

  private capture(tab: ProjectTab, owner: ProjectRegionalGuidanceOwner): Stream | null {
    let stream = this.streams.get(tab.id)
    if (
      tab.documentId !== owner.documentId ||
      !tab.regionalGuidance?.some((region) => region.id === owner.regionId) ||
      (!stream && tab.documentRevision !== owner.documentRevision) ||
      (stream &&
        (stream.documentId !== owner.documentId ||
          !stream.knownRevisions.has(owner.documentRevision)))
    ) {
      this.options.onError(tab.id, changedProject())
      return null
    }
    if (!stream) {
      stream = {
        disposed: false,
        documentId: tab.documentId,
        error: null,
        expectedRevision: tab.documentRevision,
        failedOperation: null,
        invalidated: false,
        knownRevisions: new Set([tab.documentRevision]),
        pending: [],
        regions: structuredClone(tab.regionalGuidance ?? []),
        running: null,
        sending: null,
        tabId: tab.id,
      }
      this.streams.set(tab.id, stream)
    }
    return stream
  }

  private conflict(stream: Stream): void {
    stream.invalidated = true
    stream.error = changedProject()
    this.options.onError(stream.tabId, stream.error)
  }

  private matches(stream: Stream, tab: ProjectTab | undefined): boolean {
    return Boolean(
      tab &&
      tab.documentId === stream.documentId &&
      tab.documentRevision === stream.expectedRevision &&
      JSON.stringify(tab.regionalGuidance ?? []) === JSON.stringify(stream.regions),
    )
  }

  private publishOverlay(stream: Stream): void {
    const regions = structuredClone(stream.regions)
    for (const operation of stream.pending) {
      if (operation.kind !== 'change') {
        continue
      }
      const region = regions.find((value) => value.id === operation.regionId)
      if (region) {
        applyOptimisticChange(region, operation.change)
      }
    }
    const changed = new Set(stream.pending.map((operation) => operation.regionId))
    this.options.onOverlay(
      stream.tabId,
      Object.fromEntries(regions.filter((region) => changed.has(region.id)).map((r) => [r.id, r])),
    )
  }

  private async run(stream: Stream): Promise<void> {
    while (stream.pending.length > 0 && !stream.disposed && !stream.invalidated) {
      const operation = stream.pending[0]!
      if (!this.matches(stream, this.options.current(stream.tabId))) {
        this.conflict(stream)
        return
      }
      stream.sending = operation
      try {
        const tab =
          operation.kind === 'seal'
            ? await this.options.seal(stream.tabId, operation.groupId)
            : await this.options.send(
                stream.tabId,
                {
                  documentId: stream.documentId,
                  documentRevision: stream.expectedRevision,
                  regionId: operation.regionId,
                },
                structuredClone(operation.change),
              )
        if (stream.disposed) {
          return
        }
        if (
          stream.invalidated ||
          !this.matches(stream, this.options.current(stream.tabId)) ||
          tab.id !== stream.tabId ||
          tab.documentId !== stream.documentId ||
          !tab.regionalGuidance?.some((region) => region.id === operation.regionId)
        ) {
          this.conflict(stream)
          return
        }
        stream.expectedRevision = tab.documentRevision
        stream.knownRevisions.add(tab.documentRevision)
        stream.regions = structuredClone(tab.regionalGuidance)
        stream.pending.shift()
        stream.failedOperation = null
        stream.sending = null
        this.options.onAcknowledged(tab)
        this.publishOverlay(stream)
      } catch (cause) {
        if (!stream.disposed) {
          stream.failedOperation = operation
          stream.error =
            cause instanceof Error
              ? cause
              : new Error('Regional prompt settings could not be saved.')
          this.options.onError(stream.tabId, stream.error)
        }
        return
      } finally {
        stream.sending = null
      }
    }
    if (!stream.disposed && !stream.invalidated && stream.pending.length === 0) {
      this.streams.delete(stream.tabId)
      this.options.onOverlay(stream.tabId, null)
      this.options.onError(stream.tabId, null)
    }
  }

  private start(stream: Stream): void {
    if (stream.running || stream.disposed || stream.invalidated || stream.pending.length === 0) {
      return
    }
    const running = this.run(stream)
    stream.running = running
    void running.finally(() => {
      if (stream.running === running) {
        stream.running = null
        if (!stream.error && !stream.disposed && stream.pending.length > 0) {
          this.start(stream)
        }
      }
    })
  }
}

function supersedeRefusedText(stream: Stream, candidate: Operation): boolean {
  const refused = stream.failedOperation
  if (
    stream.invalidated ||
    refused?.kind !== 'change' ||
    refused.change.kind !== 'text' ||
    candidate.kind !== 'change' ||
    candidate.regionId !== refused.regionId ||
    candidate.change.kind === 'negative-source' ||
    candidate.change.polarity !== refused.change.polarity ||
    stream.pending[0] !== refused ||
    stream.sending === refused
  ) {
    return false
  }
  const change = candidate.change
  const refusedText = refused.change
  const queuedRemoval = stream.pending.find(
    (operation) =>
      operation.kind === 'change' &&
      operation.regionId === refused.regionId &&
      operation.change.kind === 'block' &&
      !operation.change.present &&
      operation.change.polarity === refusedText.polarity,
  )
  if (queuedRemoval && queuedRemoval !== candidate) {
    // An explicit queued removal ends this failed block's lifetime. Honor it
    // before repairing any choice, including a choice in a later re-added block.
    return supersedeRefusedText(stream, queuedRemoval)
  }
  const selection = refusedText.embeddingSelection
  if (change.kind === 'text' && selection && change.embeddingSelection?.token === selection.token) {
    if (
      promptEmbeddingLiteralRanges(refusedText.text, selection.token).length === 0 ||
      promptEmbeddingLiteralRanges(change.text, selection.token).length === 0
    ) {
      return false
    }
    // Repair the unpublished choice before releasing text authored under it.
    // Keep its original text/group and every later operation in order; the new
    // focus's complete text/choice still executes in its own original position.
    refused.change = {
      ...refusedText,
      embeddingSelection: structuredClone(change.embeddingSelection),
    }
    stream.failedOperation = null
    return true
  }
  if (change.kind === 'block' && !change.present) {
    const position = stream.pending.indexOf(candidate)
    const through = position < 0 ? stream.pending.length - 1 : position
    // Removing the entire block explicitly cancels its unpublished text, including
    // dependent choices. Preserve seals, other fields/owners and any later re-add.
    stream.pending = stream.pending.filter(
      (operation, index) =>
        index > through ||
        operation.kind !== 'change' ||
        operation.regionId !== refused.regionId ||
        operation.change.kind !== 'text' ||
        operation.change.polarity !== refusedText.polarity,
    )
    stream.failedOperation = null
    return true
  }
  if (selection && change.kind === 'text') {
    const tail = stream.pending.at(-1)
    const replacesTail =
      !stream.pending.includes(candidate) &&
      tail?.kind === 'change' &&
      tail.change.kind === 'text' &&
      tail.regionId === candidate.regionId &&
      tail.change.polarity === change.polarity &&
      tail.change.historyGroupId === change.historyGroupId &&
      !tail.change.embeddingSelection &&
      !change.embeddingSelection
    if (
      stream.pending
        .slice(1)
        .some(
          (operation) =>
            operation.kind === 'change' &&
            operation.regionId === refused.regionId &&
            operation.change.kind === 'text' &&
            operation.change.polarity === refusedText.polarity &&
            promptEmbeddingLiteralRanges(operation.change.text, selection.token).length > 0 &&
            !(replacesTail && operation === tail),
        )
    ) {
      return false
    }
  }
  const corrects =
    change.kind === 'block'
      ? !change.present
      : !selection || promptEmbeddingLiteralRanges(change.text, selection.token).length === 0
  if (!corrects) {
    return false
  }
  // Supersede only refused, unpublished input. Keep seals and other operations
  // ordered, and keep an exact embedding choice until replaced or removed.
  stream.pending.shift()
  stream.failedOperation = null
  return true
}

function changedProject(): Error {
  return new Error(
    'The Project changed while regional text was updating. Copy any pending text, then discard pending regional edits before continuing.',
  )
}

function applyOptimisticChange(
  region: IgsRegionalGuidanceV1,
  change: ProjectRegionalGuidancePromptChange,
): void {
  if (change.kind === 'block') {
    const before = region.prompts?.[change.polarity]
    if (change.present) {
      if (before) {
        return
      }
      region.prompts ??= { negative: null, positive: null, useGlobalNegativePrompt: true }
      region.prompts[change.polarity] = { embeddingRefs: [], text: '' }
      if (change.polarity === 'negative') {
        region.prompts.useGlobalNegativePrompt = false
      }
    } else if (region.prompts) {
      region.prompts[change.polarity] = null
      if (change.polarity === 'negative') {
        region.prompts.useGlobalNegativePrompt = true
      }
      if (!region.prompts.positive && !region.prompts.negative) {
        delete region.prompts
      }
    }
  } else if (change.kind === 'negative-source') {
    if (region.prompts?.negative) {
      region.prompts.useGlobalNegativePrompt = change.useGlobalNegativePrompt
    }
  } else {
    const before = region.prompts?.[change.polarity]
    if (before && !(change.polarity === 'negative' && region.prompts?.useGlobalNegativePrompt)) {
      // Optimistic typing may prune known refs, never manufacture a verified binding.
      region.prompts![change.polarity] = reconcilePromptEmbeddings(
        { ...before, text: change.text },
        [],
      )
    }
  }
}
