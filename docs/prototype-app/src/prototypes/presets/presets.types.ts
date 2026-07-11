import type {
  GenerationEditorResources,
  GenerationLora,
  GenerationModelRef,
  GenerationPayload,
  GenerationResourceRef,
} from '../../components/generation/generation.types'

export type PresetWorkflow = 'imageToImage' | 'smartPatch' | 'textToImage'

export type PresetSectionKey =
  | 'denoisingStrength'
  | 'guidance'
  | 'loras'
  | 'model'
  | 'negativePrompt'
  | 'prompt'
  | 'sampling'
  | 'seed'
  | 'size'
  | 'vae'

export type PresetResourceRef = GenerationResourceRef
export type PresetModelRef = GenerationModelRef
export type PresetLora = GenerationLora
export type PresetPayload = GenerationPayload

export interface PresetDefinition {
  description: string
  favorite: boolean
  name: string
  payload: PresetPayload
  tags: string[]
  workflow: PresetWorkflow
}

export interface PresetRecord extends PresetDefinition {
  id: string
  updatedAt: string
}

export type PresetCreateIntent =
  | {
      definition: PresetDefinition
      kind: 'project'
      projectName: string
      projectSummary: string
    }
  | { kind: 'manual' }

export interface PresetApplicationDraft {
  payload: PresetPayload
  selectedSections: PresetSectionKey[]
  sourcePresetId: string
}

export type PresetEditorResources = GenerationEditorResources

export { type SeedPolicy } from '../../components/generation/generation.types'
