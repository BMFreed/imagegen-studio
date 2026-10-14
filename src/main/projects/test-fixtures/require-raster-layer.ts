import type { ProjectLayerView, ProjectRasterLayerView } from '../../../shared/api.js'
import type {
  IgsProjectLayerV1,
  IgsRasterLayerV1,
} from '../../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'

/** Narrow the actual entity at its original stack index; never hide an unexpected Patch. */
export function requireRasterLayer(layer: IgsProjectLayerV1 | undefined): IgsRasterLayerV1
export function requireRasterLayer(layer: ProjectLayerView | undefined): ProjectRasterLayerView
export function requireRasterLayer(
  layer: IgsProjectLayerV1 | ProjectLayerView | undefined,
): IgsRasterLayerV1 | ProjectRasterLayerView {
  assert.ok(
    layer !== undefined && layer.kind !== 'smart-patch',
    'Expected a Raster Layer at this stack position.',
  )
  return layer
}
