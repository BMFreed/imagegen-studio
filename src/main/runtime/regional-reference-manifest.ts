/**
 * Fixed internal Standard SDXL ViT-H pair, adapted from InvokeAI 4875d965's sd/ip_adapter.py ->
 * CLIP_VISION_MODEL_MAP and model loaders. The checkpoint caller's ViT-H selection is
 * authoritative; the SDXL-named starter dependency is a different tower. Exact publisher identities
 * were verified before this manifest was authored.
 */
export const REGIONAL_REFERENCE_ADAPTER_ARTIFACT = Object.freeze({
  filename: 'illustrious-regional-reference-adapter.safetensors',
  role: 'regional-reference-adapter' as const,
  sha256: 'ebf05d918348aec7abb02a5e9ecef77e0aaea6914a5c4ea13f50d45eb1681831',
  sizeBytes: 698_391_064,
  source: 'invoke-regional-reference' as const,
  sourceFilename: 'ip-adapter_sdxl_vit-h.safetensors',
  sourceRepository: 'InvokeAI/ip_adapter_sdxl_vit_h',
  sourceRevision: 'cf41dfaaed08cb09ba165374aa0890ab08544351',
  url: 'https://huggingface.co/InvokeAI/ip_adapter_sdxl_vit_h/resolve/cf41dfaaed08cb09ba165374aa0890ab08544351/ip-adapter_sdxl_vit-h.safetensors',
})

export const REGIONAL_REFERENCE_VISION_DIRECTORY = 'illustrious-regional-reference-vision'

export const REGIONAL_REFERENCE_VISION_CONFIG_ARTIFACT = Object.freeze({
  filename: 'config.json',
  role: 'regional-reference-vision-config' as const,
  sha256: '625d37b31afbf2f0792a87846b3654ee23f20568409e35b78a1f795b04e1a7a1',
  sizeBytes: 560,
  source: 'invoke-regional-reference' as const,
  sourceFilename: 'config.json',
  sourceRepository: 'InvokeAI/ip_adapter_sd_image_encoder',
  sourceRevision: 'bb91c1a4950fe88fe3504f46e6a21b872c5c7f6b',
  url: 'https://huggingface.co/InvokeAI/ip_adapter_sd_image_encoder/resolve/bb91c1a4950fe88fe3504f46e6a21b872c5c7f6b/config.json',
})

export const REGIONAL_REFERENCE_VISION_MODEL_ARTIFACT = Object.freeze({
  filename: 'model.safetensors',
  role: 'regional-reference-vision-model' as const,
  sha256: '6ca9667da1ca9e0b0f75e46bb030f7e011f44f86cbfb8d5a36590fcd7507b030',
  sizeBytes: 2_528_373_448,
  source: 'invoke-regional-reference' as const,
  sourceFilename: 'model.safetensors',
  sourceRepository: 'InvokeAI/ip_adapter_sd_image_encoder',
  sourceRevision: 'bb91c1a4950fe88fe3504f46e6a21b872c5c7f6b',
  url: 'https://huggingface.co/InvokeAI/ip_adapter_sd_image_encoder/resolve/bb91c1a4950fe88fe3504f46e6a21b872c5c7f6b/model.safetensors',
})

export const REGIONAL_REFERENCE_ARTIFACTS = Object.freeze([
  REGIONAL_REFERENCE_ADAPTER_ARTIFACT,
  REGIONAL_REFERENCE_VISION_CONFIG_ARTIFACT,
  REGIONAL_REFERENCE_VISION_MODEL_ARTIFACT,
])

export type RegionalReferenceResourceRole = (typeof REGIONAL_REFERENCE_ARTIFACTS)[number]['role']
