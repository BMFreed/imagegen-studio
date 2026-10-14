import {
  PROJECT_MASK_DEFAULT_SETTINGS,
  type ProjectMaskSettings,
  ProjectMaskSettingsSchema,
  resolveProjectMaskSettings,
} from '../../shared/projects/project-mask-settings.js'
import {
  assertProjectMaskBounds,
  PROJECT_MASK_MAX_COORDINATE,
  ProjectMaskError,
} from '../../shared/projects/project-mask.js'
import { IGS_SAFETY_CEILINGS, type IgsRectV1 } from '../../shared/projects/project-schema.js'

import * as v from 'valibot'

/** Legacy default policy remains available; the owned settings supply the actual Fit margin. */
export const PROJECT_MASK_FIT_POLICY = Object.freeze({ ...PROJECT_MASK_DEFAULT_SETTINGS, grid: 8 })

/** Preserve the full requested margin; inward grid rounding would shrink it. No bitmap allocation. */
export function fitProjectMaskBbox(bounds: IgsRectV1, settings?: ProjectMaskSettings): IgsRectV1 {
  assertProjectMaskBounds(bounds)
  if (settings !== undefined && !v.is(ProjectMaskSettingsSchema, settings)) {
    throw new ProjectMaskError('MASK_INPUT_INVALID', 'The mask Fit settings are invalid.')
  }
  const resolved = resolveProjectMaskSettings(settings)
  const { blur, padding } = resolved
  const { grid } = PROJECT_MASK_FIT_POLICY
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
