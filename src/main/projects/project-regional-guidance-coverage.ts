import {
  assertProjectMaskBounds,
  PROJECT_MASK_MAX_COORDINATE,
  type ProjectMaskBitmap,
  ProjectMaskError,
} from '../../shared/projects/project-mask.js'
import type { IgsRectV1 } from '../../shared/projects/project-schema.js'

export type ProjectRegionalGuidanceCoverage = {
  alpha: Uint8Array
  bounds: IgsRectV1
} & (
  | { intersection: IgsRectV1; kind: 'covered' | 'intersecting-empty' }
  | { intersection: null; kind: 'empty' | 'outside' }
)

/** Integer world clipping only; output owns its bytes and preserves every alpha8 sample. */
export function projectRegionalGuidanceCoverage(
  mask: ProjectMaskBitmap | null,
  target: IgsRectV1,
): ProjectRegionalGuidanceCoverage {
  assertTarget(target)
  if (mask !== null) {
    assertOwnedMask(mask)
  }
  const bounds = { ...target }
  const alpha = new Uint8Array(bounds.width * bounds.height)
  if (mask === null) {
    return { alpha, bounds, intersection: null, kind: 'empty' }
  }
  const x = Math.max(bounds.x, mask.bounds.x)
  const y = Math.max(bounds.y, mask.bounds.y)
  const right = Math.min(bounds.x + bounds.width, mask.bounds.x + mask.bounds.width)
  const bottom = Math.min(bounds.y + bounds.height, mask.bounds.y + mask.bounds.height)
  if (right <= x || bottom <= y) {
    return { alpha, bounds, intersection: null, kind: 'outside' }
  }
  const intersection = { height: bottom - y, width: right - x, x, y }
  let covered = false
  for (let row = y; row < bottom; row++) {
    const sourceIndex = (row - mask.bounds.y) * mask.bounds.width + x - mask.bounds.x
    const targetIndex = (row - bounds.y) * bounds.width + x - bounds.x
    for (let column = 0; column < intersection.width; column++) {
      alpha[targetIndex + column] = mask.alpha[sourceIndex + column]!
      covered ||= alpha[targetIndex + column] !== 0
    }
  }
  return { alpha, bounds, intersection, kind: covered ? 'covered' : 'intersecting-empty' }
}

/** Match the finite CPU compositor, including its coordinate-origin ceiling. */
function assertTarget(target: IgsRectV1): void {
  if (typeof target !== 'object' || target === null || Array.isArray(target)) {
    throw new ProjectMaskError('MASK_INPUT_INVALID', 'The regional coverage target is invalid.')
  }
  const { height, width, x, y } = target
  if (
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y) ||
    Math.abs(x) > PROJECT_MASK_MAX_COORDINATE ||
    Math.abs(y) > PROJECT_MASK_MAX_COORDINATE ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 2048 ||
    height > 2048 ||
    width * height > 4_000_000
  ) {
    throw new ProjectMaskError('MASK_LIMIT', 'The regional coverage target exceeds CPU limits.')
  }
}

function assertOwnedMask(mask: ProjectMaskBitmap): void {
  if (
    typeof mask !== 'object' ||
    mask === null ||
    Array.isArray(mask) ||
    typeof mask.bounds !== 'object' ||
    mask.bounds === null ||
    Array.isArray(mask.bounds)
  ) {
    throw new ProjectMaskError('MASK_IMAGE_INVALID', 'The owned regional mask is invalid.')
  }
  assertProjectMaskBounds(mask.bounds)
  const { alpha, bounds } = mask
  if (!(alpha instanceof Uint8Array) || alpha.length !== bounds.width * bounds.height) {
    throw new ProjectMaskError('MASK_IMAGE_INVALID', 'The mask coverage length is invalid.')
  }
  let left = false
  let right = false
  for (let row = 0; row < bounds.height; row++) {
    left ||= alpha[row * bounds.width] !== 0
    right ||= alpha[(row + 1) * bounds.width - 1] !== 0
  }
  if (
    !left ||
    !right ||
    !alpha.subarray(0, bounds.width).some((value) => value !== 0) ||
    !alpha.subarray(alpha.length - bounds.width).some((value) => value !== 0)
  ) {
    throw new ProjectMaskError(
      'MASK_IMAGE_INVALID',
      'The mask coverage must have nonempty tight bounds.',
    )
  }
}
