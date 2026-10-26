import type { ProjectTab } from '../../shared/api.js'
import {
  projectAcceptedResultImageIdentity,
  projectAcceptedResultOwners,
  type ProjectAcceptedResultTarget,
} from '../../shared/projects/project-accepted-results.js'
import {
  isSmartResultPresetDataForRequest,
  isSmartResultPresetRequest,
  type SmartResultPresetData,
  type SmartResultPresetRequest,
} from '../../shared/projects/smart-result-preset.js'

export type SmartResultPresetOrigin = 'layer-menu' | 'variant-action'

export interface SmartResultPresetPresentation {
  current: () => boolean
  restoreFocus: () => void
}

export interface SmartResultPresetSource {
  layerName: string
  origin: SmartResultPresetOrigin
  projectName: string
  request: SmartResultPresetRequest
  selectedLayerId: string | null
  tabId: string
}

type SourceTab = Pick<
  ProjectTab,
  'acceptedResults' | 'documentId' | 'documentRevision' | 'id' | 'layers' | 'title'
>

/** Current containment and accepted asset identity own this read, never historical source IDs. */
export function captureSmartResultPresetSource(
  tab: SourceTab,
  target: ProjectAcceptedResultTarget,
  origin: SmartResultPresetOrigin,
  selectedLayerId: string | null,
): SmartResultPresetSource | null {
  const owner = { ...target }
  const resultId = owner.kind === 'raster' ? owner.layerId : owner.variantId
  const contained = projectAcceptedResultOwners(tab.layers)?.get(resultId)
  if (
    !contained ||
    contained.kind !== owner.kind ||
    contained.layerId !== owner.layerId ||
    (owner.kind === 'smart-patch-variant' &&
      (contained.kind !== 'smart-patch-variant' || contained.variantId !== owner.variantId))
  ) {
    return null
  }
  const layer = tab.layers.find(({ id }) => id === owner.layerId)
  const accepted = tab.acceptedResults.find(({ layerId }) => layerId === resultId)
  const image = projectAcceptedResultImageIdentity(accepted?.imageUrl)
  if (
    !layer ||
    !image ||
    image.projectKey !== tab.id ||
    image.documentRevision !== tab.documentRevision ||
    image.layerId !== resultId
  ) {
    return null
  }
  let layerName = layer.name
  if (owner.kind === 'raster') {
    if (
      origin !== 'layer-menu' ||
      layer.kind === 'smart-patch' ||
      layer.resultPresetSourceKind !== 'smart-patch'
    ) {
      return null
    }
    const rasterImage = projectAcceptedResultImageIdentity(layer.imageUrl)
    if (
      !rasterImage ||
      rasterImage.projectKey !== tab.id ||
      rasterImage.documentRevision !== tab.documentRevision ||
      rasterImage.layerId !== owner.layerId ||
      rasterImage.assetSha256 !== image.assetSha256
    ) {
      return null
    }
  } else {
    if (
      layer.kind !== 'smart-patch' ||
      (origin === 'layer-menu' && layer.activeRasterSubLayerId !== owner.variantId)
    ) {
      return null
    }
    const variant = layer.rasterSubLayers.find(({ id }) => id === owner.variantId)
    if (!variant) {
      return null
    }
    layerName = `${layer.name} · ${variant.name}`
  }
  const request: SmartResultPresetRequest = {
    assetSha256: image.assetSha256,
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    owner,
  }
  return isSmartResultPresetRequest(request)
    ? { layerName, origin, projectName: tab.title, request, selectedLayerId, tabId: tab.id }
    : null
}

/** Awaited replies and modal focus restoration share the same captured revision and source. */
export function smartResultPresetSourceCurrent(
  source: SmartResultPresetSource,
  tab: SourceTab | undefined,
  selectedLayerId: string | null,
): boolean {
  if (
    !tab ||
    tab.id !== source.tabId ||
    tab.documentId !== source.request.documentId ||
    tab.documentRevision !== source.request.documentRevision ||
    selectedLayerId !== source.selectedLayerId
  ) {
    return false
  }
  const current = captureSmartResultPresetSource(
    tab,
    source.request.owner,
    source.origin,
    selectedLayerId,
  )
  return Boolean(
    current &&
    current.request.assetSha256 === source.request.assetSha256 &&
    current.layerName === source.layerName,
  )
}

export function smartResultPresetReplyMatches(
  request: SmartResultPresetRequest,
  data: unknown,
): data is SmartResultPresetData {
  return isSmartResultPresetDataForRequest(data, request)
}
