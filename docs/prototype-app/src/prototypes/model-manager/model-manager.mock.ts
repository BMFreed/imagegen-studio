import type { ModelResource } from './model-manager.types';

export const selectedModelId = 'illustrious-xl';

export const modelResources: ModelResource[] = [
  {
    id: 'illustrious-xl',
    name: 'Illustrious XL',
    versionLabel: 'v1.1',
    description: 'Main image model for clean anime and illustration workflows.',
    type: 'checkpoint',
    baseModel: 'Illustrious',
    status: 'installed',
    sizeLabel: '6.6 GB',
    thumbnailTone: 'green',
    badges: ['Checkpoint', 'Illustrious', 'CivitAI'],
    predictionType: 'v-pred',
    versions: [
      {
        id: 'v1-1',
        label: 'v1.1 main',
        description: 'Default for new selections',
        isDefault: true,
        sizeLabel: '6.6 GB'
      },
      {
        id: 'v1-0',
        label: 'v1.0 archive',
        description: 'Kept for older projects and snapshots',
        isDefault: false,
        sizeLabel: '6.4 GB'
      }
    ]
  },
  {
    id: 'digital-art',
    name: 'Digital Art',
    versionLabel: 'v0.1',
    description: 'Painterly concept art style for Illustrious.',
    type: 'lora',
    baseModel: 'Illustrious',
    status: 'installed',
    sizeLabel: '114 MB',
    thumbnailTone: 'blue',
    badges: ['LoRA', 'Trigger words'],
    triggerWords: ['digital art', 'painterly', 'concept art']
  },
  {
    id: 'cedric-diablo',
    name: 'Cedric-Peyravernay Diablo Dishonored Art',
    versionLabel: 'v1.0',
    description: 'Stylized environment and character illustration LoRA.',
    type: 'lora',
    baseModel: 'Illustrious',
    status: 'installed',
    sizeLabel: '228 MB',
    thumbnailTone: 'violet',
    badges: ['LoRA', 'Trigger words'],
    triggerWords: ['cedric peyravernay', 'dishonored style']
  },
  {
    id: 'bad-hands-negative',
    name: 'Bad Hands Negative',
    versionLabel: 'v1.0',
    description: 'Optional negative trigger embedding.',
    type: 'embedding',
    baseModel: 'SDXL',
    status: 'missing',
    sizeLabel: '8 MB',
    thumbnailTone: 'warning',
    badges: ['Embedding', 'Missing file'],
    triggerWords: ['bad-hands-xl']
  },
  {
    id: 'uncanny-valley-noobai',
    name: 'Uncanny Valley NoobAI',
    versionLabel: 'v3',
    description: 'Older checkpoint kept for project compatibility.',
    type: 'checkpoint',
    baseModel: 'NoobAI',
    status: 'installed',
    sizeLabel: '6.5 GB',
    thumbnailTone: 'green',
    badges: ['Checkpoint', 'Older']
  },
  {
    id: 'nmkd-superscale',
    name: '4x NMKD Superscale',
    versionLabel: 'v2',
    description: 'ESRGAN upscaler model.',
    type: 'upscaler',
    baseModel: 'ESRGAN',
    status: 'checking',
    sizeLabel: '64 MB',
    thumbnailTone: 'blue',
    badges: ['Upscaler']
  }
];
