export type PresetWorkflow = 'imageToImage' | 'smartPatch' | 'textToImage';

export type SeedPolicy = 'fixed' | 'random' | 'reuse';

export type PresetSectionKey =
  | 'denoisingStrength'
  | 'embeddings'
  | 'guidance'
  | 'loras'
  | 'model'
  | 'negativePrompt'
  | 'prompt'
  | 'sampling'
  | 'seed'
  | 'size'
  | 'vae';

export interface PresetResourceRef {
  id: string;
  missing?: boolean;
  name: string;
  version?: string;
}

export interface PresetModelRef extends PresetResourceRef {
  baseModel: string;
  predictionType: 'epsilon' | 'v-pred';
}

export interface PresetLora {
  enabled: boolean;
  resource: PresetResourceRef;
  triggerWords: string[];
  weight: number;
}

export interface PresetPayload {
  denoisingStrength?: number;
  embeddings?: PresetResourceRef[];
  guidance?: {
    cfgScale: number;
    steps: number;
  };
  loras?: PresetLora[];
  model?: PresetModelRef;
  negativePrompt?: string;
  prompt?: string;
  sampling?: {
    sampler: string;
    scheduler: string;
  };
  seed?: {
    policy: SeedPolicy;
    value?: number;
  };
  size?: {
    height: number;
    width: number;
  };
  vae?: PresetResourceRef;
}

export interface PresetRecord {
  description: string;
  favorite: boolean;
  id: string;
  name: string;
  payload: PresetPayload;
  tags: string[];
  updatedAt: string;
  workflow: PresetWorkflow;
}

export interface ApplyPresetSection {
  key: string;
  missing?: boolean;
  name: string;
  selected: boolean;
  status: 'optional' | 'ready' | 'replace';
  summary: string;
}

export interface SavePresetForm {
  description: string;
  favorite: boolean;
  name: string;
  sections: PresetSectionKey[];
  tags: string[];
  workflow: PresetWorkflow;
}
