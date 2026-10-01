import type { ProjectAcceptedResultView } from '../api.js'

/** Validate the projection transported over IPC without admitting paths or live settings. */
export function isProjectAcceptedResultView(value: unknown): value is ProjectAcceptedResultView {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const result = value as Record<string, unknown>
  return (
    typeof result.acceptedAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result.acceptedAt) &&
    Number.isFinite(Date.parse(result.acceptedAt)) &&
    new Date(result.acceptedAt).toISOString() === result.acceptedAt &&
    typeof result.layerId === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      result.layerId,
    ) &&
    typeof result.layerName === 'string' &&
    result.layerName.length > 0 &&
    typeof result.modelName === 'string' &&
    result.modelName.length > 0 &&
    typeof result.modelVersionName === 'string' &&
    result.modelVersionName.length > 0 &&
    typeof result.modelFileSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(result.modelFileSha256) &&
    isAcceptedResultImageUrl(result.imageUrl, result.layerId) &&
    typeof result.seed === 'number' &&
    Number.isInteger(result.seed) &&
    result.seed >= 0 &&
    result.seed <= 0xff_ff_ff_ff &&
    [result.width, result.height].every(
      (dimension) =>
        typeof dimension === 'number' &&
        Number.isInteger(dimension) &&
        dimension >= 8 &&
        dimension <= 2048 &&
        dimension % 8 === 0,
    )
  )
}

/** Main verifies the opaque MAC on resource access; preload checks resource shape and layer scope. */
function isAcceptedResultImageUrl(value: unknown, layerId: string): boolean {
  if (typeof value !== 'string') {
    return false
  }
  try {
    const url = new URL(value)
    const match =
      /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9]{64})\/([a-f0-9]{64})\.img$/i.exec(
        url.pathname,
      )
    return (
      url.protocol === 'igs-layer:' &&
      url.hostname === 'asset' &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      url.search === '' &&
      url.hash === '' &&
      match !== null &&
      match[3] === layerId
    )
  } catch {
    return false
  }
}
