/**
 * Pinned reference artifacts for the explicitly supported Anima Base 1.0 checkpoint. File metadata
 * comes from the Hugging Face tree API at ANIMA_HF_REVISION. An Anima architecture match alone does
 * not establish companion compatibility.
 */

export const ANIMA_HF_REVISION = 'f973fc41ec7545364ac9776c2440285f43ff2a30'

const ANIMA_REPOSITORY = 'circlestone-labs/Anima'
const ANIMA_REPOSITORY_URL = `https://huggingface.co/${ANIMA_REPOSITORY}`

export const ANIMA_SOURCE_LICENSE = Object.freeze({
  id: 'circlestone-labs-non-commercial-license',
  url: `${ANIMA_REPOSITORY_URL}/blob/${ANIMA_HF_REVISION}/LICENSE.md`,
})

export type AnimaArtifactRole = 'checkpoint' | 'qwen3-encoder' | 'vae'

export interface AnimaArtifact {
  readonly license: typeof ANIMA_SOURCE_LICENSE
  readonly path: string
  readonly repository: string
  readonly revision: string
  readonly role: AnimaArtifactRole
  readonly sha256: string
  readonly sizeBytes: number
  readonly url: string
}

function artifact(
  role: AnimaArtifactRole,
  path: string,
  sizeBytes: number,
  sha256: string,
): AnimaArtifact {
  return Object.freeze({
    license: ANIMA_SOURCE_LICENSE,
    path,
    repository: ANIMA_REPOSITORY,
    revision: ANIMA_HF_REVISION,
    role,
    sha256,
    sizeBytes,
    url: `${ANIMA_REPOSITORY_URL}/resolve/${ANIMA_HF_REVISION}/${path}`,
  })
}

export const ANIMA_BASE_1_0_CHECKPOINT = artifact(
  'checkpoint',
  'split_files/diffusion_models/anima-base-v1.0.safetensors',
  4_182_218_328,
  'bd43b7cffe1ed1153d9c41e7beb2f18cb1273eafbaa3af3edd6a173dc90a006e',
)

export const ANIMA_QWEN3_0_6B_ENCODER = artifact(
  'qwen3-encoder',
  'split_files/text_encoders/qwen_3_06b_base.safetensors',
  1_192_135_096,
  'cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba',
)

export const ANIMA_QWEN_IMAGE_VAE = artifact(
  'vae',
  'split_files/vae/qwen_image_vae.safetensors',
  253_806_246,
  'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f',
)

export const ANIMA_BASE_1_0_COMPANIONS: readonly AnimaArtifact[] = Object.freeze([
  ANIMA_QWEN3_0_6B_ENCODER,
  ANIMA_QWEN_IMAGE_VAE,
])

export const ANIMA_BASE_1_0_COMPANION_BYTES = ANIMA_BASE_1_0_COMPANIONS.reduce(
  (total, companion) => total + companion.sizeBytes,
  0,
)

export const ANIMA_BASE_1_0_TOTAL_BYTES =
  ANIMA_BASE_1_0_CHECKPOINT.sizeBytes + ANIMA_BASE_1_0_COMPANION_BYTES

export type AnimaDependencyResolution =
  | Readonly<{
      checkpoint: AnimaArtifact
      companions: readonly AnimaArtifact[]
      supported: true
      totalBytes: number
    }>
  | Readonly<{ reason: 'unsupported-checkpoint'; supported: false }>

const SUPPORTED_BASE_1_0: AnimaDependencyResolution = Object.freeze({
  checkpoint: ANIMA_BASE_1_0_CHECKPOINT,
  companions: ANIMA_BASE_1_0_COMPANIONS,
  supported: true,
  totalBytes: ANIMA_BASE_1_0_TOTAL_BYTES,
})

const UNSUPPORTED_CHECKPOINT: AnimaDependencyResolution = Object.freeze({
  reason: 'unsupported-checkpoint',
  supported: false,
})

/** Resolve a pinned hash; the caller must verify the downloaded checkpoint bytes. */
export function resolveAnimaDependencies(
  checkpointSha256: string | null | undefined,
): AnimaDependencyResolution {
  return typeof checkpointSha256 === 'string' &&
    checkpointSha256.toLowerCase() === ANIMA_BASE_1_0_CHECKPOINT.sha256
    ? SUPPORTED_BASE_1_0
    : UNSUPPORTED_CHECKPOINT
}
