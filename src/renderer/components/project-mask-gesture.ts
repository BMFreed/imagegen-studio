import type { ProjectSmartPatchMaskEditRequest } from '../../shared/api.js'
import {
  PROJECT_MASK_MAX_COORDINATE,
  PROJECT_MASK_MAX_POINTS,
  type ProjectMaskEdit,
} from '../../shared/projects/project-mask.js'

import type { CanvasCamera } from './project-canvas-geometry.js'

export type MaskPoint = { x: number; y: number }
export type MaskTool = 'brush' | 'eraser' | 'lasso' | 'polygon-lasso'
export type MaskOperation = 'add' | 'subtract'
export interface MaskGestureOwner {
  documentId: string
  documentRevision: string
  layerId: string
  maskId: string
  maskRevision: number
  projectKey: string
}

/** No selection lookup and no per-move IPC: the whole gesture has one immutable owner. */
export class ProjectMaskGesture {
  readonly diameter: number
  readonly operation: MaskOperation
  readonly owner: Readonly<MaskGestureOwner>
  readonly tool: MaskTool
  get points(): readonly MaskPoint[] {
    return this.samples
  }
  private ended = false

  private samples: MaskPoint[] = []

  constructor(owner: MaskGestureOwner, tool: MaskTool, operation: MaskOperation, diameter: number) {
    this.owner = Object.freeze({ ...owner })
    this.tool = tool
    this.operation = tool === 'eraser' ? 'subtract' : tool === 'brush' ? 'add' : operation
    this.diameter = diameter
    if (!Number.isFinite(diameter) || diameter < 1 || diameter > 512) {
      throw new Error('Choose a mask brush size from 1 to 512 pixels.')
    }
  }

  append(point: MaskPoint): boolean {
    if (this.ended) {
      return false
    }
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      Math.abs(point.x) > PROJECT_MASK_MAX_COORDINATE ||
      Math.abs(point.y) > PROJECT_MASK_MAX_COORDINATE
    ) {
      throw new Error('The mask gesture extends outside supported coordinates.')
    }
    const previous = this.samples.at(-1)
    if (previous?.x === point.x && previous.y === point.y) {
      return false
    }
    if (this.samples.length >= PROJECT_MASK_MAX_POINTS) {
      throw new Error('The mask gesture has too many points. Use a shorter gesture.')
    }
    this.samples.push({ ...point })
    return true
  }

  cancel(): void {
    this.ended = true
    this.samples = []
  }

  finish(owner: MaskGestureOwner | null): ProjectSmartPatchMaskEditRequest | null {
    if (this.ended) {
      return null
    }
    this.ended = true
    if (!sameMaskGestureOwner(this.owner, owner)) {
      return null
    }
    const points = this.samples.map((point) => ({ ...point }))
    let edit: ProjectMaskEdit
    if (this.tool === 'brush' || this.tool === 'eraser') {
      if (points.length === 0) {
        return null
      }
      edit = { diameter: this.diameter, kind: 'brush', operation: this.operation, points }
    } else {
      if (new Set(points.map(({ x, y }) => `${x},${y}`)).size < 3) {
        return null
      }
      edit = { kind: 'polygon', operation: this.operation, points }
    }
    return {
      documentId: this.owner.documentId,
      documentRevision: this.owner.documentRevision,
      edit,
      maskId: this.owner.maskId,
      maskRevision: this.owner.maskRevision,
    }
  }
}

/** Browser client coordinates are converted once, before entering an owned gesture. */
export function maskWorldPoint(
  point: { clientX: number; clientY: number },
  canvas: { left: number; top: number },
  camera: CanvasCamera,
): MaskPoint {
  return {
    x: (point.clientX - canvas.left - camera.x) / camera.scale,
    y: (point.clientY - canvas.top - camera.y) / camera.scale,
  }
}

export function sameMaskGestureOwner(
  left: MaskGestureOwner,
  right: MaskGestureOwner | null,
): boolean {
  return (
    right !== null &&
    left.projectKey === right.projectKey &&
    left.documentId === right.documentId &&
    left.documentRevision === right.documentRevision &&
    left.layerId === right.layerId &&
    left.maskId === right.maskId &&
    left.maskRevision === right.maskRevision
  )
}
