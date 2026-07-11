import type { PresetCreateIntent, PresetEditorResources, PresetRecord } from './presets.types';

import { parseLegacyPromptString } from '../../components/generation/generation-prompt.utils';
import {
  generationEditorResources,
  generationEmbeddings,
  generationLoras,
  generationModels,
  generationVaes,
  mockDanbooruTags,
} from '../../components/generation/generation.mock';

const illustriousModel = generationModels[0]!;
const builtInVae = generationVaes[0]!;
export const availableLoras = generationLoras;
export const availableEmbeddings = generationEmbeddings;
export const presetEditorResources: PresetEditorResources = generationEditorResources;

function prompt(value: string, triggerLinks: Record<string, string[]> = {}) {
  const parsed = parseLegacyPromptString(value, availableEmbeddings, mockDanbooruTags);
  parsed.tokens = parsed.tokens.map((token) => {
    const sourceLoraIds = triggerLinks[token.text];
    return sourceLoraIds
      ? { id: token.id, kind: 'lora-trigger' as const, sourceLoraIds, text: token.text }
      : token;
  });
  return parsed;
}

export const presetResources: PresetRecord[] = [
  {
    description: 'Soft studio lighting baseline for character portraits.',
    favorite: true,
    id: 'studio-portrait-soft-light',
    name: 'Studio Portrait Soft Light',
    payload: {
      guidance: { cfgScale: 5.5, steps: 30 },
      loras: [
        {
          enabled: true,
          resource: availableLoras[0]!,
          weight: 0.7,
        },
        {
          enabled: false,
          resource: availableLoras[1]!,
          weight: 0.4,
        },
      ],
      model: illustriousModel,
      negativePrompt: prompt(
        'blurred lines, incomplete composition, <bad-hands-negative>, <fast-negative>',
      ),
      prompt: prompt(
        'portrait of a woman, digital art, soft studio light, rim light, detailed skin, 85mm, shallow depth of field',
        { 'digital art': ['digital-art'] },
      ),
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
          resource: { ...availableLoras[2]!, missing: true },
          weight: 0.6,
        },
      ],
      model: illustriousModel,
      negativePrompt: prompt('lowres, washed out, flat lighting'),
      prompt: prompt('cinematic shot, teal-orange grade, film grain, shallow depth of field'),
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
      guidance: { cfgScale: 5, steps: 24 },
      loras: [
        {
          enabled: true,
          resource: availableLoras[1]!,
          weight: 0.45,
        },
      ],
      model: illustriousModel,
      negativePrompt: prompt('bad hands, extra fingers, fused fingers, <bad-hands-negative>'),
      prompt: prompt('detailed hands, natural fingers, correct anatomy'),
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
      loras: [
        {
          enabled: true,
          resource: {
            id: 'texture-detailer-missing',
            missing: true,
            name: 'Texture Detailer',
            triggerPhrases: ['texture detail'],
            version: 'v0.4',
          },
          weight: 0.8,
        },
      ],
      prompt: prompt('woven fabric texture, soft light, simple material study'),
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
      negativePrompt: prompt('sketch, rough lines, blurry'),
      prompt: prompt('clean anime line art, precise contours, flat colors'),
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

export const currentProjectPresetSource = {
  definition: {
    description: '',
    favorite: true,
    name: 'Sample Portrait Baseline',
    payload: {
      guidance: { cfgScale: 5.5, steps: 30 },
      loras: [
        {
          enabled: true,
          resource: availableLoras[0]!,
          weight: 0.7,
        },
      ],
      model: illustriousModel,
      negativePrompt: prompt(
        'blurred lines, incomplete composition, <bad-hands-negative>, <fast-negative>',
      ),
      prompt: prompt(
        'portrait illustration of a person, digital art, simple background, soft light',
        { 'digital art': ['digital-art'] },
      ),
      sampling: { sampler: 'Euler a', scheduler: 'Normal' },
      seed: { policy: 'fixed', value: 184_235 },
      size: { height: 1216, width: 832 },
      vae: builtInVae,
    },
    tags: ['sample', 'portrait'],
    workflow: 'textToImage',
  },
  kind: 'project',
  projectName: 'Sample Project B.igs',
  projectSummary: '832 × 1216 · Illustrious XL v1.1',
} satisfies PresetCreateIntent;
