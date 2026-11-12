import type { ModelResourceType, ProjectTab } from '../../shared/api.js'

export interface ModelManagerResourceFocus {
  resourceId: string
  resourceName: string
  versionId: string
  versionName: string
}

/** Browsing intent only. Project selectors still own actual resource selection. */
export interface ModelManagerFocus {
  /** Preset diagnostics retain the expected exact file, rather than just nominal local IDs. */
  expectedResource?: NonNullable<ProjectTab['generationDraft']['model']>
  origin?: 'preset-manager' | 'preset'
  resource: ModelManagerResourceFocus | null
  resourceType: ModelResourceType
}

type SavedResource = Pick<
  NonNullable<ProjectTab['generationDraft']['model']>,
  'displayName' | 'localModelId' | 'localVersionId' | 'versionName'
>

export function modelManagerFocusFor(
  resourceType: ModelResourceType,
  saved: SavedResource | null,
): ModelManagerFocus {
  return {
    resource: saved
      ? {
          resourceId: saved.localModelId,
          resourceName: saved.displayName,
          versionId: saved.localVersionId,
          versionName: saved.versionName,
        }
      : null,
    resourceType,
  }
}
