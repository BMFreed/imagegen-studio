import {
  assertProjectMaskBounds,
  PROJECT_MASK_MAX_COORDINATE,
  ProjectMaskError,
} from '../../shared/projects/project-mask.js'
import { IGS_SAFETY_CEILINGS, type IgsRectV1 } from '../../shared/projects/project-schema.js'

/** Current fixed fit policy: Invoke defaults blur16 + padding8, both supported families use8. */
export const PROJECT_MASK_FIT_POLICY = Object.freeze({ blur: 16, grid: 8, padding: 8 })

/** Preserve the full requested margin; inward grid rounding would shrink it. No bitmap allocation. */
export function fitProjectMaskBbox(bounds: IgsRectV1): IgsRectV1 {
  assertProjectMaskBounds(bounds)
  const { blur, grid, padding } = PROJECT_MASK_FIT_POLICY
  const margin = blur + padding
  const x = Math.floor((bounds.x - margin) / grid) * grid
  const y = Math.floor((bounds.y - margin) / grid) * grid
  const right = Math.ceil((bounds.x + bounds.width + margin) / grid) * grid
  const bottom = Math.ceil((bounds.y + bounds.height + margin) / grid) * grid
  if (
    [x, y, right, bottom].some(
      (coordinate) =>
        !Number.isSafeInteger(coordinate) || Math.abs(coordinate) > PROJECT_MASK_MAX_COORDINATE,
    ) ||
    right - x > IGS_SAFETY_CEILINGS.rasterDimension ||
    bottom - y > IGS_SAFETY_CEILINGS.rasterDimension
  ) {
    throw new ProjectMaskError(
      'MASK_LIMIT',
      'The fitted bbox exceeds the Project coordinate limits.',
    )
  }
  return { height: bottom - y, width: right - x, x, y }
}
