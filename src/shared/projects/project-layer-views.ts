import type { ProjectLayerView, ProjectRasterLayerView } from '../api.js'

/** Display pixels retain the parent owner ID; they are not independent Raster edit targets. */
export function projectRasterDisplayViews(
  layers: readonly ProjectLayerView[],
): ProjectRasterLayerView[] {
  return layers.flatMap((layer) => {
    if (layer.kind !== 'smart-patch') {
      return [layer]
    }
    if (!layer.activeRaster) {
      return []
    }
    return [
      {
        ...layer.activeRaster,
        blendMode: layer.blendMode,
        id: layer.id,
        locked: layer.locked,
        name: layer.name,
        opacity: layer.opacity,
        visible: layer.visible,
      },
    ]
  })
}
