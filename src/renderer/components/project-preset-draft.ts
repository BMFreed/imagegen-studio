import type { ModelCatalogItem, ProjectTab } from '../../shared/api.js'
import type { PresetPayload, PresetWorkflow } from '../../shared/presets/preset-schema.js'
import type { ProjectGenerationTargetState } from '../../shared/projects/project-generation-target-state.js'

import type { EditablePresetDefinition, EditablePresetPayload } from './preset-editor.js'

import { savedModelAvailability } from './project-model-picker.js'

export interface PresetProjectCreateIntent {
  definition: EditablePresetDefinition
  kind: 'project'
  projectName: string
  projectSummary: string
  workflowUnknown: boolean
}

/** Whole-Project authoring only. A selected Smart Patch will have a separate source contract. */
export function createProjectPresetIntent(input: {
  catalog?: readonly ModelCatalogItem[] | null
  mode: ProjectGenerationTargetState['mode']
  project: Pick<ProjectTab, 'generationDraft' | 'layers' | 'primaryBbox' | 'title'>
}): PresetProjectCreateIntent {
  const { catalog, mode, project } = input
  const draft = project.generationDraft
  const loras = draft.loras.map((lora) => {
    if (lora.resource.kind !== 'lora') {
      throw new Error('The Project LoRA reference has an invalid kind.')
    }
    return { ...copy(lora), resource: { ...copy(lora.resource), kind: 'lora' as const } }
  })
  if (draft.vae !== null && draft.vae.kind !== 'vae') {
    throw new Error('The Project VAE reference has an invalid kind.')
  }
  const workflow: PresetWorkflow | null =
    mode === 'txt2img'
      ? 'textToImage'
      : mode === 'img2img' || mode === 'outpaint'
        ? 'imageToImage'
        : project.layers.some((layer) => layer.visible && layer.opacity > 0)
          ? null
          : 'textToImage'
  const payload: EditablePresetPayload = {
    guidance: { cfgScale: draft.sampling.cfgScale, steps: draft.sampling.steps },
    loras,
    negativePrompt: copyPrompt(draft.negativePrompt),
    prompt: copyPrompt(draft.positivePrompt),
    size: { height: project.primaryBbox.height, width: project.primaryBbox.width },
    vae: draft.vae === null ? null : { ...copy(draft.vae), kind: 'vae' },
  }
  if (draft.model !== null) {
    if (draft.model.kind !== 'checkpoint') {
      throw new Error('The Project model is not a checkpoint.')
    }
    const model: NonNullable<PresetPayload['model']> = { ...copy(draft.model), kind: 'checkpoint' }
    if (
      catalog &&
      model.baseModelFamily === 'illustrious' &&
      savedModelAvailability(model, [...catalog]) === 'ready'
    ) {
      const exactVersion = catalog
        .find((resource) => resource.id === model.localModelId)
        ?.versions.find((version) => version.id === model.localVersionId)
      if (exactVersion?.noiseProfile) {
        model.noiseProfile = copy(exactVersion.noiseProfile.effective)
      }
    }
    payload.model = model
  }
  const sampling: NonNullable<PresetPayload['sampling']> = {}
  if (draft.sampling.sampler !== null) {
    sampling.sampler = draft.sampling.sampler
  }
  if (draft.sampling.scheduler !== null) {
    sampling.scheduler = draft.sampling.scheduler
  }
  if (draft.sampling.animaMethod !== undefined) {
    sampling.animaMethod = draft.sampling.animaMethod
  }
  if (Object.keys(sampling).length > 0) {
    payload.sampling = sampling
  }
  if (draft.cfgRescale !== undefined) {
    payload.cfgRescale = draft.cfgRescale
  }
  if (draft.vaePrecision !== undefined) {
    payload.vaePrecision = draft.vaePrecision
  }
  if (workflow !== 'textToImage' && draft.sampling.denoisingStrength !== null) {
    payload.denoisingStrength = draft.sampling.denoisingStrength
  }
  return {
    definition: {
      description: '',
      favorite: false,
      name: `${project.title.replace(/\.igs$/i, '')} Baseline`,
      payload,
      tags: ['project'],
      workflow,
    },
    kind: 'project',
    projectName: project.title,
    projectSummary: `${project.primaryBbox.width} × ${project.primaryBbox.height} · ${draft.model?.displayName ?? 'No model'}`,
    workflowUnknown: workflow === null,
  }
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function copyPrompt(
  prompt: ProjectTab['generationDraft']['positivePrompt'],
): NonNullable<PresetPayload['prompt']> {
  return {
    embeddingRefs: prompt.embeddingRefs.map((reference) => {
      if (reference.resource.kind !== 'embedding') {
        throw new Error('The Project embedding reference has an invalid kind.')
      }
      return {
        ...copy(reference),
        resource: { ...copy(reference.resource), kind: 'embedding' as const },
      }
    }),
    text: prompt.text,
  }
}
