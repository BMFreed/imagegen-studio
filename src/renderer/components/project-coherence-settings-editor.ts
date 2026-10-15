import type { ProjectSmartPatchLayerChange } from '../../shared/api.js'
import type { SmartPatchCoherenceSettings } from '../../shared/projects/smart-patch-coherence-settings.js'
import {
  isSmartPatchCoherenceSettings,
  SMART_PATCH_COHERENCE_EDGE_MAX,
} from '../../shared/projects/smart-patch-coherence-settings.js'

import type { ProjectMaskSettingsOwner } from './project-mask-settings-editor.js'

export type ProjectCoherenceNumericField = 'edgeSize' | 'minimumDenoise'
export type ProjectCoherenceSettingField = 'mode' | ProjectCoherenceNumericField

export interface ProjectCoherenceSettingsCommand {
  change: Extract<ProjectSmartPatchLayerChange, { kind: 'coherence-settings' }>
  layerId: string
}

/** A focus transaction edits one field of its captured whole profile and exact owner. */
export class ProjectCoherenceSettingsEditor {
  readonly originalSettings: Readonly<SmartPatchCoherenceSettings>
  readonly owner: Readonly<ProjectMaskSettingsOwner>
  private ended = false
  private raw: string

  constructor(
    owner: ProjectMaskSettingsOwner,
    readonly field: ProjectCoherenceSettingField,
    settings: SmartPatchCoherenceSettings,
  ) {
    this.owner = Object.freeze({ ...owner })
    this.originalSettings = Object.freeze({ ...settings })
    this.raw = String(settings[field])
  }

  cancel(): void {
    this.ended = true
  }

  finish(currentOwner: ProjectMaskSettingsOwner | null): ProjectCoherenceSettingsCommand | null {
    if (this.ended) {
      return null
    }
    this.ended = true
    if (
      !currentOwner ||
      currentOwner.projectKey !== this.owner.projectKey ||
      currentOwner.documentId !== this.owner.documentId ||
      currentOwner.documentRevision !== this.owner.documentRevision ||
      currentOwner.layerId !== this.owner.layerId
    ) {
      return null
    }
    const value = { ...this.originalSettings }
    if (this.field === 'mode') {
      if (this.raw !== 'Gaussian Blur' && this.raw !== 'Box Blur' && this.raw !== 'Staged') {
        return null
      }
      value.mode = this.raw
    } else {
      const numeric = parseProjectCoherenceNumericInput(this.field, this.raw)
      if (numeric === null) {
        return null
      }
      value[this.field] = numeric
    }
    if (
      !isSmartPatchCoherenceSettings(value) ||
      value[this.field] === this.originalSettings[this.field]
    ) {
      return null
    }
    return {
      change: {
        documentId: this.owner.documentId,
        documentRevision: this.owner.documentRevision,
        kind: 'coherence-settings',
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

/** Preserve invalid text for correction rather than rounding, clamping or publishing it. */
export function parseProjectCoherenceNumericInput(
  field: ProjectCoherenceNumericField,
  raw: string,
): number | null {
  const text = raw.trim()
  if (field === 'edgeSize') {
    if (!/^\d+$/.test(text)) {
      return null
    }
    const value = Number(text)
    return Number.isSafeInteger(value) && value >= 0 && value <= SMART_PATCH_COHERENCE_EDGE_MAX
      ? value
      : null
  }
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
    return null
  }
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null
}
