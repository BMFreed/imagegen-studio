import type {
  ProjectSmartPatchLayerView,
  ProjectSmartPatchVariantChange,
  ProjectTab,
} from '../../shared/api.js'

import { isSmartPatchLayerView } from './project-layer-context.js'

export interface SmartPatchVariantMutationOwner {
  documentId: string
  documentRevision: string
  layerId: string
  tabId: string
  variantId: string
}

/** A command belongs to the revision reviewed by the user, even when a draft must flush first. */
export function captureSmartPatchVariantOwner(
  tab: ProjectTab,
  layerId: string,
  change: ProjectSmartPatchVariantChange,
): SmartPatchVariantMutationOwner | null {
  if (
    tab.documentId !== change.documentId ||
    tab.documentRevision !== change.documentRevision ||
    !mutableVariantOwner(tab, layerId, change.variantId)
  ) {
    return null
  }
  return {
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    layerId,
    tabId: tab.id,
    variantId: change.variantId,
  }
}

export function smartPatchVariantOwnerAfterFlush(
  owner: SmartPatchVariantMutationOwner,
  tab: ProjectTab | undefined,
): boolean {
  return Boolean(
    tab &&
    tab.id === owner.tabId &&
    tab.documentId === owner.documentId &&
    tab.documentRevision === owner.documentRevision &&
    mutableVariantOwner(tab, owner.layerId, owner.variantId),
  )
}

function mutableVariantOwner(
  tab: ProjectTab,
  layerId: string,
  variantId: string,
): ProjectSmartPatchLayerView | null {
  const layer = tab.layers.find((candidate) => candidate.id === layerId)
  return layer &&
    isSmartPatchLayerView(layer) &&
    !layer.locked &&
    layer.rasterSubLayers.some((variant) => variant.id === variantId)
    ? layer
    : null
}
