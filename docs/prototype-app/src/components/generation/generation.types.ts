export type SeedPolicy = 'fixed' | 'random' | 'reuse';

export interface GenerationResourceRef {
  id: string;
  missing?: boolean;
  name: string;
  version?: string;
}

export type DanbooruTagCategory = 'artist' | 'character' | 'copyright' | 'general' | 'meta';
export type GenerationPromptPolarity = 'negative' | 'positive';

export interface GenerationEmbeddingResourceRef extends GenerationResourceRef {
  activationToken: string;
  baseModel?: string;
  negativeToken?: string;
  suggestedPolarity?: GenerationPromptPolarity;
}

export interface GenerationLoraResourceRef extends GenerationResourceRef {
  triggerPhrases: string[];
}

export interface GenerationPrompt {
  tokens: GenerationPromptToken[];
}

export interface GenerationCustomPromptToken extends GenerationPromptTokenBase {
  kind: 'custom';
}

export interface GenerationDanbooruPromptToken extends GenerationPromptTokenBase {
  aliases: string[];
  canonicalName: string;
  category: DanbooruTagCategory;
  kind: 'danbooru';
  postCount: number;
}

export interface GenerationDynamicPromptToken extends GenerationPromptTokenBase {
  kind: 'dynamic';
}

export interface GenerationEmbeddingPromptToken extends GenerationPromptTokenBase {
  kind: 'embedding';
  resource: GenerationEmbeddingResourceRef;
}

export interface GenerationLoraTriggerPromptToken extends GenerationPromptTokenBase {
  kind: 'lora-trigger';
  sourceLoraIds: string[];
}

export type GenerationPromptToken =
  | GenerationCustomPromptToken
  | GenerationDanbooruPromptToken
  | GenerationDynamicPromptToken
  | GenerationEmbeddingPromptToken
  | GenerationLoraTriggerPromptToken;

export interface GenerationModelRef extends GenerationResourceRef {
  baseModel: string;
  predictionType: 'epsilon' | 'v-pred';
}

export interface GenerationLora {
  enabled: boolean;
  resource: GenerationLoraResourceRef;
  weight: number;
}

export interface GenerationPayload {
  denoisingStrength?: number;
  guidance?: {
    cfgScale: number;
    steps: number;
  };
  loras?: GenerationLora[];
  model?: GenerationModelRef;
  negativePrompt?: GenerationPrompt;
  prompt?: GenerationPrompt;
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
  embeddings: GenerationEmbeddingResourceRef[];
  loras: GenerationLoraResourceRef[];
  models: GenerationModelRef[];
  vaes: GenerationResourceRef[];
}

interface GenerationPromptTokenBase {
  id: string;
  text: string;
}
