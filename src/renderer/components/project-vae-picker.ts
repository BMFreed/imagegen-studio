import type { ModelCatalogItem, ProjectTab } from '../../shared/api.js'

import { portableModelRelinkCandidate, savedModelAvailability } from './project-model-picker.js'

export type SavedVae = NonNullable<ProjectTab['generationDraft']['vae']>
export const EMBEDDED_VAE_OPTION = 'embedded'

/** Only explicit CivitAI components applicable to Illustrious; not pinned Anima companions. */
export function projectVaeOptions(catalog: ModelCatalogItem[]) {
  return catalog
    .filter((resource) => resource.resourceType === 'vae' && resource.modelId !== null)
    .flatMap((resource) =>
      resource.versions
        .filter(
          (version) => version.baseModelFamily === 'illustrious' && version.predictionType === null,
        )
        .map((version) => ({
          disabled: version.fileStatus !== 'ready',
          label: `${resource.name} · ${version.name}`,
          resource,
          status:
            version.fileStatus === 'ready'
              ? resource.defaultVersionId === version.id
                ? 'Default'
                : 'Installed'
              : version.fileStatus === 'corrupt'
                ? 'Needs repair'
                : 'Missing file',
          value: version.id,
          version,
        })),
    )
}

export function projectVaeDiagnostic(
  saved: SavedVae | null,
  catalog: ModelCatalogItem[],
  catalogReady: boolean,
  modelFamily: string | null,
): string | null {
  if (saved) {
    if (
      saved.kind !== 'vae' ||
      saved.baseModelFamily !== 'illustrious' ||
      saved.predictionType !== null
    ) {
      return 'This saved VAE is not supported here. Reset it before generating.'
    }
    if (modelFamily !== 'illustrious') {
      return 'This external VAE requires an Illustrious model. Reset it or select Illustrious.'
    }
    if (!catalogReady) {
      return 'The installed VAE could not be checked. Refresh models to check its exact version.'
    }
    if (portableModelRelinkCandidate(saved, catalog)) {
      return 'This exact VAE is installed here. Link it to restore the saved reference.'
    }
    const availability = savedModelAvailability(saved, catalog)
    if (availability === 'corrupt') {
      return 'This VAE file needs repair in Model Manager.'
    }
    if (availability !== 'ready') {
      return 'Exact VAE version unavailable. Restore it in Model Manager, or reset to Embedded.'
    }
    return null
  }
  if (modelFamily === 'anima') {
    return 'Anima uses its required installed VAE. Alternative VAEs are not connected yet.'
  }
  return modelFamily === 'illustrious'
    ? null
    : 'Choose an Illustrious model to select an external VAE.'
}

export function externalVaeGenerationReason(saved: SavedVae | null): string | null {
  return saved
    ? 'External VAE generation is not connected yet. Reset VAE to Embedded before generating.'
    : null
}
