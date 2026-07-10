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

export interface PresetDefinition {
  description: string;
  favorite: boolean;
  name: string;
  payload: PresetPayload;
  tags: string[];
  workflow: PresetWorkflow;
}

export interface PresetRecord extends PresetDefinition {
  id: string;
  updatedAt: string;
}

export type PresetCreateIntent =
  | {
      definition: PresetDefinition;
      kind: 'project';
      projectName: string;
      projectSummary: string;
    }
  | { kind: 'manual' };

export interface PresetApplicationDraft {
  payload: PresetPayload;
  selectedSections: PresetSectionKey[];
  sourcePresetId: string;
}

export interface PresetEditorResources {
  embeddings: PresetResourceRef[];
  loras: PresetResourceRef[];
  models: PresetModelRef[];
  vaes: PresetResourceRef[];
}
