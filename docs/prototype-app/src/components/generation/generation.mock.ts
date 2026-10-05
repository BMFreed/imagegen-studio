import type { DanbooruTagMock } from './generation-prompt.utils'
import type {
  GenerationEditorResources,
  GenerationEmbeddingResourceRef,
  GenerationLoraResourceRef,
  GenerationModelRef,
  GenerationResourceRef,
} from './generation.types'

export const generationModels: GenerationModelRef[] = [
  {
    baseModel: 'Illustrious',
    baseModelFamily: 'illustrious',
    id: 'illustrious-xl-v1-1',
    name: 'Illustrious XL',
    predictionType: 'v-pred',
    version: 'v1.1 main',
  },
  {
    baseModel: 'Illustrious',
    baseModelFamily: 'illustrious',
    id: 'illustrious-xl-v1-0',
    name: 'Illustrious XL',
    predictionType: 'v-pred',
    version: 'v1.0 archive',
  },
  {
    baseModel: 'NoobAI',
    baseModelFamily: null,
    id: 'noobai-xl-v3',
    name: 'NoobAI XL',
    predictionType: 'epsilon',
    version: 'v3',
  },
  {
    baseModel: 'Anima',
    baseModelFamily: 'anima',
    id: 'anima-base-v1',
    name: 'Anima',
    version: 'Base 1.0',
  },
]

export const generationLoras: GenerationLoraResourceRef[] = [
  {
    baseModel: 'Illustrious',
    id: 'digital-art',
    name: 'Digital Art',
    triggerPhrases: ['digital art', 'painterly', 'concept art'],
    version: 'v0.1',
  },
  {
    baseModel: 'Illustrious',
    id: 'detail-tweaker',
    name: 'Detail Tweaker',
    triggerPhrases: ['highly detailed', 'intricate detail'],
    version: 'v1.0',
  },
  {
    baseModel: 'Illustrious',
    id: 'soft-detailer',
    name: 'Soft Detailer',
    triggerPhrases: ['soft detail', 'delicate texture'],
    version: 'v0.2',
  },
]

export const generationEmbeddings: GenerationEmbeddingResourceRef[] = [
  {
    activationToken: '<bad-hands-negative>',
    baseModel: 'Illustrious',
    id: 'bad-hands-negative',
    name: 'Bad Hands Negative',
    negativeToken: '<bad-hands-negative>',
    suggestedPolarity: 'negative',
  },
  {
    activationToken: '<fast-negative>',
    baseModel: 'Illustrious',
    id: 'fast-negative',
    name: 'Fast Negative',
    negativeToken: '<fast-negative>',
    suggestedPolarity: 'negative',
  },
  {
    activationToken: '<clean-anime>',
    baseModel: 'Illustrious',
    id: 'clean-anime-negative',
    name: 'Clean Anime Negative',
    negativeToken: '<clean-anime-negative>',
    suggestedPolarity: 'negative',
  },
]

export const generationVaes: GenerationResourceRef[] = [
  { id: 'illustrious-built-in-vae', name: 'Illustrious built-in' },
  { id: 'none', name: 'None' },
]

export const mockDanbooruTags: DanbooruTagMock[] = [
  { aliases: ['1girls', 'solo female'], category: 'general', name: '1girl', postCount: 6_008_644 },
  { aliases: ['portrait'], category: 'general', name: 'portrait', postCount: 1_420_000 },
  { aliases: ['rim light'], category: 'general', name: 'rim_light', postCount: 182_400 },
  { aliases: ['detailed skin'], category: 'general', name: 'detailed_skin', postCount: 96_200 },
  { aliases: ['studio light'], category: 'general', name: 'studio_lighting', postCount: 153_800 },
  { aliases: ['depth of field'], category: 'general', name: 'depth_of_field', postCount: 892_100 },
  { aliases: ['green eyes'], category: 'general', name: 'green_eyes', postCount: 1_801_000 },
  { aliases: ['solo'], category: 'general', name: 'solo', postCount: 4_210_000 },
  { aliases: ['high detail'], category: 'meta', name: 'highly_detailed', postCount: 505_000 },
  { aliases: ['concept art'], category: 'meta', name: 'concept_art', postCount: 210_000 },
  { aliases: ['bad anatomy'], category: 'meta', name: 'bad_anatomy', postCount: 145_000 },
  { aliases: ['low res'], category: 'meta', name: 'lowres', postCount: 1_990_000 },
]

export const generationEditorResources: GenerationEditorResources = {
  embeddings: generationEmbeddings,
  loras: generationLoras,
  models: generationModels,
  vaes: generationVaes,
}
