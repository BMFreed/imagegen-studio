import type { PromptEmbeddingRef } from '../../../shared/projects/prompt-embeddings.js'

import { randomUUID } from 'node:crypto'
import path from 'node:path'

import type {
  FrozenGenerationEmbedding,
  FrozenGenerationEmbeddings,
} from '../illustrious-generation-embeddings.js'

/** Frozen identity inputs for real queue/storage tests; these descriptors are not ML weights. */
export function capturedEmbeddingFieldsFixture(root: string): {
  embeddingRefs: { negative: PromptEmbeddingRef[]; positive: PromptEmbeddingRef[] }
  embeddings: FrozenGenerationEmbeddings
  prompts: { negative: string; positive: string }
} {
  const descriptor = (name: string, source: number, token: string): FrozenGenerationEmbedding => ({
    byteSize: 32,
    managedPath: path.join(root, `${name}.safetensors`),
    reference: {
      baseModelFamily: 'illustrious',
      civitaiFileId: source + 2,
      civitaiModelId: source,
      civitaiVersionId: source + 1,
      displayName: `Copied ${name}`,
      fileSha256: source.toString(16).padStart(64, '0'),
      kind: 'embedding',
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: null,
      versionName: 'Copied exact v1',
    },
    token,
  })
  const positive = descriptor('positive-embedding', 120, '<shared>')
  const negative = descriptor('negative-embedding', 140, '<shared>')
  const inactive = descriptor('inactive-embedding', 160, '<inactive>')
  const ref = ({ reference, token }: FrozenGenerationEmbedding): PromptEmbeddingRef => ({
    resource: structuredClone(reference),
    token,
  })
  return {
    embeddingRefs: { negative: [ref(negative)], positive: [ref(positive), ref(inactive)] },
    embeddings: { negative: [negative], positive: [positive] },
    prompts: { negative: 'blur <shared>', positive: 'portrait <shared>' },
  }
}
