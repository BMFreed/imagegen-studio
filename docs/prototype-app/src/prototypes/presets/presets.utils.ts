import type {
  PresetApplicationDraft,
  PresetCreateIntent,
  PresetDefinition,
  PresetPayload,
  PresetRecord,
  PresetSectionKey,
  PresetWorkflow,
} from './presets.types'

import {
  createGenerationPrompt,
  getPromptEmbeddingRefs,
  promptHasAmbiguousEmbedding,
  promptHasMissingEmbedding,
  serializeGenerationPrompt,
} from '../../components/generation/generation-prompt.utils'

export const workflowLabels: Record<PresetWorkflow, string> = {
  imageToImage: 'Image to Image',
  smartPatch: 'Smart Patch',
  textToImage: 'Text to Image',
}

export const sectionLabels: Record<PresetSectionKey, string> = {
  denoisingStrength: 'Denoising Strength',
  guidance: 'Steps & CFG',
  loras: 'LoRA',
  model: 'Model',
  negativePrompt: 'Negative Prompt',
  prompt: 'Prompt',
  sampling: 'Sampler & Scheduler',
  seed: 'Seed',
  size: 'Size',
  vae: 'VAE',
}

export const sectionOrder = [
  'prompt',
  'negativePrompt',
  'model',
  'loras',
  'size',
  'sampling',
  'guidance',
  'denoisingStrength',
  'seed',
  'vae',
] as const satisfies readonly PresetSectionKey[]

export function clonePreset<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function createManualPresetDefinition(): PresetDefinition {
  return {
    description: '',
    favorite: false,
    name: '',
    payload: { prompt: createGenerationPrompt() },
    tags: [],
    workflow: 'textToImage',
  }
}

export function createPresetDefinitionFromProject(
  source: Extract<PresetCreateIntent, { kind: 'project' }>,
): PresetDefinition {
  const definition = clonePreset(source.definition)
  delete definition.payload.seed
  return definition
}

export function createApplicationDraft(preset: PresetRecord): PresetApplicationDraft {
  return {
    payload: clonePreset(preset.payload),
    selectedSections: includedSections(preset.payload).filter(
      (section) => section !== 'seed' && section !== 'size',
    ),
    sourcePresetId: preset.id,
  }
}

export function createPresetRecord(definition: PresetDefinition): PresetRecord {
  const timestamp = new Date().toISOString()

  return {
    ...clonePreset(definition),
    id: `preset-${Date.now()}`,
    updatedAt: timestamp,
  }
}

export function createDefaultSectionValue(
  section: PresetSectionKey,
  workflow: PresetWorkflow,
): PresetPayload[PresetSectionKey] {
  switch (section) {
    case 'denoisingStrength': {
      return workflow === 'textToImage' ? undefined : 0.5
    }
    case 'guidance': {
      return { cfgScale: 5, steps: 28 }
    }
    case 'loras': {
      return []
    }
    case 'model': {
      return {
        baseModel: 'Illustrious',
        id: 'illustrious-xl-v1-1',
        name: 'Illustrious XL',
        predictionType: 'v-pred',
        version: 'v1.1 main',
      }
    }
    case 'negativePrompt':
    case 'prompt': {
      return createGenerationPrompt()
    }
    case 'sampling': {
      return { sampler: 'DPM++ 2M', scheduler: 'Karras' }
    }
    case 'seed': {
      return { policy: 'random' }
    }
    case 'size': {
      return { height: 1024, width: 1024 }
    }
    case 'vae': {
      return { id: 'illustrious-built-in-vae', name: 'Illustrious built-in' }
    }
  }
}

export function setPresetSectionIncluded(
  payload: PresetPayload,
  section: PresetSectionKey,
  included: boolean,
  workflow: PresetWorkflow,
) {
  if (!included) {
    delete payload[section]
    return
  }

  const value = createDefaultSectionValue(section, workflow)

  if (value === undefined) {
    return
  }

  switch (section) {
    case 'denoisingStrength': {
      payload.denoisingStrength = value as number
      break
    }
    case 'guidance': {
      payload.guidance = value as NonNullable<PresetPayload['guidance']>
      break
    }
    case 'loras': {
      payload.loras = value as NonNullable<PresetPayload['loras']>
      break
    }
    case 'model': {
      payload.model = value as NonNullable<PresetPayload['model']>
      break
    }
    case 'negativePrompt': {
      payload.negativePrompt = value as NonNullable<PresetPayload['negativePrompt']>
      break
    }
    case 'prompt': {
      payload.prompt = value as NonNullable<PresetPayload['prompt']>
      break
    }
    case 'sampling': {
      payload.sampling = value as NonNullable<PresetPayload['sampling']>
      break
    }
    case 'seed': {
      payload.seed = value as NonNullable<PresetPayload['seed']>
      break
    }
    case 'size': {
      payload.size = value as NonNullable<PresetPayload['size']>
      break
    }
    case 'vae': {
      payload.vae = value as NonNullable<PresetPayload['vae']>
      break
    }
  }
}

export function normalizePayloadForWorkflow(
  payload: PresetPayload,
  workflow: PresetWorkflow,
): PresetPayload {
  const normalized = clonePreset(payload)

  if (workflow === 'textToImage') {
    delete normalized.denoisingStrength
  }

  return normalized
}

export function presetSectionHasMissingResources(
  payload: PresetPayload,
  section: PresetSectionKey,
  embeddings: Parameters<typeof promptHasAmbiguousEmbedding>[1] = [],
): boolean {
  switch (section) {
    case 'loras': {
      return payload.loras?.some((lora) => lora.resource.missing) ?? false
    }
    case 'model': {
      return payload.model?.missing ?? false
    }
    case 'negativePrompt':
    case 'prompt': {
      return (
        promptHasMissingEmbedding(payload[section]) ||
        promptHasAmbiguousEmbedding(payload[section], embeddings)
      )
    }
    case 'vae': {
      return payload.vae?.missing ?? false
    }
    default: {
      return false
    }
  }
}

export function presetHasMissingResources(preset: PresetDefinition): boolean {
  return includedSections(preset.payload).some((section) =>
    presetSectionHasMissingResources(preset.payload, section),
  )
}

export function applicationDraftIsValid(
  draft: PresetApplicationDraft,
  embeddings: Parameters<typeof promptHasAmbiguousEmbedding>[1] = [],
): boolean {
  return (
    draft.selectedSections.length > 0 &&
    !draft.selectedSections.some((section) =>
      presetSectionHasMissingResources(draft.payload, section, embeddings),
    )
  )
}

export function summarizePresetSection(payload: PresetPayload, section: PresetSectionKey): string {
  switch (section) {
    case 'denoisingStrength': {
      return payload.denoisingStrength === undefined
        ? 'Not set'
        : payload.denoisingStrength.toFixed(2)
    }
    case 'guidance': {
      return payload.guidance
        ? `${payload.guidance.steps} steps · CFG ${payload.guidance.cfgScale}`
        : 'Not set'
    }
    case 'loras': {
      return (
        payload.loras?.map((lora) => `${lora.resource.name} · ${lora.weight}`).join(', ') || 'None'
      )
    }
    case 'model': {
      return payload.model
        ? `${payload.model.name}${payload.model.version ? ` · ${payload.model.version}` : ''}`
        : 'Not set'
    }
    case 'negativePrompt': {
      return serializeGenerationPrompt(payload.negativePrompt) || 'Empty'
    }
    case 'prompt': {
      return serializeGenerationPrompt(payload.prompt) || 'Empty'
    }
    case 'sampling': {
      return payload.sampling
        ? `${payload.sampling.sampler} · ${payload.sampling.scheduler}`
        : 'Not set'
    }
    case 'seed': {
      if (!payload.seed) {
        return 'Not set'
      }

      return payload.seed.policy === 'fixed'
        ? `Fixed · ${payload.seed.value ?? 0}`
        : payload.seed.policy
    }
    case 'size': {
      return payload.size ? `${payload.size.width} × ${payload.size.height}` : 'Not set'
    }
    case 'vae': {
      return payload.vae?.name ?? 'Not set'
    }
  }
}

export function isPresetSectionEqual(
  left: PresetPayload,
  right: PresetPayload,
  section: PresetSectionKey,
): boolean {
  return JSON.stringify(left[section]) === JSON.stringify(right[section])
}

export function presetSearchText(preset: PresetRecord): string {
  const resourceNames = [
    preset.payload.model?.name,
    preset.payload.vae?.name,
    ...(preset.payload.loras?.map((lora) => lora.resource.name) ?? []),
    ...getPromptEmbeddingRefs(preset.payload.prompt).map((embedding) => embedding.name),
    ...getPromptEmbeddingRefs(preset.payload.negativePrompt).map((embedding) => embedding.name),
  ]

  return [
    preset.name,
    preset.description,
    serializeGenerationPrompt(preset.payload.prompt),
    serializeGenerationPrompt(preset.payload.negativePrompt),
    ...resourceNames,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
}

export function includedSections(payload: PresetPayload): PresetSectionKey[] {
  return sectionOrder.filter((section) => payload[section] !== undefined)
}

export function hasGenerationSections(payload: PresetPayload): boolean {
  return includedSections(payload).length > 0
}

export function isPresetDefinitionValid(definition: PresetDefinition): boolean {
  return definition.name.trim().length > 0 && hasGenerationSections(definition.payload)
}

export function isPresetEqual(left: PresetDefinition, right: PresetDefinition): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function workflowLabel(workflow: PresetWorkflow): string {
  return {
    imageToImage: 'Image to Image',
    smartPatch: 'Smart Patch',
    textToImage: 'Text to Image',
  }[workflow]
}
