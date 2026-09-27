import type { IgsProjectDocumentV1 } from './project-schema.js'

type ResourceModelIdentity = Pick<
  NonNullable<IgsProjectDocumentV1['generationDraft']['model']>,
  'civitaiModelId' | 'kind' | 'localModelId'
>

/** One resource may have different registry IDs after a Project is transferred. */
export function sameResourceModel(a: ResourceModelIdentity, b: ResourceModelIdentity): boolean {
  return (
    a.kind === b.kind &&
    (a.localModelId === b.localModelId ||
      (a.civitaiModelId !== null &&
        b.civitaiModelId !== null &&
        a.civitaiModelId === b.civitaiModelId))
  )
}
