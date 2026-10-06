import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { OutpaintInfillResolver } from '../../runtime/inference-auxiliary-resources.js'
import type { AnimaGenerationModelResolver } from '../anima-generation-preparation.js'
import type { PreparedOutpaintGeneration } from '../generation-queue.js'
import type { GenerationModelResolver } from '../illustrious-generation-loras.js'
import type { FrozenGenerationTarget } from '../project-generation-target.js'
import type { AnimaStagingFixture } from './anima-staging.js'

import { LAMA_OUTPAINT_ARTIFACT } from '../../runtime/lama-manifest.js'
import { prepareAnimaOutpaintGeneration } from '../anima-generation-preparation.js'
import { prepareNormalOutpaintGeneration } from '../project-generation-preparation.js'
import { localProjectRecoveryKey } from '../project-identity.js'
import { animaFixturePng } from './anima-batch.js'
import { withAnimaStagingFixture } from './anima-staging.js'

export interface OutpaintConsumerFixture extends AnimaStagingFixture {
  infillResolver: OutpaintInfillResolver
  outpaintModels: AnimaGenerationModelResolver & GenerationModelResolver
  outpaintPrepared: PreparedOutpaintGeneration
  target: FrozenGenerationTarget
}

/**
 * Actual preparation, durable SQLite/private inputs and staging capacity. Exact tiny model-file
 * resolvers are controlled collaborators; pinned LaMa identity is an explicit resolver substitute,
 * not a downloaded/verified/trained model. Auxiliary resolver tests own real file verification.
 */
export async function withOutpaintConsumerFixture(
  family: 'anima' | 'illustrious',
  use: (fixture: OutpaintConsumerFixture) => Promise<void>,
): Promise<void> {
  await withAnimaStagingFixture(async (source) => {
    source.prepared.context.prompts = { negative: 'blur', positive: 'ordinary neighbor cat' }
    source.prepared.context.generationDraft.positivePrompt.text =
      source.prepared.context.prompts.positive
    source.prepared.context.generationDraft.negativePrompt.text =
      source.prepared.context.prompts.negative
    const reference = {
      ...source.prepared.context.model.checkpoint.reference,
      baseModelFamily: 'illustrious' as const,
      predictionType: 'epsilon' as const,
    }
    const outpaintModels = {
      ...source.modelService,
      assertNoUnboundGenerationEmbeddings: async () => {},
      resolveVerifiedGenerationCheckpointForPlan: async (
        selected: Parameters<
          GenerationModelResolver['resolveVerifiedGenerationCheckpointForPlan']
        >[0],
      ) => {
        assert.deepEqual(selected, reference)
        const managedPath = source.prepared.context.model.checkpoint.managedPath
        assert.equal(
          createHash('sha256')
            .update(await readFile(managedPath))
            .digest('hex'),
          selected.fileSha256,
        )
        return { managedPath, reference }
      },
      resolveVerifiedGenerationEmbeddingForPlan: async (): Promise<never> => {
        throw new Error('This consumer fixture selects no embedding.')
      },
      resolveVerifiedGenerationLoraForPlan: async (): Promise<never> => {
        throw new Error('This consumer fixture selects no Illustrious LoRA.')
      },
      resolveVerifiedGenerationVaeForPlan: async (): Promise<never> => {
        throw new Error('This consumer fixture selects no external Illustrious VAE.')
      },
    }
    const infillPath = path.join(source.root, 'resolver-substitute-lama.pt')
    await writeFile(infillPath, 'Explicit identity-only LaMa resolver substitute', { mode: 0o600 })
    const infillResolver: OutpaintInfillResolver = {
      resolveVerifiedOutpaintInfill: async () => ({
        byteSize: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
        managedPath: infillPath,
        role: LAMA_OUTPAINT_ARTIFACT.role,
        sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
      }),
    }
    const bytes = await animaFixturePng(128)
    const draft = structuredClone(source.prepared.context.generationDraft)
    draft.model =
      family === 'anima' ? source.prepared.context.model.checkpoint.reference : reference
    draft.loras = []
    draft.positivePrompt.text = 'frozen outpaint (cat:1.5)'
    draft.negativePrompt.text = 'blur'
    draft.sampling.denoisingStrength = 0.5
    const target: FrozenGenerationTarget = {
      bbox: source.prepared.context.bbox,
      composite: {
        ...source.prepared.context.target,
        bytes,
        byteSize: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
      documentId: source.prepared.context.documentId,
      documentRevision: source.prepared.context.documentRevision,
      generationDraft: draft,
      lastActualSeedSnapshot: null,
      mode: 'outpaint',
    }
    const input = { modelService: outpaintModels, target }
    const outpaintPrepared =
      family === 'anima'
        ? await prepareAnimaOutpaintGeneration(input)
        : await prepareNormalOutpaintGeneration(input)
    await use({ ...source, infillResolver, outpaintModels, outpaintPrepared, target })
  })
}

export async function enqueueOutpaintConsumerBatch(
  fixture: OutpaintConsumerFixture,
  options: { items?: readonly PreparedOutpaintGeneration[] } = {},
) {
  const stagingSessionId = randomUUID()
  const items = await fixture.queue.enqueuePreparedOutpaintBatch({
    infillResolver: fixture.infillResolver,
    items: options.items ?? [fixture.outpaintPrepared],
    modelService: fixture.outpaintModels,
    preflight: async (entries) =>
      await fixture.staging.preflightInternalOutpaintBatchCapacity({
        entries,
        localProjectKey: localProjectRecoveryKey(fixture.projectPath),
        projectPath: fixture.projectPath,
        stagingSessionId,
      }),
    projectPath: fixture.projectPath,
    stagingSessionId,
  })
  return { items, stagingSessionId }
}
