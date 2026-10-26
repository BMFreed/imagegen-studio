import type { ProjectTab } from '../../shared/api.js'
import type { PresetRecord } from '../../shared/presets/preset-schema.js'
import {
  isSmartPatchPresetApplicationReviewForRequest,
  type SmartPatchPresetApplicationReview,
} from '../../shared/presets/smart-patch-preset-application.js'

export type { SmartPatchPresetApplicationReview } from '../../shared/presets/smart-patch-preset-application.js'

export interface SmartPatchPresetApplicationOwner {
  documentId: string
  documentRevision: string
  layerId: string
  layerName: string
  primaryBbox: ProjectTab['primaryBbox']
  tabId: string
}

export interface SmartPatchPresetApplicationContext {
  activeTabId: string | undefined
  blocked: boolean
  pendingDraft: boolean
  selectedLayerId: string | null
  tab: OwnerTab | undefined
}

type OwnerTab = Pick<
  ProjectTab,
  'documentId' | 'documentRevision' | 'id' | 'layers' | 'primaryBbox'
>

export class SmartPatchPresetApplicationReader {
  private epoch = 0

  constructor(
    private readonly options: {
      current: (owner: SmartPatchPresetApplicationOwner) => boolean
      readPreset: (id: string) => Promise<PresetRecord | null>
      readReview: (
        owner: SmartPatchPresetApplicationOwner,
      ) => Promise<SmartPatchPresetApplicationReview>
    },
  ) {}

  invalidate(): void {
    this.epoch += 1
  }

  async open(
    owner: SmartPatchPresetApplicationOwner,
    sourceId: string,
  ): Promise<{
    review: SmartPatchPresetApplicationReview
    source: PresetRecord
  } | null> {
    const epoch = ++this.epoch
    const captured = clone(owner)
    const current = () => epoch === this.epoch && this.options.current(captured)
    if (!current()) {
      return null
    }
    try {
      // Start Main's synchronous review issuance before the asynchronous source lookup.
      const [review, source] = await Promise.all([
        this.options.readReview(captured),
        this.options.readPreset(sourceId),
      ])
      if (!current()) {
        return null
      }
      if (!source || source.id !== sourceId || source.deletedAt !== null) {
        throw new Error('This preset is no longer active. Refresh the preset list.')
      }
      if (
        !isSmartPatchPresetApplicationReviewForRequest(review, {
          documentId: captured.documentId,
          documentRevision: captured.documentRevision,
          layerId: captured.layerId,
        })
      ) {
        throw new Error('The preset review belongs to a different Smart Patch. Choose it again.')
      }
      return { review: clone(review), source: clone(source) }
    } catch (cause) {
      if (!current()) {
        return null
      }
      throw cause
    }
  }
}

export function captureSmartPatchPresetApplicationOwner(
  tab: OwnerTab,
  selectedLayerId: string | null,
): SmartPatchPresetApplicationOwner | null {
  const patch = tab.layers.find(({ id }) => id === selectedLayerId)
  if (patch?.kind !== 'smart-patch' || patch.locked) {
    return null
  }
  return {
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    layerId: patch.id,
    layerName: patch.name,
    primaryBbox: clone(tab.primaryBbox),
    tabId: tab.id,
  }
}

/** Selection/context epochs invalidate roundtrips; Main's review token covers unseen Undo ABA. */
export function smartPatchPresetApplicationOwnerCurrent(
  owner: SmartPatchPresetApplicationOwner,
  context: SmartPatchPresetApplicationContext,
): boolean {
  const { tab } = context
  if (
    context.blocked ||
    context.pendingDraft ||
    context.activeTabId !== owner.tabId ||
    context.selectedLayerId !== owner.layerId ||
    tab?.id !== owner.tabId ||
    tab.documentId !== owner.documentId ||
    tab.documentRevision !== owner.documentRevision
  ) {
    return false
  }
  const patch = tab.layers.find(({ id }) => id === owner.layerId)
  return patch?.kind === 'smart-patch' && !patch.locked && patch.name === owner.layerName
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
