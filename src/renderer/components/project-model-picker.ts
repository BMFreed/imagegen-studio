import type { ModelCatalogItem, ModelVersionView, ProjectTab } from '../../shared/api.js'

export type SavedModelAvailability = 'corrupt' | 'missing' | 'none' | 'ready' | 'unknown-family'

export type ModelResourceSelectionPlan =
  | { kind: 'choose-version' }
  | { kind: 'select-default'; versionId: string }
  | { kind: 'unavailable' }

export interface PortableModelRelinkCandidate {
  resource: ModelCatalogItem
  version: ModelVersionView
}

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
  const resource = catalog.find(
    (item) => item.resourceType === saved.kind && item.id === saved.localModelId,
  )
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

/** A catalog match is only a suggestion. Main must verify the file before relinking. */
export function portableModelRelinkCandidate(
  saved: SavedModel | null,
  catalog: ModelCatalogItem[],
): PortableModelRelinkCandidate | null {
  if (
    !saved ||
    savedModelAvailability(saved, catalog) === 'ready' ||
    saved.civitaiModelId === null ||
    saved.civitaiVersionId === null ||
    saved.civitaiFileId === null ||
    (saved.kind !== 'checkpoint' && saved.kind !== 'lora' && saved.kind !== 'vae') ||
    (saved.kind === 'vae' &&
      (saved.baseModelFamily !== 'illustrious' || saved.predictionType !== null)) ||
    (saved.kind === 'checkpoint' && saved.baseModelFamily === null)
  ) {
    return null
  }

  const matches = catalog
    .filter((resource) => resource.resourceType === saved.kind)
    .flatMap((resource) =>
      resource.versions
        .filter(
          (version) =>
            resource.modelId === saved.civitaiModelId &&
            version.civitaiVersionId === saved.civitaiVersionId &&
            version.civitaiFileId === saved.civitaiFileId &&
            version.sha256.toLowerCase() === saved.fileSha256.toLowerCase() &&
            version.baseModelFamily === saved.baseModelFamily,
        )
        .map((version) => ({ resource, version })),
    )
  const match = matches.length === 1 ? matches[0]! : null
  return match &&
    (saved.kind === 'lora' || saved.kind === 'vae'
      ? match.version.fileStatus === 'ready'
      : selectableVersion(match.version)) &&
    (match.resource.id !== saved.localModelId || match.version.id !== saved.localVersionId)
    ? match
    : null
}
