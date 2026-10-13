import type { ProjectCreateInput } from '../../shared/api.js'
import {
  includedPresetSections,
  parsePresetApplicationPayload,
} from '../../shared/presets/preset-application.js'
import type {
  PresetPayload,
  PresetRecord,
  PresetSectionKey,
} from '../../shared/presets/preset-schema.js'
import { parseProjectCreateInput } from '../../shared/projects/project-create.js'

import type { EditablePresetPayload } from './preset-editor.js'
import type { ResolutionSize } from './resolution-control.js'

export interface NewProjectPresetCustomization {
  initialPayload: Readonly<PresetPayload>
  payload: EditablePresetPayload
  sectionRevisions: Partial<Record<PresetSectionKey, number>>
  selectedSections: PresetSectionKey[]
  source: Readonly<PresetRecord>
}
export interface NewProjectPresetState {
  customization: NewProjectPresetCustomization | null
  resolution: ResolutionSize
}

export function emptyNewProjectPresetState(): NewProjectPresetState {
  return { customization: null, resolution: { height: 1024, width: 1024 } }
}

/** A picker transition snapshots an active TXT source once; later catalog reads never replace it. */
export function selectNewProjectPreset(record: PresetRecord | null): NewProjectPresetState {
  if (record === null) {
    return emptyNewProjectPresetState()
  }
  if (record.deletedAt !== null || record.workflow !== 'textToImage') {
    throw new Error('Only active Text to Image presets can initialize a Project.')
  }
  const source = clone(record)
  const initialPayload: PresetPayload = {
    ...clone(source.payload),
    size: source.payload.size ? clone(source.payload.size) : { height: 1024, width: 1024 },
  }
  return {
    customization: {
      initialPayload,
      payload: clone(initialPayload),
      sectionRevisions: {},
      selectedSections: includedPresetSections(initialPayload).filter(
        (section) => section !== 'seed',
      ),
      source,
    },
    resolution: { height: 1024, width: 1024 },
  }
}

export function newProjectPresetSections(state: NewProjectPresetState): PresetSectionKey[] {
  return state.customization ? includedPresetSections(state.customization.initialPayload) : []
}

export function setNewProjectPresetSection(
  state: NewProjectPresetState,
  section: PresetSectionKey,
  selected: boolean,
) {
  const customization = state.customization
  if (!customization || section === 'size' || !newProjectPresetSections(state).includes(section)) {
    return
  }
  customization.selectedSections = selected
    ? [...new Set([...customization.selectedSections, section])]
    : customization.selectedSections.filter((key) => key !== section)
}

export function resetNewProjectPresetSection(
  state: NewProjectPresetState,
  section: PresetSectionKey,
) {
  const customization = state.customization
  if (!customization || !newProjectPresetSections(state).includes(section)) {
    return
  }
  const payload = clone(customization.payload)
  Reflect.set(payload, section, clone(customization.initialPayload[section]))
  customization.payload = payload
  customization.sectionRevisions[section] = (customization.sectionRevisions[section] ?? 0) + 1
}

export function resetNewProjectPreset(state: NewProjectPresetState) {
  const customization = state.customization
  if (!customization) {
    return
  }
  customization.payload = clone(customization.initialPayload)
  for (const section of newProjectPresetSections(state)) {
    customization.sectionRevisions[section] = (customization.sectionRevisions[section] ?? 0) + 1
  }
}

/** Structural validity only: missing resources are intentionally preserved for later repair. */
export function newProjectCreateRequest(
  state: NewProjectPresetState,
  title: string,
  editorValid = true,
): ProjectCreateInput {
  if (!editorValid) {
    throw new Error('Correct the selected generation fields before creating a Project.')
  }
  const customization = state.customization
  if (customization && !customization.selectedSections.includes('size')) {
    throw new Error('Generation area is required for New Project customization.')
  }
  const generationPayload = customization
    ? parsePresetApplicationPayload(customization.payload, customization.selectedSections)
    : undefined
  const size = customization?.payload.size ?? state.resolution
  return parseProjectCreateInput({
    height: size.height,
    title,
    width: size.width,
    ...(generationPayload === undefined ? {} : { generationPayload }),
  })
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
