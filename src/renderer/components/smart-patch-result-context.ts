import type {
  ProjectLayerView,
  ProjectRasterLayerView,
  ProjectSmartPatchResultView,
} from '../../shared/api.js'

import { isSmartPatchLayerView } from './project-layer-context.js'

export function smartPatchResultScope(documentId: string, layerId: string): string {
  return `${documentId}:${layerId}`
}

/** Preview substitutes pixels only; the original document and inactive variants are untouched. */
export function smartPatchPreviewRasters(
  layers: readonly ProjectLayerView[],
  candidate: ProjectSmartPatchResultView | null,
  documentId: string,
): ProjectRasterLayerView[] {
  return layers.flatMap<ProjectRasterLayerView>((layer) => {
    if (!isSmartPatchLayerView(layer)) {
      return [layer]
    }
    if (candidate && candidate.documentId === documentId && candidate.layerId === layer.id) {
      return [
        {
          blendMode: layer.blendMode,
          height: candidate.bbox.height,
          id: layer.id,
          imageUrl: candidate.imageUrl,
          locked: layer.locked,
          name: layer.name,
          opacity: layer.opacity,
          transform: {
            rotationDegrees: 0,
            scaleX: 1,
            scaleY: 1,
            x: candidate.bbox.x,
            y: candidate.bbox.y,
          },
          visible: layer.visible,
          width: candidate.bbox.width,
        },
      ]
    }
    return layer.activeRaster
      ? [
          {
            ...layer.activeRaster,
            blendMode: layer.blendMode,
            locked: layer.locked,
            opacity: layer.opacity,
            visible: layer.visible,
          },
        ]
      : []
  })
}

export function smartPatchCandidateHasTarget(
  layers: readonly ProjectLayerView[],
  candidate: ProjectSmartPatchResultView,
  documentId: string,
): boolean {
  return (
    candidate.documentId === documentId &&
    layers.some((layer) => isSmartPatchLayerView(layer) && layer.id === candidate.layerId)
  )
}
