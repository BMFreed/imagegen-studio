import {
  REGIONAL_REFERENCE_MAX_BYTES,
  REGIONAL_REFERENCE_MAX_IMAGES,
  REGIONAL_REFERENCE_MAX_PIXELS,
  REGIONAL_REFERENCE_MAX_SIDE,
  REGIONAL_REFERENCE_MAX_TOTAL_BYTES,
  type RegionalReferenceInferenceMode,
  regionalReferenceProfileForMode,
} from '../../shared/projects/regional-reference-inference.js'

import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type { VerifiedRegionalReferenceResources } from '../runtime/inference-auxiliary-resources.js'
import type { CurrentCanvasRegionalRecipe } from './project-current-canvas-regional-recipe.js'
import type { CapturedRegionalGuidanceInput } from './project-regional-guidance-input.js'
import type { RegionalWorkerInput } from './regional-worker-request.js'

export type CapturedCurrentCanvasRegionalReferences = NonNullable<RegionalWorkerInput['references']>

/**
 * Invoke 4875d965 prepareCanvasInvocation.ts → addRegionalGuidance.ts preserves each original
 * image's owner/order, including identical pixels and zero masks. The existing coherent capture
 * owns asset verification and lease lifetime; never read a thumbnail, source raster or live .igs.
 */
export async function captureCurrentCanvasRegionalReferences(input: {
  capture: CapturedRegionalGuidanceInput
  mode: RegionalReferenceInferenceMode
  recipe: CurrentCanvasRegionalRecipe
  resources: VerifiedRegionalReferenceResources
}): Promise<CapturedCurrentCanvasRegionalReferences> {
  const snapshot = structuredClone(input.capture.snapshot)
  const recipe = structuredClone(input.recipe)
  const assets = structuredClone(input.capture.assets)
  const readAsset = input.capture.readAsset.bind(input.capture)
  const resources = structuredClone(input.resources)
  const profile = regionalReferenceProfileForMode(input.mode)
  const regions = (snapshot.regionalGuidance ?? []).filter((region) => region.enabled)
  if (
    recipe.family !== 'illustrious' ||
    recipe.documentId !== snapshot.documentId ||
    recipe.documentRevision !== snapshot.documentRevision ||
    !isDeepStrictEqual(
      recipe.regions.map((region) => ({
        id: region.regionId,
        references: region.referenceImages ?? [],
      })),
      regions.map((region) => ({ id: region.id, references: region.referenceImages ?? [] })),
    )
  ) {
    throw new Error('The regional reference owners differ from the captured recipe.')
  }
  const references = regions.flatMap((region) =>
    (region.referenceImages ?? []).map((reference) => ({ reference, regionId: region.id })),
  )
  if (
    references.length < 1 ||
    references.length > REGIONAL_REFERENCE_MAX_IMAGES ||
    references.reduce((sum, { reference }) => sum + reference.asset.bytes, 0) >
      REGIONAL_REFERENCE_MAX_TOTAL_BYTES
  ) {
    throw new Error('The captured regional references exceed the finite image budget.')
  }
  for (const { reference, regionId } of references) {
    const image = reference.asset
    if (
      image.bytes < 1 ||
      image.bytes > REGIONAL_REFERENCE_MAX_BYTES ||
      image.width < 1 ||
      image.height < 1 ||
      image.width > REGIONAL_REFERENCE_MAX_SIDE ||
      image.height > REGIONAL_REFERENCE_MAX_SIDE ||
      image.width * image.height > REGIONAL_REFERENCE_MAX_PIXELS ||
      assets.filter(
        (asset) =>
          asset.role === 'image' &&
          asset.regionId === regionId &&
          asset.referenceId === reference.id &&
          isDeepStrictEqual(asset.member, image),
      ).length !== 1
    ) {
      throw new Error('The original regional reference image is not owned by this capture.')
    }
  }
  const images: CapturedCurrentCanvasRegionalReferences['images'] = []
  for (const { reference, regionId } of references) {
    const bytes = Buffer.from(await readAsset(reference.asset.path))
    if (
      bytes.length !== reference.asset.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== reference.asset.sha256
    ) {
      throw new Error('The captured original regional reference image changed.')
    }
    images.push({
      image: {
        bytes,
        byteSize: bytes.length,
        height: reference.asset.height,
        sha256: reference.asset.sha256,
        width: reference.asset.width,
      },
      referenceId: reference.id,
      regionId,
    })
  }
  const { adapter, visionConfig, visionModel } = resources
  return {
    images,
    profile,
    resources: {
      adapter: { byteSize: adapter.byteSize, path: adapter.managedPath, sha256: adapter.sha256 },
      visionConfig: {
        byteSize: visionConfig.byteSize,
        path: visionConfig.managedPath,
        sha256: visionConfig.sha256,
      },
      visionModel: {
        byteSize: visionModel.byteSize,
        path: visionModel.managedPath,
        sha256: visionModel.sha256,
      },
    },
  }
}
