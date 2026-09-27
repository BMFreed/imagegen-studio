import type { BaseModelFamily, ModelPredictionType } from './model-repository.js'

/** SDXL prediction objectives here qualify Illustrious checkpoints only, never Anima's flow model. */
export interface CheckpointCompatibilityFingerprint {
  readonly baseModelFamily: 'illustrious'
  readonly predictionType: ModelPredictionType
  readonly sha256: string
  readonly sizeBytes: number
}

/** An app-reviewed declaration for one exact checkpoint file, never a family-wide default. */
export interface CheckpointCompatibilityRecord extends CheckpointCompatibilityFingerprint {
  readonly evidence: {
    readonly checkpointPath: string
    readonly repository: string
    readonly revision: string
    readonly safetensorsHeaderSha256: string
    readonly schedulerConfigPath: string
  }
}

/**
 * OnomaAI's pinned checkpoint has in-file safetensors metadata declaring epsilon, and its pinned
 * release also contains the SHA-256/size pointer and matching scheduler config. The same checkpoint
 * bytes are available as CivitAI model 795765/version 889818/file 798303. CivitAI identity is
 * intentionally not a qualification key: only verified local bytes are.
 */
export const CHECKPOINT_COMPATIBILITY_MANIFEST: readonly CheckpointCompatibilityRecord[] = [
  {
    baseModelFamily: 'illustrious',
    evidence: {
      checkpointPath: 'Illustrious-XL-v0.1.safetensors',
      repository: 'OnomaAIResearch/Illustrious-xl-early-release-v0',
      revision: 'dca0dac303e6dc4b0c31d8001bc685b89b5d0204',
      safetensorsHeaderSha256: 'fdc4c10c26c4240e75b81d47e1950eb1a5424025b72d01109937ae9c067d0de6',
      schedulerConfigPath: 'scheduler/scheduler_config.json',
    },
    predictionType: 'epsilon',
    sha256: '3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9',
    sizeBytes: 6_938_040_760,
  },
]

export function qualifiedCheckpointPredictionType(
  file: { baseModelFamily: BaseModelFamily | null; sha256: string; sizeBytes: number },
  manifest: readonly CheckpointCompatibilityFingerprint[] = CHECKPOINT_COMPATIBILITY_MANIFEST,
): ModelPredictionType | null {
  if (
    !/^[a-f0-9]{64}$/.test(file.sha256) ||
    !Number.isSafeInteger(file.sizeBytes) ||
    file.sizeBytes < 1
  ) {
    return null
  }
  const matches = manifest.filter(
    (record) =>
      record.baseModelFamily === file.baseModelFamily &&
      record.sha256 === file.sha256 &&
      record.sizeBytes === file.sizeBytes,
  )
  if (matches.length > 1) {
    throw new Error('Duplicate checkpoint compatibility records')
  }
  return matches[0]?.predictionType ?? null
}
