import type { ProjectSmartPatchLayerChange } from '../../shared/api.js'
import { PROJECT_MASK_SETTINGS_MAX } from '../../shared/projects/project-mask-settings.js'

export type ProjectMaskSettingField = 'blur' | 'padding'

export interface ProjectMaskSettingsOwner {
  documentId: string
  documentRevision: string
  layerId: string
  projectKey: string
}

export interface ProjectMaskSettingsCommand {
  change: ProjectMaskSettingsChange
  layerId: string
}

type ProjectMaskSettingsChange = Extract<
  ProjectSmartPatchLayerChange,
  { kind: 'bbox-padding' | 'mask-blur' }
>

/** One focus transaction owns one scalar, never the other field or a later selection. */
export class ProjectMaskSettingsEditor {
  readonly owner: Readonly<ProjectMaskSettingsOwner>
  private ended = false
  private raw: string

  constructor(
    owner: ProjectMaskSettingsOwner,
    readonly field: ProjectMaskSettingField,
    private readonly originalValue: number,
  ) {
    this.owner = Object.freeze({ ...owner })
    this.raw = String(originalValue)
  }

  cancel(): void {
    this.ended = true
  }

  finish(currentOwner: ProjectMaskSettingsOwner | null): ProjectMaskSettingsCommand | null {
    if (this.ended) {
      return null
    }
    this.ended = true
    if (
      !currentOwner ||
      this.owner.projectKey !== currentOwner.projectKey ||
      this.owner.documentId !== currentOwner.documentId ||
      this.owner.documentRevision !== currentOwner.documentRevision ||
      this.owner.layerId !== currentOwner.layerId
    ) {
      return null
    }
    const value = parseProjectMaskSettingInput(this.raw)
    if (value === null || value === this.originalValue) {
      return null
    }
    return {
      change: {
        documentId: this.owner.documentId,
        documentRevision: this.owner.documentRevision,
        kind: this.field === 'blur' ? 'mask-blur' : 'bbox-padding',
        value,
      },
      layerId: this.owner.layerId,
    }
  }

  update(raw: string): boolean {
    if (this.ended) {
      return false
    }
    this.raw = raw
    return true
  }
}

/** Validate the detached raw draft before publishing any numeric setting. */
export function parseProjectMaskSettingInput(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d+$/.test(text)) {
    return null
  }
  const value = Number(text)
  return Number.isSafeInteger(value) && value >= 0 && value <= PROJECT_MASK_SETTINGS_MAX
    ? value
    : null
}
