import type { ModelCatalogItem, ModelVersionView, ProjectTab } from '../../shared/api.js'

export type SavedModelAvailability = 'corrupt' | 'missing' | 'none' | 'ready' | 'unknown-family'

export type ModelResourceSelectionPlan =
  | { kind: 'choose-version' }
  | { kind: 'select-default'; versionId: string }
  | { kind: 'unavailable' }

type SavedModel = NonNullable<ProjectTab['generationDraft']['model']>

export function checkpointCatalog(catalog: ModelCatalogItem[]): ModelCatalogItem[] {
  return catalog.filter((resource) => resource.resourceType === 'checkpoint')
}

export function selectableVersion(version: ModelVersionView): boolean {
  return (
    version.fileStatus === 'ready' &&
    (version.baseModelFamily === 'illustrious' || version.baseModelFamily === 'anima')
  )
}

/** A catalog default only applies to a new Project selection, never to a saved exact ref. */
export function readyDefaultVersion(resource: ModelCatalogItem): ModelVersionView | null {
  if (resource.resourceType !== 'checkpoint') {
    return null
  }
  const version = resource.versions.find((candidate) => candidate.id === resource.defaultVersionId)
  return version && selectableVersion(version) ? version : null
}

/** An unavailable default never causes an implicit switch to another version. */
export function planModelResourceSelection(resource: ModelCatalogItem): ModelResourceSelectionPlan {
  const readyDefault = readyDefaultVersion(resource)
  if (readyDefault) {
    return { kind: 'select-default', versionId: readyDefault.id }
  }
  if (resource.resourceType === 'checkpoint' && resource.versions.some(selectableVersion)) {
    return { kind: 'choose-version' }
  }
  return { kind: 'unavailable' }
}

/** Resolve by the immutable version and file hash, without switching to the catalog default. */
export function savedModelAvailability(
  saved: SavedModel | null,
  catalog: ModelCatalogItem[],
): SavedModelAvailability {
  if (!saved) {
    return 'none'
  }
  const resource = checkpointCatalog(catalog).find((item) => item.id === saved.localModelId)
  const version = resource?.versions.find((item) => item.id === saved.localVersionId)
  if (
    !resource ||
    !version ||
    version.sha256 !== saved.fileSha256 ||
    resource.modelId !== saved.civitaiModelId ||
    version.civitaiVersionId !== saved.civitaiVersionId ||
    version.civitaiFileId !== saved.civitaiFileId ||
    version.baseModelFamily !== saved.baseModelFamily
  ) {
    return 'missing'
  }
  if (version.fileStatus !== 'ready') {
    return version.fileStatus
  }
  return version.baseModelFamily === null ? 'unknown-family' : 'ready'
}
