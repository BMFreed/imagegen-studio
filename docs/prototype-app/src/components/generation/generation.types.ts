export type SeedPolicy = 'fixed' | 'random' | 'reuse';

export interface GenerationResourceRef {
  id: string;
  missing?: boolean;
  name: string;
  version?: string;
}

export interface GenerationModelRef extends GenerationResourceRef {
  baseModel: string;
  predictionType: 'epsilon' | 'v-pred';
}

export interface GenerationLora {
  enabled: boolean;
  resource: GenerationResourceRef;
  triggerWords: string[];
  weight: number;
}

export interface GenerationPayload {
  denoisingStrength?: number;
  embeddings?: GenerationResourceRef[];
  guidance?: {
    cfgScale: number;
    steps: number;
  };
  loras?: GenerationLora[];
  model?: GenerationModelRef;
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
  vae?: GenerationResourceRef;
}

export interface GenerationEditorResources {
  embeddings: GenerationResourceRef[];
  loras: GenerationResourceRef[];
  models: GenerationModelRef[];
  vaes: GenerationResourceRef[];
}
