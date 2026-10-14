import {
  assertProjectMaskBounds,
  parseProjectMaskEdit,
  PROJECT_MASK_MAX_EDIT_PIXEL_VISITS,
  type ProjectMaskBitmap,
  type ProjectMaskEdit,
  ProjectMaskError,
  type ProjectMaskTransform,
} from '../../shared/projects/project-mask.js'
import type { IgsRectV1 } from '../../shared/projects/project-schema.js'

type TransformEdit = Extract<ProjectMaskEdit, { kind: 'transform' }>
type Rotation = { cosine: number; quarter: number | null; sine: number }
const sampleOffsets = [0.25, 0.75] as const

/**
 * Bake an owned mask into the world pixel grid. Ordinary transforms use four inverse-mapped
 * bilinear alpha samples per world pixel, with a transparent rectangle exterior. Source sample
 * centers are local (column+.5,row+.5); interpolation clamps at the source rectangle's edges.
 * Integer unit translations/quarter turns remap exact bytes without filtering. This deterministic
 * CPU policy does not promise pixel parity with browser canvas or Invoke's optional ML smoothing.
 */
export function applyProjectMaskTransform(
  current: ProjectMaskBitmap | null,
  input: TransformEdit,
): ProjectMaskBitmap {
  const edit = parseProjectMaskEdit(input)
  if (edit.kind !== 'transform') {
    throw new ProjectMaskError('MASK_INPUT_INVALID', 'The mask transform is invalid.')
  }
  if (!current) {
    throw new ProjectMaskError('MASK_INPUT_INVALID', 'There is no mask to transform.')
  }
  assertProjectMaskBounds(current.bounds)
  const transform = edit.transform
  const rotation = normalizedRotation(transform.rotationDegrees)
  const target = transformedBounds(current.bounds, transform, rotation)
  assertProjectMaskBounds(target)
  const exact =
    transform.scaleX === 1 &&
    transform.scaleY === 1 &&
    Number.isInteger(transform.x) &&
    Number.isInteger(transform.y) &&
    rotation.quarter !== null
  const visits =
    current.bounds.width * current.bounds.height * 2 +
    (exact ? 0 : target.width * target.height * 19)
  if (!Number.isSafeInteger(visits) || visits > PROJECT_MASK_MAX_EDIT_PIXEL_VISITS) {
    throw new ProjectMaskError('MASK_LIMIT', 'The mask transform exceeds the CPU work limit.')
  }
  assertTightCoverage(current)
  if (exact) {
    return exactQuarterTurn(current, target, rotation.quarter!)
  }

  const alpha = new Uint8Array(target.width * target.height)
  for (let row = 0; row < target.height; row++) {
    for (let column = 0; column < target.width; column++) {
      let coverage = 0
      for (const offsetY of sampleOffsets) {
        for (const offsetX of sampleOffsets) {
          const dx = target.x + column + offsetX - transform.x
          const dy = target.y + row + offsetY - transform.y
          const x = (rotation.cosine * dx + rotation.sine * dy) / transform.scaleX
          const y = (-rotation.sine * dx + rotation.cosine * dy) / transform.scaleY
          coverage += sampleCoverage(current, x, y)
        }
      }
      alpha[row * target.width + column] = Math.round(coverage / 4)
    }
  }
  return cropCoverage(target, alpha)
}

function normalizedRotation(degrees: number): Rotation {
  const angle = ((degrees % 360) + 360) % 360
  const nearestQuarter = Math.round(angle / 90)
  if (Math.abs(angle - nearestQuarter * 90) <= 1e-10) {
    const quarter = nearestQuarter % 4
    return {
      cosine: [1, 0, -1, 0][quarter],
      quarter,
      sine: [0, 1, 0, -1][quarter],
    }
  }
  const radians = (angle * Math.PI) / 180
  return { cosine: Math.cos(radians), quarter: null, sine: Math.sin(radians) }
}

function transformedBounds(
  source: IgsRectV1,
  transform: ProjectMaskTransform,
  rotation: Rotation,
): IgsRectV1 {
  const corners = [
    [0, 0],
    [source.width, 0],
    [0, source.height],
    [source.width, source.height],
  ].map(([x, y]) => ({
    x: transform.x + x * transform.scaleX * rotation.cosine - y * transform.scaleY * rotation.sine,
    y: transform.y + x * transform.scaleX * rotation.sine + y * transform.scaleY * rotation.cosine,
  }))
  const x = Math.floor(Math.min(...corners.map((corner) => corner.x)))
  const y = Math.floor(Math.min(...corners.map((corner) => corner.y)))
  const right = Math.ceil(Math.max(...corners.map((corner) => corner.x)))
  const bottom = Math.ceil(Math.max(...corners.map((corner) => corner.y)))
  if (right <= x || bottom <= y) {
    throw new ProjectMaskError(
      'MASK_INPUT_INVALID',
      'The mask transform is too small to retain coverage.',
    )
  }
  return { height: bottom - y, width: right - x, x, y }
}

function assertTightCoverage(bitmap: ProjectMaskBitmap): void {
  const { alpha, bounds } = bitmap
  if (!(alpha instanceof Uint8Array) || alpha.length !== bounds.width * bounds.height) {
    throw new ProjectMaskError('MASK_IMAGE_INVALID', 'The mask coverage length is invalid.')
  }
  let bottom = false
  let left = false
  let right = false
  let top = false
  for (let row = 0; row < bounds.height; row++) {
    for (let column = 0; column < bounds.width; column++) {
      if (alpha[row * bounds.width + column] === 0) {
        continue
      }
      top ||= row === 0
      bottom ||= row === bounds.height - 1
      left ||= column === 0
      right ||= column === bounds.width - 1
    }
  }
  if (!top || !bottom || !left || !right) {
    throw new ProjectMaskError(
      'MASK_IMAGE_INVALID',
      'The mask coverage must have nonempty tight bounds.',
    )
  }
}

function exactQuarterTurn(
  current: ProjectMaskBitmap,
  bounds: IgsRectV1,
  quarter: number,
): ProjectMaskBitmap {
  const alpha = new Uint8Array(current.alpha.length)
  const { height, width } = current.bounds
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const x =
        quarter === 0
          ? column
          : quarter === 1
            ? height - 1 - row
            : quarter === 2
              ? width - 1 - column
              : row
      const y =
        quarter === 0
          ? row
          : quarter === 1
            ? column
            : quarter === 2
              ? height - 1 - row
              : width - 1 - column
      alpha[y * bounds.width + x] = current.alpha[row * width + column]
    }
  }
  return { alpha, bounds }
}

function sampleCoverage(bitmap: ProjectMaskBitmap, inputX: number, inputY: number): number {
  const { height, width } = bitmap.bounds
  // Equal mathematical edges can differ by tiny trig roundoff. Preserve half-open rect semantics.
  const x = snapLocalEdge(inputX, width)
  const y = snapLocalEdge(inputY, height)
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return 0
  }
  const sampleX = x - 0.5
  const sampleY = y - 0.5
  const left = Math.floor(sampleX)
  const top = Math.floor(sampleY)
  const fractionX = sampleX - left
  const fractionY = sampleY - top
  const x0 = Math.max(0, Math.min(width - 1, left))
  const x1 = Math.max(0, Math.min(width - 1, left + 1))
  const y0 = Math.max(0, Math.min(height - 1, top))
  const y1 = Math.max(0, Math.min(height - 1, top + 1))
  const topCoverage =
    bitmap.alpha[y0 * width + x0] * (1 - fractionX) + bitmap.alpha[y0 * width + x1] * fractionX
  const bottomCoverage =
    bitmap.alpha[y1 * width + x0] * (1 - fractionX) + bitmap.alpha[y1 * width + x1] * fractionX
  return topCoverage * (1 - fractionY) + bottomCoverage * fractionY
}

function snapLocalEdge(value: number, size: number): number {
  if (Math.abs(value) <= 1e-10) {
    return 0
  }
  return Math.abs(value - size) <= 1e-10 ? size : value
}

function cropCoverage(bounds: IgsRectV1, input: Uint8Array): ProjectMaskBitmap {
  let top = bounds.height
  let left = bounds.width
  let right = -1
  let bottom = -1
  for (let row = 0; row < bounds.height; row++) {
    for (let column = 0; column < bounds.width; column++) {
      if (input[row * bounds.width + column] === 0) {
        continue
      }
      top = Math.min(top, row)
      bottom = Math.max(bottom, row)
      left = Math.min(left, column)
      right = Math.max(right, column)
    }
  }
  if (right < left || bottom < top) {
    throw new ProjectMaskError(
      'MASK_INPUT_INVALID',
      'The mask transform would discard all coverage.',
    )
  }
  if (left === 0 && top === 0 && right === bounds.width - 1 && bottom === bounds.height - 1) {
    return { alpha: input, bounds }
  }
  const width = right - left + 1
  const height = bottom - top + 1
  const alpha = new Uint8Array(width * height)
  for (let row = 0; row < height; row++) {
    alpha.set(
      input.subarray((row + top) * bounds.width + left, (row + top) * bounds.width + right + 1),
      row * width,
    )
  }
  return { alpha, bounds: { height, width, x: bounds.x + left, y: bounds.y + top } }
}
