import type { ProjectTab } from '../../shared/api.js'
import {
  isRasterGenerationData,
  type RasterGenerationData,
} from '../../shared/projects/generation-settings-comparison.js'
import {
  projectAcceptedResultImageIdentity,
  projectAcceptedResultOwners,
  type ProjectAcceptedResultTarget,
} from '../../shared/projects/project-accepted-results.js'
import {
  isSmartResultComparisonDataForRequest,
  isSmartResultComparisonRequest,
  type SmartResultComparisonData,
  type SmartResultComparisonRequest,
} from '../../shared/projects/smart-result-comparison.js'

import type { ModelManagerFocus } from './model-manager-focus.js'

export interface GenerationComparisonSource {
  kind: 'raster' | 'smart-patch'
  layerName: string
  request: SmartResultComparisonRequest
  tabId: string
}
/** Transient renderer ownership only; never sent over IPC or retained in provenance. */
export interface GenerationComparisonModelsRequest {
  cancel: () => void
  focus: ModelManagerFocus
  isCurrent: () => boolean
  resume: () => void
  source: GenerationComparisonSource
  token: symbol
}
export type GenerationComparisonData =
  | { data: RasterGenerationData; kind: 'raster' }
  | { data: SmartResultComparisonData; kind: 'smart-patch' }
type SourceTab = Pick<
  ProjectTab,
  'acceptedResults' | 'documentId' | 'documentRevision' | 'id' | 'layers'
>

/** Coalesces reads while epochs suppress stale success/error across close, Undo and reopen. */
export class GenerationComparisonReader {
  private baseline: { data: GenerationComparisonData; source: GenerationComparisonSource } | null =
    null
  private disposed = false
  private epoch = 0
  private pending: { epoch: number; source: GenerationComparisonSource } | null = null
  private running = false

  constructor(
    private readonly options: {
      onState: (
        data: GenerationComparisonData | null,
        error: string | null,
        loading: boolean,
      ) => void
      read: (source: GenerationComparisonSource) => Promise<unknown>
    },
  ) {}

  change(source: GenerationComparisonSource | null, waiting = false) {
    if (this.disposed) {
      return
    }
    const epoch = ++this.epoch
    this.pending = source && !waiting ? { epoch, source: JSON.parse(JSON.stringify(source)) } : null
    const previous = this.baseline
    if (
      !source ||
      !previous ||
      source.kind !== previous.source.kind ||
      source.tabId !== previous.source.tabId ||
      source.request.documentId !== previous.source.request.documentId ||
      source.request.assetSha256 !== previous.source.request.assetSha256 ||
      JSON.stringify(source.request.owner) !== JSON.stringify(previous.source.request.owner)
    ) {
      this.baseline = null
    }
    // Immutable settings stay readable while ONLY the current Canvas mode is rechecked.
    // Retain the original validated envelope; never relabel it as a reply for a new revision.
    const retained = this.baseline?.data
    const modeUnavailableReason = waiting
      ? 'Waiting for draft changes…'
      : 'Checking current generation mode…'
    this.options.onState(
      retained
        ? retained.kind === 'smart-patch'
          ? {
              data: { ...retained.data, currentMode: null, modeUnavailableReason },
              kind: 'smart-patch',
            }
          : { data: { ...retained.data, currentMode: null, modeUnavailableReason }, kind: 'raster' }
        : null,
      null,
      Boolean(source),
    )
    if (!this.running) {
      void this.drain()
    }
  }

  dispose() {
    this.disposed = true
    this.epoch += 1
    this.pending = null
    this.baseline = null
  }

  private async drain() {
    this.running = true
    try {
      while (this.pending && !this.disposed) {
        const { epoch, source } = this.pending
        this.pending = null
        try {
          const data = await this.options.read(source)
          if (this.disposed || epoch !== this.epoch) {
            continue
          }
          if (!generationComparisonReplyMatches(source, data)) {
            throw new Error('The generation data response belongs to a different saved result.')
          }
          const baseline: GenerationComparisonData =
            source.kind === 'smart-patch'
              ? { data: data as SmartResultComparisonData, kind: 'smart-patch' }
              : { data: data as RasterGenerationData, kind: 'raster' }
          this.baseline = { data: baseline, source }
          this.options.onState(baseline, null, false)
        } catch (cause) {
          if (!this.disposed && epoch === this.epoch) {
            this.baseline = null
            this.options.onState(
              null,
              cause instanceof Error ? cause.message : 'Generation data could not be read.',
              false,
            )
          }
        }
      }
    } finally {
      this.running = false
    }
  }
}

/** The actual active member and its owned asset identify a Patch read, even if pixels coincide. */
export function captureGenerationComparisonSource(
  tab: SourceTab,
  layerId: string,
): GenerationComparisonSource | null {
  const layer = tab.layers.find(({ id }) => id === layerId)
  if (!layer) {
    return null
  }
  let owner: ProjectAcceptedResultTarget
  let kind: GenerationComparisonSource['kind']
  let layerName = layer.name
  if (layer.kind === 'smart-patch') {
    const active = layer.rasterSubLayers.find(({ id }) => id === layer.activeRasterSubLayerId)
    if (!active) {
      return null
    }
    owner = { kind: 'smart-patch-variant', layerId, variantId: active.id }
    kind = 'smart-patch'
    layerName = `${layer.name} · ${active.name}`
  } else {
    if (layer.generationSettingsUnavailableReason) {
      return null
    }
    owner = { kind: 'raster', layerId }
    kind = layer.resultComparisonSourceKind === 'smart-patch' ? 'smart-patch' : 'raster'
  }
  const resultId = owner.kind === 'raster' ? owner.layerId : owner.variantId
  const contained = projectAcceptedResultOwners(tab.layers)?.get(resultId)
  const accepted = tab.acceptedResults.find(({ layerId: id }) => id === resultId)
  const image = projectAcceptedResultImageIdentity(accepted?.imageUrl)
  if (
    !contained ||
    contained.kind !== owner.kind ||
    contained.layerId !== owner.layerId ||
    (owner.kind === 'smart-patch-variant' &&
      (contained.kind !== 'smart-patch-variant' || contained.variantId !== owner.variantId)) ||
    !image ||
    image.projectKey !== tab.id ||
    image.documentRevision !== tab.documentRevision ||
    image.layerId !== resultId
  ) {
    return null
  }
  if (layer.kind !== 'smart-patch') {
    const rasterImage = projectAcceptedResultImageIdentity(layer.imageUrl)
    if (
      !rasterImage ||
      rasterImage.projectKey !== tab.id ||
      rasterImage.documentRevision !== tab.documentRevision ||
      rasterImage.layerId !== resultId ||
      rasterImage.assetSha256 !== image.assetSha256
    ) {
      return null
    }
  }
  const request: SmartResultComparisonRequest = {
    assetSha256: image.assetSha256,
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    owner,
  }
  return isSmartResultComparisonRequest(request)
    ? { kind, layerName, request, tabId: tab.id }
    : null
}

export function generationComparisonSourceCurrent(
  source: GenerationComparisonSource,
  tab: SourceTab,
): boolean {
  const current = captureGenerationComparisonSource(tab, source.request.owner.layerId)
  return Boolean(current && JSON.stringify(current) === JSON.stringify(source))
}

export function generationComparisonReplyMatches(
  source: GenerationComparisonSource,
  data: unknown,
) {
  return source.kind === 'smart-patch'
    ? isSmartResultComparisonDataForRequest(data, source.request)
    : isRasterGenerationData(data) &&
        data.documentId === source.request.documentId &&
        data.layerId === source.request.owner.layerId
}
