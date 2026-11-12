import type { ModelCatalogItem } from '../../shared/api.js'
import type { PresetApplicationDiagnostic } from '../../shared/presets/preset-application.js'
import type { PresetSectionKey } from '../../shared/presets/preset-schema.js'

import type { NewProjectPresetState } from './new-project-preset-draft.js'

import { type ModelManagerFocus, modelManagerFocusFor } from './model-manager-focus.js'
import {
  type EditablePresetDefinition,
  presetResourceReferences,
  presetUnavailableResources,
} from './preset-editor.js'

type Resource = NonNullable<PresetApplicationDiagnostic['resource']>

/** Browse the diagnosed edited reference; never select or rewrite a Project resource. */
export function presetDiagnosticModelFocus(
  diagnostic: PresetApplicationDiagnostic,
): ModelManagerFocus | null {
  return diagnostic.resource ? resourceFocus(diagnostic.resource, 'preset') : null
}

/** Keep every explanation, with one browse action per exact reference in each section. */
export function presetDiagnosticModelRows(diagnostics: readonly PresetApplicationDiagnostic[]) {
  const seen = new Set<string>()
  return diagnostics.map((diagnostic) => {
    const resource = diagnostic.resource
    const key = resource ? resourceActionKey(diagnostic.section, resource) : null
    const focus = key && !seen.has(key) ? presetDiagnosticModelFocus(diagnostic) : null
    if (key) {
      seen.add(key)
    }
    return { actionKey: focus ? key : null, diagnostic, focus }
  })
}

/** Browse the active authoring draft; unknown availability is distinct from a missing resource. */
export function presetManagerModelRows(
  definition: Pick<EditablePresetDefinition, 'payload'>,
  catalog: ModelCatalogItem[],
  catalogReady: boolean,
) {
  return editableResourceModelRows(definition, catalog, catalogReady, 'preset-manager')
}

/** Only settings used by the detached New Project copy contribute diagnostics. */
export function newProjectPresetModelRows(
  state: NewProjectPresetState,
  catalog: ModelCatalogItem[],
  catalogReady: boolean,
) {
  const customization = state.customization
  if (!customization) {
    return []
  }
  const payload = Object.fromEntries(
    customization.selectedSections.map((section) => [section, customization.payload[section]]),
  )
  return editableResourceModelRows({ payload }, catalog, catalogReady, 'new-project')
}

function editableResourceModelRows(
  definition: Pick<EditablePresetDefinition, 'payload'>,
  catalog: ModelCatalogItem[],
  catalogReady: boolean,
  origin: 'new-project' | 'preset-manager',
) {
  const references = catalogReady
    ? presetUnavailableResources(definition, catalog, true)
    : presetResourceReferences(definition)
  const seen = new Set<string>()
  return references.flatMap(({ resource, section }) => {
    const actionKey = resourceActionKey(section, resource)
    if (seen.has(actionKey)) {
      return []
    }
    seen.add(actionKey)
    return [{ actionKey, focus: resourceFocus(resource, origin), section }]
  })
}

function resourceFocus(
  resource: Resource,
  origin: NonNullable<ModelManagerFocus['origin']>,
): ModelManagerFocus {
  return {
    ...modelManagerFocusFor(resource.kind, resource),
    expectedResource: JSON.parse(JSON.stringify(resource)) as Resource,
    origin,
  }
}

function resourceActionKey(section: PresetSectionKey, resource: Resource) {
  return JSON.stringify([
    section,
    resource.kind,
    resource.localModelId,
    resource.localVersionId,
    resource.fileSha256,
    resource.civitaiModelId,
    resource.civitaiVersionId,
    resource.civitaiFileId,
    resource.baseModelFamily,
  ])
}
