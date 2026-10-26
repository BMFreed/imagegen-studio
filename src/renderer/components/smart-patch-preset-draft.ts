import type { ModelCatalogItem, ProjectSmartPatchLayerView, ProjectTab } from '../../shared/api.js'

import type { EditablePresetDefinition } from './preset-editor.js'

import { createAuthoringPresetPayload } from './project-preset-draft.js'

export interface PresetSmartPatchDraftCreateIntent {
  definition: EditablePresetDefinition
  kind: 'smart-patch-draft'
  patchName: string
  projectName: string
  projectSummary: string
  workflowUnknown: false
}

/** Current authored templates, never accepted-result settings or Patch geometry. */
export function createSmartPatchPresetIntent(input: {
  catalog?: readonly ModelCatalogItem[] | null
  patch: Pick<ProjectSmartPatchLayerView, 'generationDraft' | 'name'>
  projectName: string
}): PresetSmartPatchDraftCreateIntent {
  const { catalog, patch, projectName } = input
  const payload = createAuthoringPresetPayload({ catalog, draft: patch.generationDraft })
  if (patch.generationDraft.sampling.denoisingStrength !== null) {
    payload.denoisingStrength = patch.generationDraft.sampling.denoisingStrength
  }
  return {
    definition: {
      description: '',
      favorite: false,
      name: `${patch.name} Baseline`,
      payload,
      tags: ['project'],
      workflow: 'smartPatch',
    },
    kind: 'smart-patch-draft',
    patchName: patch.name,
    projectName,
    projectSummary: patch.generationDraft.model?.displayName ?? 'No model',
    workflowUnknown: false,
  }
}

/** Capture only an acknowledged selected owner, before opening the asynchronous Manager. */
export function captureSmartPatchPresetIntent(input: {
  blocked: boolean
  catalog?: readonly ModelCatalogItem[] | null
  pendingDraft: boolean
  selectedLayerId: string | null
  tab: Pick<ProjectTab, 'documentId' | 'documentRevision' | 'id' | 'layers' | 'title'> | undefined
}): {
  intent: PresetSmartPatchDraftCreateIntent
  owner: { documentId: string; documentRevision: string; layerId: string; tabId: string }
} | null {
  const { blocked, catalog, pendingDraft, selectedLayerId, tab } = input
  if (blocked || pendingDraft || !tab || selectedLayerId === null) {
    return null
  }
  const patch = tab.layers.find((layer) => layer.id === selectedLayerId)
  if (patch?.kind !== 'smart-patch') {
    return null
  }
  return {
    intent: createSmartPatchPresetIntent({ catalog, patch, projectName: tab.title }),
    owner: {
      documentId: tab.documentId,
      documentRevision: tab.documentRevision,
      layerId: patch.id,
      tabId: tab.id,
    },
  }
}
