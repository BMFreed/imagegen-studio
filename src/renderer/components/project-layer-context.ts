import type {
  ProjectLayerView,
  ProjectRasterLayerView,
  ProjectRegionalGuidanceLayerView,
  ProjectSmartPatchLayerView,
  ProjectTab,
} from '../../shared/api.js'
import { projectRasterDisplayViews } from '../../shared/projects/project-layer-views.js'

export type SelectedProjectEntity =
  | { kind: 'compositing-layer'; layer: ProjectLayerView }
  | { kind: 'regional-guidance'; region: ProjectRegionalGuidanceLayerView }

/** Selection names one top-level entity; owned masks and variants are not selectable rows. */
export function resolveSelectedProjectEntity(
  tab: Pick<ProjectTab, 'layers' | 'regionalGuidance'>,
  id: string | null,
): SelectedProjectEntity | null {
  if (id === null) {
    return null
  }
  const layer = tab.layers.find((candidate) => candidate.id === id)
  if (layer) {
    return { kind: 'compositing-layer', layer }
  }
  const region = tab.regionalGuidance?.find((candidate) => candidate.id === id)
  return region ? { kind: 'regional-guidance', region } : null
}

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
