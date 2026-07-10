import type {
  PresetPayload,
  PresetRecord,
  PresetSectionKey,
  PresetWorkflow,
} from './presets.types';

export const workflowLabels: Record<PresetWorkflow, string> = {
  imageToImage: 'Image to Image',
  smartPatch: 'Smart Patch',
  textToImage: 'Text to Image',
};

export const sectionLabels: Record<PresetSectionKey, string> = {
  denoisingStrength: 'Denoising Strength',
  embeddings: 'Embeddings',
  guidance: 'Steps & CFG',
  loras: 'LoRA',
  model: 'Model',
  negativePrompt: 'Negative',
  prompt: 'Prompt',
  sampling: 'Sampler',
  seed: 'Seed',
  size: 'Size',
  vae: 'VAE',
};

export const sectionOrder = [
  'prompt',
  'negativePrompt',
  'model',
  'loras',
  'embeddings',
  'size',
  'sampling',
  'guidance',
  'denoisingStrength',
  'seed',
  'vae',
] as const satisfies readonly PresetSectionKey[];

export function clonePreset<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function presetHasMissingResources(preset: PresetRecord): boolean {
  const resources = [
    preset.payload.model,
    preset.payload.vae,
    ...(preset.payload.loras?.map((lora) => lora.resource) ?? []),
    ...(preset.payload.embeddings ?? []),
  ];

  return resources.some((resource) => resource?.missing === true);
}

export function presetSearchText(preset: PresetRecord): string {
  const resourceNames = [
    preset.payload.model?.name,
    preset.payload.vae?.name,
    ...(preset.payload.loras?.map((lora) => lora.resource.name) ?? []),
    ...(preset.payload.embeddings?.map((embedding) => embedding.name) ?? []),
  ];

  return [
    preset.name,
    preset.description,
    preset.payload.prompt,
    preset.payload.negativePrompt,
    ...resourceNames,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

export function includedSections(payload: PresetPayload): PresetSectionKey[] {
  return sectionOrder.filter((section) => payload[section] !== undefined);
}

export function hasGenerationSections(payload: PresetPayload): boolean {
  return includedSections(payload).length > 0;
}

export function isPresetEqual(left: PresetRecord, right: PresetRecord): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
