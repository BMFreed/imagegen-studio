import type { ProjectAcceptedResultView } from '../../shared/api.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import { projectLayerImageUrl } from './project-layer-resource.js'

/** Current document ownership is authoritative; queue/staging and live settings are not history. */
export function projectAcceptedResults(
  projectId: string,
  document: IgsProjectDocumentV1,
): ProjectAcceptedResultView[] {
  return document.layers
    .flatMap((layer): ProjectAcceptedResultView[] => {
      const provenance = layer.generationProvenance
      if (!provenance) {
        return []
      }
      const configuration = provenance.generationConfiguration
      const execution = provenance.executionResultContext
      return [
        {
          acceptedAt: execution.acceptedAt,
          height: execution.output.height,
          imageUrl: projectLayerImageUrl(
            projectId,
            document.documentRevision,
            layer.id,
            layer.asset.sha256,
          ),
          layerId: layer.id,
          layerName: layer.name,
          modelFileSha256: configuration.model.fileSha256,
          modelName: configuration.model.displayName,
          modelVersionName: configuration.model.versionName,
          seed: configuration.sampling.actualSeed,
          width: execution.output.width,
        },
      ]
    })
    .sort((a, b) => {
      if (a.acceptedAt !== b.acceptedAt) {
        return a.acceptedAt > b.acceptedAt ? -1 : 1
      }
      return a.layerId < b.layerId ? -1 : a.layerId > b.layerId ? 1 : 0
    })
}
