import type { IgsPreviewRectV1 } from './project-schema.js'

export type ProjectImageExportRegion = 'bbox' | 'canvas'

export type ProjectImageExportResult =
  { fileName: string; kind: 'exported'; rect: IgsPreviewRectV1 } | { kind: 'canceled' }

export function isProjectImageExportRegion(value: unknown): value is ProjectImageExportRegion {
  return value === 'canvas' || value === 'bbox'
}

/** The image limits are separate from inference/preview ceilings; no downsampling is implied. */
export function isProjectImageExportRect(value: unknown): value is IgsPreviewRectV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const rect = value as Record<string, unknown>
  return (
    Object.keys(rect).sort().join(',') === 'height,width,x,y' &&
    ['x', 'y', 'width', 'height'].every((key) => Number.isSafeInteger(rect[key])) &&
    Math.abs(rect['x'] as number) <= 2_200_000_000 &&
    Math.abs(rect['y'] as number) <= 2_200_000_000 &&
    (rect['width'] as number) >= 1 &&
    (rect['height'] as number) >= 1 &&
    (rect['width'] as number) <= 16_384 &&
    (rect['height'] as number) <= 16_384 &&
    (rect['width'] as number) * (rect['height'] as number) <= 64_000_000 &&
    (rect['x'] as number) + (rect['width'] as number) <= 2_200_000_000 &&
    (rect['y'] as number) + (rect['height'] as number) <= 2_200_000_000
  )
}

export function isProjectImageExportResult(value: unknown): value is ProjectImageExportResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const result = value as Record<string, unknown>
  return result['kind'] === 'canceled'
    ? Object.keys(result).join(',') === 'kind'
    : result['kind'] === 'exported' &&
        Object.keys(result).sort().join(',') === 'fileName,kind,rect' &&
        typeof result['fileName'] === 'string' &&
        result['fileName'].length > 4 &&
        !/[\\/\0]/.test(result['fileName']) &&
        result['fileName'].toLowerCase().endsWith('.png') &&
        isProjectImageExportRect(result['rect'])
}
