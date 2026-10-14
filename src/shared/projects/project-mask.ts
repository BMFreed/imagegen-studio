import * as v from 'valibot'

import type { IgsRectV1 } from './project-schema.js'

/** Engineering limits for CPU mask authoring, independent of a model's generation limits. */
export const PROJECT_MASK_MAX_COORDINATE = 2_147_483_647
export const PROJECT_MASK_MAX_PIXELS = 4_000_000
export const PROJECT_MASK_MAX_DIMENSION = 4096
export const PROJECT_MASK_MAX_PNG_BYTES = 32 * 1024 * 1024
export const PROJECT_MASK_MAX_IDAT_CHUNKS = 256
export const PROJECT_MASK_MAX_EDIT_PIXEL_VISITS = 32_000_000
export const PROJECT_MASK_MAX_POINTS = 8192
export const PROJECT_MASK_DEFAULT_DIAMETER = 50
/** Input scale ceiling; transformed bounds and CPU work are checked independently in Main. */
export const PROJECT_MASK_MAX_TRANSFORM_SCALE = 10_000

const CoordinateSchema = v.pipe(
  v.number(),
  v.finite(),
  v.minValue(-PROJECT_MASK_MAX_COORDINATE),
  v.maxValue(PROJECT_MASK_MAX_COORDINATE),
)
const PointSchema = v.strictObject({ x: CoordinateSchema, y: CoordinateSchema })
const OperationSchema = v.picklist(['add', 'subtract'])
const PointsSchema = v.pipe(v.array(PointSchema), v.maxLength(PROJECT_MASK_MAX_POINTS))
const TransformScaleSchema = v.pipe(
  v.number(),
  v.finite(),
  v.minValue(Number.MIN_VALUE),
  v.maxValue(PROJECT_MASK_MAX_TRANSFORM_SCALE),
)
export const ProjectMaskTransformSchema = v.strictObject({
  rotationDegrees: v.pipe(v.number(), v.finite(), v.minValue(-360), v.maxValue(360)),
  scaleX: TransformScaleSchema,
  scaleY: TransformScaleSchema,
  x: CoordinateSchema,
  y: CoordinateSchema,
})

export type ProjectMaskTransform = v.InferOutput<typeof ProjectMaskTransformSchema>

export const ProjectMaskEditSchema = v.variant('kind', [
  v.strictObject({
    diameter: v.pipe(v.number(), v.finite(), v.minValue(1), v.maxValue(512)),
    kind: v.literal('brush'),
    operation: OperationSchema,
    points: v.pipe(PointsSchema, v.minLength(1)),
  }),
  v.strictObject({
    kind: v.literal('polygon'),
    operation: OperationSchema,
    points: v.pipe(PointsSchema, v.minLength(3)),
  }),
  v.strictObject({ kind: v.literal('clear') }),
  v.strictObject({ kind: v.literal('transform'), transform: ProjectMaskTransformSchema }),
  v.strictObject({ kind: v.literal('fit-bbox') }),
])

export type ProjectMaskEdit = v.InferOutput<typeof ProjectMaskEditSchema>
export interface ProjectMaskBitmap {
  alpha: Uint8Array
  /** One project pixel per stored alpha sample; this rect is independent of the Patch bbox. */
  bounds: IgsRectV1
}

export class ProjectMaskError extends Error {
  constructor(
    readonly code: 'MASK_IMAGE_INVALID' | 'MASK_INPUT_INVALID' | 'MASK_LIMIT',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectMaskError'
  }
}

export function parseProjectMaskEdit(input: unknown): ProjectMaskEdit {
  if (
    typeof input === 'object' &&
    input !== null &&
    'points' in input &&
    Array.isArray(input.points) &&
    input.points.length > PROJECT_MASK_MAX_POINTS
  ) {
    throw new ProjectMaskError('MASK_LIMIT', 'The mask gesture has too many points.')
  }
  const parsed = v.safeParse(ProjectMaskEditSchema, input)
  if (!parsed.success) {
    throw new ProjectMaskError('MASK_INPUT_INVALID', 'The mask edit is invalid.')
  }
  return parsed.output
}

export function assertProjectMaskDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > PROJECT_MASK_MAX_DIMENSION ||
    height > PROJECT_MASK_MAX_DIMENSION ||
    width * height > PROJECT_MASK_MAX_PIXELS
  ) {
    throw new ProjectMaskError('MASK_LIMIT', 'The mask exceeds the CPU authoring limits.')
  }
}

export function assertProjectMaskBounds(bounds: IgsRectV1): void {
  assertProjectMaskDimensions(bounds.width, bounds.height)
  for (const value of [bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height]) {
    if (!Number.isSafeInteger(value) || Math.abs(value) > PROJECT_MASK_MAX_COORDINATE) {
      throw new ProjectMaskError('MASK_LIMIT', 'The mask extends outside supported coordinates.')
    }
  }
}
