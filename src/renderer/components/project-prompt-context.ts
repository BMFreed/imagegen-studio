import type { ModelCatalogItem, ProjectTab } from '../../shared/api.js'
import type { LoraTriggerSource } from '../../shared/projects/lora-triggers.js'

import { savedModelAvailability } from './project-model-picker.js'

export function projectPromptLoraSources(
  loras: ProjectTab['generationDraft']['loras'],
  catalog: ModelCatalogItem[],
  catalogReady: boolean,
): LoraTriggerSource[] {
  if (!catalogReady) {
    return []
  }
  return loras.flatMap((lora) => {
    const availability = savedModelAvailability(lora.resource, catalog)
    if (!lora.enabled || (availability !== 'ready' && availability !== 'unknown-family')) {
      return []
    }
    const version = catalog
      .find((item) => item.id === lora.resource.localModelId)
      ?.versions.find((item) => item.id === lora.resource.localVersionId)
    return version
      ? [
          {
            id: JSON.stringify([lora.resource.localModelId, lora.resource.localVersionId]),
            name: lora.resource.displayName,
            phrases: version.trainedWords,
            version: lora.resource.versionName,
          },
        ]
      : []
  })
}
