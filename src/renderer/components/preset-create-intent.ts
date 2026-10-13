import type { PresetSectionKey } from '../../shared/presets/preset-schema.js'

import type { EditablePresetDefinition } from './preset-editor.js'
import type { PresetProjectCreateIntent } from './project-preset-draft.js'

export interface PresetResultCreateIntent {
  definition: EditablePresetDefinition
  kind: 'result'
  layerName: string
  projectName: string
  projectSummary: string
  /** These sections were not recorded as reusable settings; absence never invents a default. */
  unavailableSections: PresetSectionKey[]
  workflowUnknown: false
}

export type PresetCreateIntent = PresetProjectCreateIntent | PresetResultCreateIntent
