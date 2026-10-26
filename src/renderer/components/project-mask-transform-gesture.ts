import type { ProjectSmartPatchMaskEditRequest } from '../../shared/api.js'
import {
  assertProjectMaskBounds,
  parseProjectMaskEdit,
  type ProjectMaskEdit,
  type ProjectMaskTransform,
} from '../../shared/projects/project-mask.js'
import type { IgsRectV1 } from '../../shared/projects/project-schema.js'

import { type MaskGestureOwner, sameMaskGestureOwner } from './project-mask-gesture.js'

export type ProjectMaskTransformRequest = Omit<ProjectSmartPatchMaskEditRequest, 'edit'> & {
  edit: Extract<ProjectMaskEdit, { kind: 'transform' }>
}

/** A local affine preview is submitted once, with the owner captured before its first move. */
export class ProjectMaskTransformGesture {
  readonly bounds: Readonly<IgsRectV1>
  readonly owner: Readonly<MaskGestureOwner>
  get transform(): Readonly<ProjectMaskTransform> {
    return this.preview
  }
  private ended = false

  private preview: Readonly<ProjectMaskTransform>

  constructor(owner: MaskGestureOwner, bounds: IgsRectV1) {
    assertProjectMaskBounds(bounds)
    this.owner = Object.freeze({ ...owner })
    this.bounds = Object.freeze({ ...bounds })
    this.preview = Object.freeze({
      rotationDegrees: 0,
      scaleX: 1,
      scaleY: 1,
      x: bounds.x,
      y: bounds.y,
    })
  }

  cancel(): void {
    this.ended = true
  }

  finish(owner: MaskGestureOwner | null): ProjectMaskTransformRequest | null {
    if (this.ended) {
      return null
    }
    this.ended = true
    if (!sameMaskGestureOwner(this.owner, owner)) {
      return null
    }
    const transform = this.preview
    if (
      transform.x === this.bounds.x &&
      transform.y === this.bounds.y &&
      transform.scaleX === 1 &&
      transform.scaleY === 1 &&
      transform.rotationDegrees === 0
    ) {
      return null
    }
    return {
      documentId: this.owner.documentId,
      documentRevision: this.owner.documentRevision,
      edit: { kind: 'transform', transform: { ...transform } },
      maskId: this.owner.maskId,
      maskRevision: this.owner.maskRevision,
    }
  }

  update(transform: ProjectMaskTransform): boolean {
    if (this.ended) {
      return false
    }
    const rotationDegrees = Number.isFinite(transform.rotationDegrees)
      ? ((transform.rotationDegrees % 360) + 360) % 360
      : transform.rotationDegrees
    const edit = parseProjectMaskEdit({
      kind: 'transform',
      transform: {
        rotationDegrees,
        scaleX: exactIntegerWhenNear(transform.scaleX),
        scaleY: exactIntegerWhenNear(transform.scaleY),
        x: exactIntegerWhenNear(transform.x),
        y: exactIntegerWhenNear(transform.y),
      },
    })
    if (edit.kind !== 'transform') {
      throw new Error('The mask transform is invalid.')
    }
    this.preview = Object.freeze({ ...edit.transform })
    return true
  }
}

export function projectMaskFitRequest(owner: MaskGestureOwner): ProjectSmartPatchMaskEditRequest {
  return {
    documentId: owner.documentId,
    documentRevision: owner.documentRevision,
    edit: parseProjectMaskEdit({ kind: 'fit-bbox' }),
    maskId: owner.maskId,
    maskRevision: owner.maskRevision,
  }
}

/** The interactive transform ends on whole project pixels; the command API still accepts fractions. */
export function snapProjectMaskTransformToPixelGrid(
  transform: ProjectMaskTransform,
  bounds: Readonly<IgsRectV1>,
): ProjectMaskTransform {
  assertProjectMaskBounds(bounds)
  const edit = parseProjectMaskEdit({ kind: 'transform', transform })
  if (edit.kind !== 'transform') {
    throw new Error('The mask transform is invalid.')
  }
  return {
    rotationDegrees: edit.transform.rotationDegrees,
    scaleX: Math.max(1, Math.round(bounds.width * edit.transform.scaleX)) / bounds.width,
    scaleY: Math.max(1, Math.round(bounds.height * edit.transform.scaleY)) / bounds.height,
    x: Math.round(edit.transform.x),
    y: Math.round(edit.transform.y),
  }
}

/** Remove Konva matrix roundoff without quantizing intentional fractional geometry. */
function exactIntegerWhenNear(value: number): number {
  const nearest = Math.round(value)
  return Number.isFinite(value) && Math.abs(value - nearest) <= 1e-10 ? nearest : value
}
