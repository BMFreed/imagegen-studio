export type ModelResourceType =
  | 'checkpoint'
  | 'lora'
  | 'embedding'
  | 'vae'
  | 'upscaler';

export type ModelResourceStatus =
  | 'installed'
  | 'downloading'
  | 'missing'
  | 'checking'
  | 'needsAttention';

export interface ModelResourceVersion {
  id: string;
  label: string;
  description: string;
  isDefault: boolean;
  sizeLabel: string;
}

export interface ModelResource {
  id: string;
  name: string;
  versionLabel?: string;
  description?: string;
  type: ModelResourceType;
  baseModel: string;
  source: 'CivitAI' | 'Local';
  status: ModelResourceStatus;
  sizeLabel: string;
  thumbnailTone: 'green' | 'blue' | 'violet' | 'warning';
  badges: string[];
  triggerWords?: string[];
  predictionType?: 'epsilon' | 'v-pred';
  versions?: ModelResourceVersion[];
}
