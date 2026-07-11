export type ModelResourceType = 'checkpoint' | 'embedding' | 'lora' | 'upscaler' | 'vae'

export type ModelResourceStatus =
  'checking' | 'downloading' | 'installed' | 'missing' | 'needsAttention'

export interface ModelResourceVersion {
  description: string
  id: string
  isDefault: boolean
  label: string
  sizeLabel: string
}

export interface ModelResource {
  badges: string[]
  baseModel: string
  description?: string
  id: string
  name: string
  predictionType?: 'epsilon' | 'v-pred'
  sizeLabel: string
  status: ModelResourceStatus
  thumbnailTone: 'blue' | 'green' | 'violet' | 'warning'
  triggerWords?: string[]
  type: ModelResourceType
  versionLabel?: string
  versions?: ModelResourceVersion[]
}
