import type { ProjectAcceptedResultView, ProjectLayerView, ProjectTab } from '../api.js'

export type ProjectAcceptedResultTarget =
  | { kind: 'raster'; layerId: string }
  | { kind: 'smart-patch-variant'; layerId: string; variantId: string }

/** Current containment owns a result; historical provenance and the active image do not. */
export function projectAcceptedResultOwners(
  layers: readonly ProjectLayerView[],
): Map<string, ProjectAcceptedResultTarget> | null {
  const identities = new Set<string>()
  const owners = new Map<string, ProjectAcceptedResultTarget>()
  const claim = (id: string) => {
    if (identities.has(id)) {
      return false
    }
    identities.add(id)
    return true
  }
  for (const layer of layers) {
    if (!claim(layer.id)) {
      return null
    }
    if (layer.kind !== 'smart-patch') {
      owners.set(layer.id, { kind: 'raster', layerId: layer.id })
      continue
    }
    if (!claim(layer.mask.id)) {
      return null
    }
    for (const variant of layer.rasterSubLayers) {
      if (!claim(variant.id)) {
        return null
      }
      owners.set(variant.id, {
        kind: 'smart-patch-variant',
        layerId: layer.id,
        variantId: variant.id,
      })
    }
  }
  return owners
}

/** Main verifies the MAC; consumers bind the public resource identity to the current document. */
export function projectAcceptedResultImageIdentity(value: unknown): {
  assetSha256: string
  documentRevision: string
  layerId: string
  projectKey: string
} | null {
  if (typeof value !== 'string') {
    return null
  }
  try {
    const url = new URL(value)
    const match =
      /^\/(project-v1-[a-f0-9]{64})\/([a-fA-F0-9-]{36})\/([a-fA-F0-9-]{36})\/([a-f0-9]{64})\/([a-f0-9]{64})\.img$/.exec(
        url.pathname,
      )
    if (
      url.protocol !== 'igs-layer:' ||
      url.hostname !== 'asset' ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !match
    ) {
      return null
    }
    const [, projectKey, documentRevision, layerId, assetSha256] = match
    if (!projectKey || !documentRevision || !layerId || !assetSha256) {
      return null
    }
    return { assetSha256, documentRevision, layerId, projectKey }
  } catch {
    return null
  }
}

/** The actual preload ownership guard, shared so its rejection boundary is directly testable. */
export function isProjectAcceptedResults(
  value: unknown,
  tab: Pick<ProjectTab, 'documentRevision' | 'id' | 'layers'>,
): value is ProjectAcceptedResultView[] {
  if (!Array.isArray(value)) {
    return false
  }
  const owners = projectAcceptedResultOwners(tab.layers)
  if (
    !owners ||
    value.length > owners.size ||
    !value.every(isProjectAcceptedResultView) ||
    new Set(value.map(({ layerId }) => layerId)).size !== value.length
  ) {
    return false
  }
  const layers = new Map(tab.layers.map((layer) => [layer.id, layer]))
  const names = new Map(
    tab.layers.flatMap((layer) =>
      layer.kind === 'smart-patch'
        ? layer.rasterSubLayers.map((variant) => [variant.id, variant.name] as const)
        : [[layer.id, layer.name] as const],
    ),
  )
  return value.every((result) => {
    const owner = owners.get(result.layerId)
    const layer = owner && layers.get(owner.layerId)
    const image = projectAcceptedResultImageIdentity(result.imageUrl)
    if (
      !owner ||
      !layer ||
      !image ||
      image.projectKey !== tab.id ||
      image.documentRevision !== tab.documentRevision ||
      image.layerId !== result.layerId
    ) {
      return false
    }
    if (owner.kind === 'raster') {
      return (
        layer.kind !== 'smart-patch' &&
        layer.name === result.layerName &&
        layer.imageUrl === result.imageUrl
      )
    }
    return layer.kind === 'smart-patch' && names.get(owner.variantId) === result.layerName
  })
}

/** Validate the projection transported over IPC without admitting paths or live settings. */
export function isProjectAcceptedResultView(value: unknown): value is ProjectAcceptedResultView {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const result = value as Record<string, unknown>
  return (
    typeof result['acceptedAt'] === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result['acceptedAt']) &&
    Number.isFinite(Date.parse(result['acceptedAt'])) &&
    new Date(result['acceptedAt']).toISOString() === result['acceptedAt'] &&
    typeof result['layerId'] === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      result['layerId'],
    ) &&
    typeof result['layerName'] === 'string' &&
    result['layerName'].length > 0 &&
    typeof result['modelName'] === 'string' &&
    result['modelName'].length > 0 &&
    typeof result['modelVersionName'] === 'string' &&
    result['modelVersionName'].length > 0 &&
    typeof result['modelFileSha256'] === 'string' &&
    /^[a-f0-9]{64}$/.test(result['modelFileSha256']) &&
    projectAcceptedResultImageIdentity(result['imageUrl'])?.layerId === result['layerId'] &&
    typeof result['seed'] === 'number' &&
    Number.isInteger(result['seed']) &&
    result['seed'] >= 0 &&
    result['seed'] <= 0xff_ff_ff_ff &&
    [result['width'], result['height']].every(
      (dimension) =>
        typeof dimension === 'number' &&
        Number.isInteger(dimension) &&
        dimension >= 1 &&
        dimension <= 2048,
    )
  )
}
