import type { ProjectTab } from '../../shared/api.js'
import type { AcceptedResultHistoryReference } from '../../shared/projects/accepted-result-history.js'
import {
  isProjectAcceptedResults,
  projectAcceptedResultImageIdentity,
  projectAcceptedResultOwners,
  type ProjectAcceptedResultTarget,
} from '../../shared/projects/project-accepted-results.js'

export type AcceptedHistoryTarget = ProjectAcceptedResultTarget

export interface AcceptedHistoryFocusRequest extends AcceptedResultHistoryReference {
  requestId: number
}

export interface SmartPatchVariantFocusRequest {
  assetSha256: string
  documentId: string
  documentRevision: string
  layerId: string
  requestId: number
  tabId: string
  variantId: string
}

type HistoryTab = Pick<
  ProjectTab,
  'acceptedResults' | 'documentId' | 'documentRevision' | 'id' | 'layers'
>

/** A dirty revision is allowed, but current ownership and exact pixels must still match. */
export function resolveAcceptedHistoryTarget(
  tab: HistoryTab,
  reference: AcceptedResultHistoryReference,
): AcceptedHistoryTarget | null {
  if (
    tab.id !== reference.projectKey ||
    tab.documentId !== reference.documentId ||
    !isProjectAcceptedResults(tab.acceptedResults, tab)
  ) {
    return null
  }
  const result = tab.acceptedResults.find((item) => item.layerId === reference.layerId)
  const image = result && projectAcceptedResultImageIdentity(result.imageUrl)
  return image?.assetSha256 === reference.assetSha256
    ? (projectAcceptedResultOwners(tab.layers)?.get(reference.layerId) ?? null)
    : null
}

/** Compatibility predicate used by the existing saved Open/recovery continuation. */
export function acceptedHistoryLayerAvailable(
  tab: HistoryTab,
  reference: AcceptedResultHistoryReference,
): boolean {
  return resolveAcceptedHistoryTarget(tab, reference) !== null
}

/** Browser focus is transient and never invokes the persisted variant selection command. */
export function smartPatchVariantFocusAvailable(
  tab: HistoryTab,
  layerId: string,
  request: SmartPatchVariantFocusRequest,
): boolean {
  if (request.layerId !== layerId || request.documentRevision !== tab.documentRevision) {
    return false
  }
  const target = resolveAcceptedHistoryTarget(tab, {
    assetSha256: request.assetSha256,
    documentId: request.documentId,
    documentRevision: request.documentRevision,
    layerId: request.variantId,
    projectKey: request.tabId,
  })
  return (
    target?.kind === 'smart-patch-variant' &&
    target.layerId === layerId &&
    target.variantId === request.variantId
  )
}
