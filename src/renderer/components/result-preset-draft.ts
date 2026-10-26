import type { PresetPayload, PresetSectionKey } from '../../shared/presets/preset-schema.js'
import type { RasterGenerationData } from '../../shared/projects/generation-settings-comparison.js'
import { isRasterGenerationData } from '../../shared/projects/generation-settings-comparison.js'
import {
  isSmartResultPresetData,
  type SmartResultPresetData,
} from '../../shared/projects/smart-result-preset.js'

import type { PresetResultCreateIntent } from './preset-create-intent.js'

/** Accepted Raster results only; layer/source/execution context never enters this projection. */
export function createResultPresetIntent(input: {
  data: RasterGenerationData
  layerName: string
  projectName: string
}): PresetResultCreateIntent {
  if (!isRasterGenerationData(input.data)) {
    throw new Error(
      'The saved result generation data is invalid. Reopen the Project and try again.',
    )
  }
  if (input.data.generationConfiguration === null) {
    throw new Error(
      'This layer has no saved generation configuration. Imported images and legacy results cannot create a preset from a result; use Save Current as Preset instead.',
    )
  }

  // Portable JSON also works when the acknowledged transport is wrapped in a Vue proxy.
  const recorded = copy(input.data.generationConfiguration)
  const payload: PresetPayload = {
    guidance: { cfgScale: recorded.sampling.cfgScale, steps: recorded.sampling.steps },
    model: copy(recorded.model),
    negativePrompt: copy(recorded.negativePrompt),
    prompt: copy(recorded.positivePrompt),
    sampling:
      'anima' in recorded
        ? { animaMethod: recorded.sampling.animaMethod }
        : { sampler: recorded.sampling.sampler, scheduler: recorded.sampling.scheduler },
    size: copy(recorded.size),
  }
  if (!('anima' in recorded) && recorded.sampling.noiseProfile !== undefined) {
    payload.model!.noiseProfile = copy(recorded.sampling.noiseProfile)
  }
  if (recorded.loras !== undefined) {
    payload.loras = copy(recorded.loras)
  }
  if ('vae' in recorded && recorded.vae !== undefined) {
    payload.vae = recorded.vae === null ? null : copy(recorded.vae)
  }
  if (recorded.cfgRescale !== undefined) {
    payload.cfgRescale = recorded.cfgRescale
  }
  if (recorded.vaePrecision !== undefined) {
    payload.vaePrecision = recorded.vaePrecision
  }
  if (recorded.mode !== 'txt2img') {
    payload.denoisingStrength = recorded.sampling.denoisingStrength
  }

  const optionalSections: PresetSectionKey[] = ['loras', 'vae', 'cfgRescale', 'vaePrecision']
  return {
    definition: {
      description: '',
      favorite: false,
      name: `${input.layerName} Preset`,
      payload,
      tags: ['result'],
      workflow: recorded.mode === 'txt2img' ? 'textToImage' : 'imageToImage',
    },
    kind: 'result',
    layerName: input.layerName,
    projectName: input.projectName,
    projectSummary: `${recorded.size.width} × ${recorded.size.height} · ${recorded.model.displayName}`,
    unavailableSections: optionalSections.filter((key) => payload[key] === undefined),
    workflowUnknown: false,
  }
}

/** Main has already projected reusable settings; never fill gaps from the current Project. */
export function createSmartResultPresetIntent(input: {
  data: SmartResultPresetData
  layerName: string
  projectName: string
}): PresetResultCreateIntent {
  if (!isSmartResultPresetData(input.data)) {
    throw new Error(
      'The saved Smart result settings are invalid. Reopen the Project and try again.',
    )
  }
  const payload = copy(input.data.payload)
  const optionalSections: PresetSectionKey[] = ['loras', 'vae', 'cfgRescale', 'vaePrecision']
  return {
    definition: {
      description: '',
      favorite: false,
      name: `${input.layerName} Preset`,
      payload,
      tags: ['result'],
      workflow: 'smartPatch',
    },
    kind: 'result',
    layerName: input.layerName,
    projectName: input.projectName,
    projectSummary: `${payload.model.displayName} · ${payload.model.versionName}`,
    smartGeometryExcluded: true,
    unavailableSections: optionalSections.filter((key) => payload[key] === undefined),
    workflowUnknown: false,
  }
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
