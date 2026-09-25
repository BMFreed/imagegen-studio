export type ModelResourceType = 'checkpoint' | 'embedding' | 'lora' | 'upscaler' | 'vae'

export type ModelResourceStatus =
  'checking' | 'downloading' | 'installed' | 'missing' | 'needsAttention'

export interface ModelResourceVersion {
  description: string
  fileName?: string
  id: string
  isDefault: boolean
  label: string
  sizeLabel: string
}

export interface ModelAvailableVersion {
  description: string
  fileName: string
  id: string
  label: string
  sizeLabel: string
}

export interface ModelReferenceSnapshot {
  id: string
  kind: 'Preset' | 'Project' | 'Result'
  label: string
  versionId: string
}

export interface ModelVersionInstallActivity {
  modelName: string
  percentage: number
  status: 'cancelled' | 'completed' | 'downloading'
  versionLabel: string
}

export interface ModelResource {
  availableVersion?: ModelAvailableVersion
  badges: string[]
  baseModel: string
  description?: string
  id: string
  name: string
  predictionType?: 'epsilon' | 'v-pred'
  references?: ModelReferenceSnapshot[]
  sizeLabel: string
  status: ModelResourceStatus
  thumbnailTone: 'blue' | 'green' | 'violet' | 'warning'
  triggerWords?: string[]
  type: ModelResourceType
  versionLabel?: string
  versions?: ModelResourceVersion[]
}
