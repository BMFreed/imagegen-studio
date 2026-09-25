import type { ProjectRasterLayerView } from '../../shared/api.js'
import type { IgsRectV1 } from '../../shared/projects/project-schema.js'

export interface CanvasCamera {
  scale: number
  x: number
  y: number
}

export interface CanvasSize {
  height: number
  width: number
}

export interface WorldBounds {
  bottom: number
  left: number
  right: number
  top: number
}

export const MIN_CANVAS_SCALE = 0.000_000_01
export const MAX_CANVAS_SCALE = 8

export function rectBounds(rect: IgsRectV1): WorldBounds {
  return {
    bottom: rect.y + rect.height,
    left: rect.x,
    right: rect.x + rect.width,
    top: rect.y,
  }
}

export function rasterBounds(layer: ProjectRasterLayerView): WorldBounds {
  const { height, width } = layer
  const { rotationDegrees, scaleX, scaleY, x, y } = layer.transform
  const radians = (rotationDegrees * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ].map(([localX = 0, localY = 0]) => ({
    x: normalizeCoordinate(x + localX * scaleX * cosine - localY * scaleY * sine),
    y: normalizeCoordinate(y + localX * scaleX * sine + localY * scaleY * cosine),
  }))
  return {
    bottom: Math.max(...corners.map((corner) => corner.y)),
    left: Math.min(...corners.map((corner) => corner.x)),
    right: Math.max(...corners.map((corner) => corner.x)),
    top: Math.min(...corners.map((corner) => corner.y)),
  }
}

/** Hidden layers do not affect Fit View; the project bbox is the empty-scene fallback. */
export function fitTargetBounds(
  layers: readonly ProjectRasterLayerView[],
  bbox: IgsRectV1,
): WorldBounds {
  const visible = layers.filter((layer) => layer.visible && layer.opacity > 0)
  if (visible.length === 0) {
    return rectBounds(bbox)
  }
  return visible.map(rasterBounds).reduce((union, bounds) => ({
    bottom: Math.max(union.bottom, bounds.bottom),
    left: Math.min(union.left, bounds.left),
    right: Math.max(union.right, bounds.right),
    top: Math.min(union.top, bounds.top),
  }))
}

export function fitCamera(bounds: WorldBounds, viewport: CanvasSize, padding = 64): CanvasCamera {
  const contentWidth = Math.max(1, bounds.right - bounds.left)
  const contentHeight = Math.max(1, bounds.bottom - bounds.top)
  const usableWidth = Math.max(1, viewport.width - padding * 2)
  const usableHeight = Math.max(1, viewport.height - padding * 2)
  const scale = Math.min(
    1,
    Math.max(MIN_CANVAS_SCALE, Math.min(usableWidth / contentWidth, usableHeight / contentHeight)),
  )
  return {
    scale,
    x: viewport.width / 2 - ((bounds.left + bounds.right) / 2) * scale,
    y: viewport.height / 2 - ((bounds.top + bounds.bottom) / 2) * scale,
  }
}

/** Keep the world point under a screen point fixed while zooming. */
export function zoomCameraAt(
  camera: CanvasCamera,
  scale: number,
  screenX: number,
  screenY: number,
): CanvasCamera {
  const nextScale = Math.max(MIN_CANVAS_SCALE, Math.min(MAX_CANVAS_SCALE, scale))
  const worldX = (screenX - camera.x) / camera.scale
  const worldY = (screenY - camera.y) / camera.scale
  return {
    scale: nextScale,
    x: screenX - worldX * nextScale,
    y: screenY - worldY * nextScale,
  }
}

function normalizeCoordinate(value: number): number {
  const integer = Math.round(value)
  return Math.abs(value - integer) < 1e-8 ? integer : value
}
