import type { ProjectTab } from '../../shared/api.js'
import type { AcceptedResultHistoryReference } from '../../shared/projects/accepted-result-history.js'

import { isSmartPatchLayerView } from './project-layer-context.js'

export interface AcceptedHistoryFocusRequest extends AcceptedResultHistoryReference {
  requestId: number
}

/** A dirty revision is allowed, but current ownership and exact pixels must still match. */
export function acceptedHistoryLayerAvailable(
  tab: Pick<ProjectTab, 'acceptedResults' | 'documentId' | 'id' | 'layers'>,
  reference: AcceptedResultHistoryReference,
): boolean {
  if (tab.id !== reference.projectKey || tab.documentId !== reference.documentId) {
    return false
  }
  const layer = tab.layers.find((item) => item.id === reference.layerId)
  const result = tab.acceptedResults.find((item) => item.layerId === reference.layerId)
  if (!layer || isSmartPatchLayerView(layer) || !result || layer.imageUrl !== result.imageUrl) {
    return false
  }
  const match =
    /^igs-layer:\/\/asset\/(project-v1-[a-f0-9]{64})\/([a-fA-F0-9-]{36})\/([a-fA-F0-9-]{36})\/([a-f0-9]{64})\/[a-f0-9]{64}\.img$/.exec(
      layer.imageUrl,
    )
  return Boolean(
    match &&
    match[1] === tab.id &&
    match[3] === reference.layerId &&
    match[4] === reference.assetSha256,
  )
}
