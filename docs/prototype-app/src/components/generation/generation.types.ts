export type SeedPolicy = 'fixed' | 'random' | 'reuse'

export interface GenerationResourceRef {
  id: string
  missing?: boolean
  name: string
  version?: string
}

export type DanbooruTagCategory = 'artist' | 'character' | 'copyright' | 'general' | 'meta'
export type GenerationPromptPolarity = 'negative' | 'positive'

export interface GenerationEmbeddingResourceRef extends GenerationResourceRef {
  activationToken: string
  baseModel?: string
  negativeToken?: string
  suggestedPolarity?: GenerationPromptPolarity
}

export interface GenerationLoraResourceRef extends GenerationResourceRef {
  baseModel?: string
  triggerPhrases: string[]
}

export interface GenerationPromptEmbeddingRef {
  resource: GenerationEmbeddingResourceRef
  token: string
}

export interface GenerationPrompt {
  embeddingRefs: GenerationPromptEmbeddingRef[]
  text: string
}

export interface GenerationPromptSelection {
  anchor: number
  head: number
}

export interface GenerationModelRef extends GenerationResourceRef {
  baseModel: string
  predictionType: 'epsilon' | 'v-pred'
}

export interface GenerationLora {
  enabled: boolean
  resource: GenerationLoraResourceRef
  weight: number
}

export interface GenerationPayload {
  denoisingStrength?: number
  guidance?: {
    cfgScale: number
    steps: number
  }
  loras?: GenerationLora[]
  model?: GenerationModelRef
  negativePrompt?: GenerationPrompt
  prompt?: GenerationPrompt
  sampling?: {
    sampler: string
    scheduler: string
  }
  seed?: {
    policy: SeedPolicy
    value?: number
  }
  size?: {
    height: number
    width: number
  }
  vae?: GenerationResourceRef
}

export interface GenerationEditorResources {
  embeddings: GenerationEmbeddingResourceRef[]
  loras: GenerationLoraResourceRef[]
  models: GenerationModelRef[]
  vaes: GenerationResourceRef[]
}
