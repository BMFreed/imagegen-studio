import { isProjectDocumentId } from '../../shared/projects/project-generation-actions.js'
import {
  IGS_MIMETYPE,
  IGS_SAFETY_CEILINGS,
  IGS_SCHEMA_VERSION,
  type IgsProjectDocumentV1,
  type IgsSmartPatchVariantV1,
  parseProjectDocumentV1,
  parseSmartPatchVariantV1,
  projectAssetReferences,
} from '../../shared/projects/project-schema.js'

import { isDeepStrictEqual } from 'node:util'

import { DEFAULT_IGS_PACKAGE_LIMITS } from './igs-package.js'

export interface SmartPatchVariantHandoffIdentity {
  acceptedVariants: readonly IgsSmartPatchVariantV1[]
  documentId: string
  targetLayerId: string
}

export interface SmartPatchAdoptionRequest extends SmartPatchVariantHandoffIdentity {
  activeVariantId: string
  expectedDocumentRevision: string
}

export class SmartPatchAdoptionError extends Error {
  constructor(
    readonly code:
      | 'PROJECT_DOCUMENT_CHANGED'
      | 'SMART_PATCH_ADOPTION_CONFLICT'
      | 'SMART_PATCH_ADOPTION_INVALID'
      | 'SMART_PATCH_ADOPTION_LIMIT'
      | 'SMART_PATCH_TARGET_BLOCKED'
      | 'SMART_PATCH_TARGET_ORPHANED',
    message: string,
  ) {
    super(message)
    this.name = 'SmartPatchAdoptionError'
  }
}

/**
 * Ownership proof only. A complete batch may survive later name, active-selection and authored
 * geometry edits; those changes cannot erase accepted immutable pixels or turn them into a new Add.
 * Historical hierarchy copies retain their origin; only competing canonical creation claims for the
 * nominated candidates invalidate a complete original handoff.
 */
export function projectSmartPatchVariantHandoffProof(
  document: IgsProjectDocumentV1,
  input: SmartPatchVariantHandoffIdentity,
): 'absent' | 'changed' | 'complete' {
  let identity: SmartPatchVariantHandoffIdentity
  try {
    identity = captureIdentity(input)
  } catch {
    return 'changed'
  }
  if (document.documentId !== identity.documentId) {
    return 'changed'
  }
  const accepted = acceptedIdentities(document)
  const expectedCandidates = new Set(
    identity.acceptedVariants.map(
      (variant) => variant.generationProvenance.executionResultContext.candidateId,
    ),
  )
  const canonical = accepted.filter(
    ({ candidateId, canonicalCreation }) =>
      canonicalCreation && expectedCandidates.has(candidateId),
  )
  if (new Set(canonical.map(({ candidateId }) => candidateId)).size !== canonical.length) {
    return 'changed'
  }
  const target = document.layers.find((layer) => layer.id === identity.targetLayerId)
  if (
    target?.kind === 'smart-patch' &&
    identity.acceptedVariants.every((expected) => {
      const current = target.rasterSubLayers.find((variant) => variant.id === expected.id)
      return (
        current !== undefined &&
        isDeepStrictEqual(current.asset, expected.asset) &&
        isDeepStrictEqual(current.bbox, expected.bbox) &&
        isDeepStrictEqual(current.generationProvenance, expected.generationProvenance)
      )
    })
  ) {
    return 'complete'
  }
  const ownedIds = new Set(
    document.layers.flatMap((layer) =>
      layer.kind === 'smart-patch'
        ? [layer.id, layer.mask.id, ...layer.rasterSubLayers.map(({ id }) => id)]
        : [layer.id],
    ),
  )
  return identity.acceptedVariants.some(
    (expected) =>
      ownedIds.has(expected.id) ||
      accepted.some(
        ({ candidateId }) =>
          candidateId === expected.generationProvenance.executionResultContext.candidateId,
      ),
  )
    ? 'changed'
    : 'absent'
}

/** Detached proposal and package preflight only; no journal, source access or Project mutation. */
export function projectSmartPatchAdoptionDocument(
  inputDocument: IgsProjectDocumentV1,
  inputRequest: SmartPatchAdoptionRequest,
): { document: IgsProjectDocumentV1; kind: 'adopted' | 'already-adopted' } {
  const identity = captureIdentity(inputRequest)
  const activeVariantId = inputRequest.activeVariantId
  const expectedRevision = inputRequest.expectedDocumentRevision
  if (
    !isProjectDocumentId(activeVariantId) ||
    !isProjectDocumentId(expectedRevision) ||
    !identity.acceptedVariants.some(({ id }) => id === activeVariantId)
  ) {
    throw new SmartPatchAdoptionError(
      'SMART_PATCH_ADOPTION_INVALID',
      'The active variant is invalid.',
    )
  }
  const document = parseProjectDocumentV1(structuredClone(inputDocument))
  if (document.documentId !== identity.documentId) {
    throw new SmartPatchAdoptionError('PROJECT_DOCUMENT_CHANGED', 'The Project document changed.')
  }
  const proof = projectSmartPatchVariantHandoffProof(document, identity)
  if (proof === 'complete') {
    return { document, kind: 'already-adopted' }
  }
  if (proof === 'changed') {
    throw new SmartPatchAdoptionError(
      'SMART_PATCH_ADOPTION_CONFLICT',
      'The accepted Smart Patch variant identities conflict with this Add.',
    )
  }
  if (document.documentRevision !== expectedRevision) {
    throw new SmartPatchAdoptionError(
      'PROJECT_DOCUMENT_CHANGED',
      'The Project changed while Add was being prepared. Review it again.',
    )
  }
  const target = document.layers.find((layer) => layer.id === identity.targetLayerId)
  if (target?.kind !== 'smart-patch') {
    throw new SmartPatchAdoptionError(
      'SMART_PATCH_TARGET_ORPHANED',
      'The exact Smart Patch target is absent. Temporary results were kept.',
    )
  }
  if (target.locked || !target.visible) {
    throw new SmartPatchAdoptionError(
      'SMART_PATCH_TARGET_BLOCKED',
      'Unlock and reveal this Smart Patch before adding variants.',
    )
  }
  const projected = parseProjectDocumentV1({
    ...document,
    layers: document.layers.map((layer) =>
      layer.id === target.id
        ? {
            ...target,
            activeRasterSubLayerId: activeVariantId,
            rasterSubLayers: [...target.rasterSubLayers, ...identity.acceptedVariants],
          }
        : layer,
    ),
  })
  preflightPackage(projected)
  return { document: projected, kind: 'adopted' }
}

/** Existing accepted identities across both owner kinds, separate from display projections. */
function acceptedIdentities(document: IgsProjectDocumentV1) {
  return document.layers.flatMap((layer) =>
    layer.kind === 'smart-patch'
      ? layer.rasterSubLayers.map((variant) => ({
          candidateId: variant.generationProvenance.executionResultContext.candidateId,
          canonicalCreation:
            variant.generationProvenance.layerSourceContext.sourceDocumentId ===
              document.documentId &&
            variant.generationProvenance.layerSourceContext.layerId === layer.id,
          id: variant.id,
        }))
      : layer.generationProvenance
        ? [
            {
              candidateId: layer.generationProvenance.executionResultContext.candidateId,
              canonicalCreation: true,
              id: layer.id,
            },
          ]
        : [],
  )
}

function captureIdentity(
  input: SmartPatchVariantHandoffIdentity,
): SmartPatchVariantHandoffIdentity {
  try {
    if (
      !input ||
      !isProjectDocumentId(input.documentId) ||
      !isProjectDocumentId(input.targetLayerId) ||
      !Array.isArray(input.acceptedVariants) ||
      input.acceptedVariants.length === 0 ||
      input.acceptedVariants.length > 64
    ) {
      throw new Error('Invalid variant selection')
    }
    const acceptedVariants = input.acceptedVariants.map((value) =>
      parseSmartPatchVariantV1(structuredClone(value)),
    )
    const candidateIds = acceptedVariants.map(
      (variant) => variant.generationProvenance.executionResultContext.candidateId,
    )
    if (
      new Set(acceptedVariants.map(({ id }) => id)).size !== acceptedVariants.length ||
      new Set(candidateIds).size !== acceptedVariants.length ||
      acceptedVariants.some((variant) => {
        const source = variant.generationProvenance.layerSourceContext
        return (
          source.sourceDocumentId !== input.documentId || source.layerId !== input.targetLayerId
        )
      })
    ) {
      throw new Error('Variant identity differs from its Project owner')
    }
    return { acceptedVariants, documentId: input.documentId, targetLayerId: input.targetLayerId }
  } catch {
    throw new SmartPatchAdoptionError(
      'SMART_PATCH_ADOPTION_INVALID',
      'The Smart Patch variant adoption identity is invalid.',
    )
  }
}

/** Same conservative preview reservation as ordinary Raster acceptance. */
function preflightPackage(document: IgsProjectDocumentV1): void {
  const limits = DEFAULT_IGS_PACKAGE_LIMITS
  const projectBytes = Buffer.byteLength(JSON.stringify(document), 'utf8')
  const assets = new Map<string, ReturnType<typeof projectAssetReferences>[number]>()
  for (const asset of projectAssetReferences(document)) {
    const prior = assets.get(asset.path)
    if (prior && !isDeepStrictEqual(prior, asset)) {
      throw new SmartPatchAdoptionError(
        'SMART_PATCH_ADOPTION_CONFLICT',
        'The Project contains conflicting asset references.',
      )
    }
    assets.set(asset.path, asset)
  }
  const manifestBytes = Buffer.byteLength(
    JSON.stringify({
      documentId: document.documentId,
      documentRevision: document.documentRevision,
      members: [
        { bytes: projectBytes, path: 'project.json', sha256: 'f'.repeat(64) },
        { bytes: limits.thumbnailBytes, path: 'preview/thumbnail.webp', sha256: 'f'.repeat(64) },
        { bytes: limits.mergedPreviewBytes, path: 'preview/merged.png', sha256: 'f'.repeat(64) },
        ...[...assets.values()].map(({ bytes, path, sha256 }) => ({ bytes, path, sha256 })),
      ],
      preview: {
        rect: {
          height: IGS_SAFETY_CEILINGS.previewExtent,
          width: IGS_SAFETY_CEILINGS.previewExtent,
          x: -IGS_SAFETY_CEILINGS.previewCoordinateMagnitude,
          y: -IGS_SAFETY_CEILINGS.previewCoordinateMagnitude,
        },
        status: 'unavailable',
      },
      schemaVersion: IGS_SCHEMA_VERSION,
    }),
    'utf8',
  )
  const totalBytes =
    Buffer.byteLength(IGS_MIMETYPE, 'utf8') +
    manifestBytes +
    projectBytes +
    limits.thumbnailBytes +
    limits.mergedPreviewBytes +
    [...assets.values()].reduce((total, asset) => total + asset.bytes, 0)
  if (
    projectBytes > IGS_SAFETY_CEILINGS.projectJsonBytes ||
    assets.size + 5 > limits.archiveEntries ||
    manifestBytes > limits.manifestJsonBytes ||
    totalBytes > limits.archiveUncompressedBytes
  ) {
    throw new SmartPatchAdoptionError(
      'SMART_PATCH_ADOPTION_LIMIT',
      'Adding these variants would exceed the Project package limits.',
    )
  }
}
