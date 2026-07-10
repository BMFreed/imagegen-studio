import type { PresetRecord, PresetResourceRef } from './presets.types';

const illustriousModel = {
  baseModel: 'Illustrious',
  id: 'illustrious-xl-v1-1',
  name: 'Illustrious XL',
  predictionType: 'v-pred',
  version: 'v1.1 main',
} as const;

const builtInVae: PresetResourceRef = {
  id: 'illustrious-built-in-vae',
  name: 'Illustrious built-in',
};

export const availableLoras = [
  {
    id: 'digital-art',
    name: 'Digital Art',
    version: 'v0.1',
  },
  {
    id: 'detail-tweaker',
    name: 'Detail Tweaker',
    version: 'v1.0',
  },
  {
    id: 'soft-detailer',
    name: 'Soft Detailer',
    version: 'v0.2',
  },
];

export const availableEmbeddings: PresetResourceRef[] = [
  { id: 'bad-hands-negative', name: 'Bad Hands Negative' },
  { id: 'fast-negative', name: 'Fast Negative' },
  { id: 'clean-anime-negative', name: 'Clean Anime Negative' },
];

export const presetResources: PresetRecord[] = [
  {
    description: 'Soft studio lighting baseline for character portraits.',
    favorite: true,
    id: 'studio-portrait-soft-light',
    name: 'Studio Portrait Soft Light',
    payload: {
      embeddings: [availableEmbeddings[0]!, availableEmbeddings[1]!],
      guidance: { cfgScale: 5.5, steps: 30 },
      loras: [
        {
          enabled: true,
          resource: availableLoras[0]!,
          triggerWords: ['digital art', 'painterly'],
          weight: 0.7,
        },
        {
          enabled: false,
          resource: availableLoras[1]!,
          triggerWords: ['detail'],
          weight: 0.4,
        },
      ],
      model: illustriousModel,
      negativePrompt: 'lowres, bad anatomy, blurry, jpeg artifacts, oversaturated',
      prompt:
        'portrait of a woman, soft studio light, rim light, detailed skin, 85mm, shallow depth of field',
      sampling: { sampler: 'DPM++ 2M', scheduler: 'Karras' },
      size: { height: 1216, width: 832 },
      vae: builtInVae,
    },
    tags: ['portrait', 'studio', 'baseline'],
    updatedAt: '2026-07-09T16:42:00.000Z',
    workflow: 'textToImage',
  },
  {
    description: 'Teal-orange grade with a low-denoise film look.',
    favorite: false,
    id: 'cinematic-img2img-pass',
    name: 'Cinematic Img2Img Pass',
    payload: {
      denoisingStrength: 0.28,
      guidance: { cfgScale: 4.5, steps: 28 },
      loras: [
        {
          enabled: true,
          resource: availableLoras[2]!,
          triggerWords: ['soft detail'],
          weight: 0.6,
        },
      ],
      model: illustriousModel,
      negativePrompt: 'lowres, washed out, flat lighting',
      prompt: 'cinematic shot, teal-orange grade, film grain, shallow depth of field',
      sampling: { sampler: 'DPM++ 2M', scheduler: 'Karras' },
      size: { height: 1024, width: 1024 },
    },
    tags: ['cinematic', 'img2img'],
    updatedAt: '2026-07-08T11:10:00.000Z',
    workflow: 'imageToImage',
  },
  {
    description: 'Inpaint pass for fixing anatomy on hands.',
    favorite: true,
    id: 'hand-repair-smart-patch',
    name: 'Hand Repair Smart Patch',
    payload: {
      denoisingStrength: 0.62,
      embeddings: [availableEmbeddings[0]!],
      guidance: { cfgScale: 5, steps: 24 },
      loras: [
        {
          enabled: true,
          resource: availableLoras[1]!,
          triggerWords: ['detail'],
          weight: 0.45,
        },
      ],
      model: illustriousModel,
      negativePrompt: 'bad hands, extra fingers, fused fingers',
      prompt: 'detailed hands, natural fingers, correct anatomy',
      sampling: { sampler: 'DPM++ 2M', scheduler: 'Karras' },
      seed: { policy: 'reuse' },
    },
    tags: ['repair', 'hands'],
    updatedAt: '2026-07-07T13:25:00.000Z',
    workflow: 'smartPatch',
  },
  {
    description: 'Texture study preset with a removed reference LoRA.',
    favorite: false,
    id: 'texture-detailer',
    name: 'Texture Detailer',
    payload: {
      embeddings: [availableEmbeddings[0]!],
      loras: [
        {
          enabled: true,
          resource: {
            id: 'texture-detailer-missing',
            missing: true,
            name: 'Texture Detailer',
            version: 'v0.4',
          },
          triggerWords: ['texture detail'],
          weight: 0.8,
        },
      ],
      prompt: 'woven fabric texture, soft light, simple material study',
    },
    tags: ['texture', 'example'],
    updatedAt: '2026-07-06T09:00:00.000Z',
    workflow: 'textToImage',
  },
  {
    description: 'Clean anime line-art with explicit VAE override.',
    favorite: true,
    id: 'anime-clean-lines',
    name: 'Anime Clean Lines',
    payload: {
      guidance: { cfgScale: 5.2, steps: 26 },
      model: illustriousModel,
      negativePrompt: 'sketch, rough lines, blurry',
      prompt: 'clean anime line art, precise contours, flat colors',
      sampling: { sampler: 'Euler a', scheduler: 'Normal' },
      vae: builtInVae,
    },
    tags: ['anime', 'line art'],
    updatedAt: '2026-07-05T18:30:00.000Z',
    workflow: 'textToImage',
  },
  {
    description: 'Low-denoise preparation pass before external upscaling.',
    favorite: false,
    id: 'upscale-prep-denoise',
    name: 'Upscale Prep Denoise',
    payload: {
      denoisingStrength: 0.18,
      guidance: { cfgScale: 3.5, steps: 18 },
      model: illustriousModel,
      sampling: { sampler: 'DPM++ SDE', scheduler: 'Karras' },
    },
    tags: ['upscale', 'denoise'],
    updatedAt: '2026-07-04T12:00:00.000Z',
    workflow: 'imageToImage',
  },
];

export const defaultPresetId = 'studio-portrait-soft-light';
