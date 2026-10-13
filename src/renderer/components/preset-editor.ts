import type { ModelCatalogItem, ModelVersionView } from '../../shared/api.js'
import type {
  PresetDefinition,
  PresetPayload,
  PresetRecord,
  PresetSectionKey,
  PresetWorkflow,
} from '../../shared/presets/preset-schema.js'
import { parsePresetDefinition } from '../../shared/presets/preset-schema.js'

import { savedModelAvailability } from './project-model-picker.js'

/** Null is an unfinished field in the editor, never a silent numeric default. */
export type EditablePresetPayload = Omit<
  PresetPayload,
  'cfgRescale' | 'denoisingStrength' | 'guidance' | 'loras' | 'model' | 'seed' | 'size'
> & {
  cfgRescale?: number | null
  denoisingStrength?: number | null
  guidance?: { cfgScale: number | null; steps: number | null }
  loras?: (Omit<NonNullable<PresetPayload['loras']>[number], 'weight'> & {
    weight: number | null
  })[]
  model?: PresetPayload['model'] | null
  seed?: { policy: 'fixed'; value: number | null } | { policy: 'random' | 'reuse' }
  size?: { height: number | null; width: number | null }
}

export type EditablePresetDefinition = Omit<PresetDefinition, 'payload'> & {
  payload: EditablePresetPayload
}

export const workflowLabels: Record<PresetWorkflow, string> = {
  imageToImage: 'Image to Image',
  smartPatch: 'Smart Patch',
  textToImage: 'Text to Image',
}

export const sectionLabels: Record<PresetSectionKey, string> = {
  cfgRescale: 'CFG Rescale',
  denoisingStrength: 'Denoising Strength',
  guidance: 'Steps & CFG',
  loras: 'LoRAs',
  model: 'Model',
  negativePrompt: 'Negative Prompt',
  prompt: 'Prompt',
  sampling: 'Sampler & Scheduler',
  seed: 'Seed',
  size: 'Size',
  vae: 'VAE',
  vaePrecision: 'VAE Precision',
}

export function emptyPresetDefinition(): EditablePresetDefinition {
  return {
    description: '',
    favorite: false,
    name: '',
    payload: { prompt: { embeddingRefs: [], text: '' } },
    tags: [],
    workflow: 'textToImage',
  }
}

export function presetDefinitionFromRecord(record: PresetRecord): EditablePresetDefinition {
  const { description, favorite, name, payload, tags, workflow } = record
  // Records are JSON contracts, and may already have been wrapped in a Vue proxy.
  return JSON.parse(
    JSON.stringify({ description, favorite, name, payload, tags, workflow }),
  ) as EditablePresetDefinition
}

export function validatePresetDefinition(draft: EditablePresetDefinition): PresetDefinition | null {
  try {
    return parsePresetDefinition(draft)
  } catch {
    return null
  }
}

/** A numeric widget must not save an older model while a different raw value is displayed. */
export function presetNumericInputValid(
  text: string,
  value: number | null,
  options: { integer?: boolean; max?: number; min?: number } = {},
): boolean {
  const raw = text.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) {
    return false
  }
  const parsed = Number(raw)
  return (
    Number.isFinite(parsed) &&
    value !== null &&
    parsed === value &&
    (!options.integer || Number.isSafeInteger(parsed)) &&
    (options.min === undefined || parsed >= options.min) &&
    (options.max === undefined || parsed <= options.max)
  )
}

/** Availability diagnostics never change a copied identity or substitute a catalog default. */
export function presetNeedsAttention(
  definition: Pick<EditablePresetDefinition, 'payload'>,
  catalog: ModelCatalogItem[],
  catalogReady: boolean,
): boolean {
  if (!catalogReady) {
    return false
  }
  const payload = definition.payload
  const resources = [
    payload.model,
    payload.vae,
    ...(payload.loras ?? []).map((lora) => lora.resource),
    ...(payload.prompt?.embeddingRefs ?? []).map((reference) => reference.resource),
    ...(payload.negativePrompt?.embeddingRefs ?? []).map((reference) => reference.resource),
  ].filter((resource) => resource !== null && resource !== undefined)
  return resources.some(
    (resource) =>
      savedModelAvailability(resource, catalog) !== 'ready' ||
      (payload.model?.baseModelFamily != null &&
        resource.kind !== 'checkpoint' &&
        resource.baseModelFamily !== payload.model.baseModelFamily),
  )
}

export function presetResourceReference<K extends 'checkpoint' | 'lora' | 'vae'>(
  resource: ModelCatalogItem,
  version: ModelVersionView,
  kind: K,
) {
  if (
    resource.resourceType !== kind ||
    !resource.versions.some(
      (item) =>
        item.id === version.id &&
        item.sha256 === version.sha256 &&
        item.civitaiFileId === version.civitaiFileId &&
        item.civitaiVersionId === version.civitaiVersionId,
    )
  ) {
    throw new Error('Resource and exact version do not match the requested kind.')
  }
  return {
    baseModelFamily: version.baseModelFamily,
    civitaiFileId: version.civitaiFileId,
    civitaiModelId: resource.modelId,
    civitaiVersionId: version.civitaiVersionId,
    displayName: resource.name,
    fileSha256: version.sha256,
    kind,
    localModelId: resource.id,
    localVersionId: version.id,
    predictionType: version.predictionType,
    versionName: version.name,
  }
}

/** Enabling a section is explicit authoring; resources remain unselected until chosen. */
export function includePresetSection(payload: EditablePresetPayload, section: PresetSectionKey) {
  if (payload[section] !== undefined) {
    return
  }
  switch (section) {
    case 'cfgRescale': {
      payload.cfgRescale = 0
      break
    }
    case 'denoisingStrength': {
      payload.denoisingStrength = 0.75
      break
    }
    case 'guidance': {
      payload.guidance = { cfgScale: 7, steps: 30 }
      break
    }
    case 'loras': {
      payload.loras = []
      break
    }
    case 'model': {
      payload.model = null
      break
    }
    case 'negativePrompt':
    case 'prompt': {
      payload[section] = { embeddingRefs: [], text: '' }
      break
    }
    case 'sampling': {
      payload.sampling = {}
      break
    }
    case 'seed': {
      payload.seed = { policy: 'random' }
      break
    }
    case 'size': {
      payload.size = { height: 1024, width: 1024 }
      break
    }
    case 'vae': {
      payload.vae = null
      break
    }
    case 'vaePrecision': {
      payload.vaePrecision = 'Auto'
    }
  }
}
