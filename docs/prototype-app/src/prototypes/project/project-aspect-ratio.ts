import type { ProjectAspectRatioId, ProjectAspectRatioState } from './project.types'

export const PROJECT_CANVAS_MIN = 64
export const PROJECT_CANVAS_MAX = 4096
export const PROJECT_CANVAS_GRID = 8

export const aspectRatioOptions: { label: string; value: ProjectAspectRatioId }[] = [
  'free',
  '8:1',
  '4:1',
  '21:9',
  '16:9',
  '3:2',
  '5:4',
  '4:3',
  '1:1',
  '3:4',
  '4:5',
  '2:3',
  '9:16',
  '1:4',
  '9:21',
  '1:8',
].map((value) => ({
  label: value === 'free' ? 'Free' : value,
  value: value as ProjectAspectRatioId,
}))

const inverse: Partial<Record<ProjectAspectRatioId, ProjectAspectRatioId>> = {
  '1:1': '1:1',
  '1:4': '4:1',
  '1:8': '8:1',
  '2:3': '3:2',
  '3:2': '2:3',
  '3:4': '4:3',
  '4:1': '1:4',
  '4:3': '3:4',
  '4:5': '5:4',
  '5:4': '4:5',
  '8:1': '1:8',
  '9:16': '16:9',
  '9:21': '21:9',
  '16:9': '9:16',
  '21:9': '9:21',
}

export function ratioValue(id: ProjectAspectRatioId, fallback: number) {
  if (id === 'free') {
    return fallback
  }
  const [width, height] = id.split(':').map(Number)
  return width! / height!
}

export function sizeForRatio(ratio: number, area: number) {
  return {
    height: normalize(Math.sqrt(area / ratio)),
    width: normalize(Math.sqrt(area * ratio)),
  }
}

export function constrainedDimension(value: number) {
  return Math.min(PROJECT_CANVAS_MAX, Math.max(PROJECT_CANVAS_MIN, Math.round(value)))
}

export function swapAspectRatio(state: ProjectAspectRatioState) {
  state.value = 1 / state.value
  if (state.id !== 'free') {
    state.id = inverse[state.id] ?? 'free'
  }
}

function normalize(value: number) {
  const snapped = Math.round(value / PROJECT_CANVAS_GRID) * PROJECT_CANVAS_GRID
  return Math.min(PROJECT_CANVAS_MAX, Math.max(PROJECT_CANVAS_MIN, snapped))
}
