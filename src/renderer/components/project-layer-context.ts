import type {
  ProjectLayerView,
  ProjectRasterLayerView,
  ProjectSmartPatchLayerView,
} from '../../shared/api.js'

/** Raster transport predates a discriminator; the new entity has an explicit kind. */
export function isSmartPatchLayerView(
  layer: ProjectLayerView,
): layer is ProjectSmartPatchLayerView {
  return 'kind' in layer && layer.kind === 'smart-patch'
}

/** Empty patches contribute no pixels, image URL, raster transform or accepted result. */
export function rasterLayerViews(layers: readonly ProjectLayerView[]): ProjectRasterLayerView[] {
  return layers.filter((layer): layer is ProjectRasterLayerView => !isSmartPatchLayerView(layer))
}

export function selectedSmartPatchLayer(
  layers: readonly ProjectLayerView[],
  selectedLayerId: string | null,
): ProjectSmartPatchLayerView | null {
  const selected = layers.find((layer) => layer.id === selectedLayerId)
  return selected && isSmartPatchLayerView(selected) ? selected : null
}
