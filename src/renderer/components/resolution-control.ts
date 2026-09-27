export const aspectRatios = [
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
] as const

export type AspectRatioId = (typeof aspectRatios)[number]
export interface AspectRatioState {
  id: AspectRatioId
  locked: boolean
  value: number
}
export interface ResolutionSize {
  height: number | null
  width: number | null
}
export interface ResolutionLimits {
  max: number
  min: number
  step: number
}

export const aspectRatioOptions = aspectRatios.map((value) => ({
  label: value === 'free' ? 'Free' : value,
  value,
}))

export function ratioValue(id: AspectRatioId, fallback: number) {
  if (id === 'free') {
    return fallback
  }
  const [width, height] = id.split(':').map(Number)
  return width! / height!
}

export function inverseRatio(id: AspectRatioId): AspectRatioId {
  if (id === 'free') {
    return id
  }
  const inverse = id.split(':').reverse().join(':')
  return aspectRatios.find((candidate) => candidate === inverse) ?? 'free'
}

/** Keep the requested area where possible; fit both sides together at the limits. */
export function sizeForAspectRatio(ratio: number, area: number, limits: ResolutionLimits) {
  const height = Math.min(
    limits.max,
    limits.max / ratio,
    Math.max(limits.min, limits.min / ratio, Math.sqrt(area / ratio)),
  )
  const snap = (value: number) =>
    Math.max(limits.min, Math.min(limits.max, Math.round(value / limits.step) * limits.step))
  return { height: snap(height), width: snap(height * ratio) }
}

export function resizeDimension(
  size: ResolutionSize,
  key: 'height' | 'width',
  value: number | null,
  aspect: AspectRatioState,
  limits: ResolutionLimits,
): ResolutionSize {
  if (value === null) {
    return { ...size, [key]: null }
  }
  const clamp = (input: number) => Math.max(limits.min, Math.min(limits.max, Math.round(input)))
  const next = { ...size, [key]: clamp(value) }
  if (aspect.locked) {
    // Limit the edited side too, so the paired dimension never silently breaks the lock.
    if (key === 'width') {
      next.width = clamp(
        Math.min(limits.max * aspect.value, Math.max(limits.min * aspect.value, value)),
      )
      next.height = clamp(next.width / aspect.value)
    } else {
      next.height = clamp(
        Math.min(limits.max / aspect.value, Math.max(limits.min / aspect.value, value)),
      )
      next.width = clamp(next.height * aspect.value)
    }
  }
  return next
}
