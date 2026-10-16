import type {
  ProjectLayerView,
  ProjectRasterLayerView,
  ProjectSmartPatchLayerView,
} from '../../shared/api.js'
import { projectRasterDisplayViews } from '../../shared/projects/project-layer-views.js'

/** Raster transport predates a discriminator; the new entity has an explicit kind. */
export function isSmartPatchLayerView(
  layer: ProjectLayerView,
): layer is ProjectSmartPatchLayerView {
  return 'kind' in layer && layer.kind === 'smart-patch'
}

/** Active pixels preserve stack/owner identity; empty patches contribute no display image. */
export function rasterLayerViews(layers: readonly ProjectLayerView[]): ProjectRasterLayerView[] {
  return projectRasterDisplayViews(layers)
}

export function selectedSmartPatchLayer(
  layers: readonly ProjectLayerView[],
  selectedLayerId: string | null,
): ProjectSmartPatchLayerView | null {
  const selected = layers.find((layer) => layer.id === selectedLayerId)
  return selected && isSmartPatchLayerView(selected) ? selected : null
}
