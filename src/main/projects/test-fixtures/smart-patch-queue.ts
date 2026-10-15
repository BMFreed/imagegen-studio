import { compileAnimaFlowSamplingPlan } from '../../../shared/projects/anima-flow-sampling-plan.js'
import { defaultIllustriousNoiseProfile } from '../../../shared/projects/illustrious-noise-profile.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { GenerationQueueTestHooks } from '../generation-queue.js'
import type { SmartPatchExecutionModelResolver } from '../project-smart-patch-execution.js'
import type { SmartPatchInputMaterial } from '../smart-patch-frozen-input.js'
import type { AnimaStagingFixture } from './anima-staging.js'

import { GenerationQueueRepository } from '../generation-queue.js'
import { localProjectRecoveryKey } from '../project-identity.js'
import { captureSmartPatchInputMaterial } from '../smart-patch-frozen-input.js'
import { withAnimaStagingFixture } from './anima-staging.js'
import { literalSmartPatchPreparedInput } from './smart-patch-input-material.js'

export type SmartPatchQueueFixture = Omit<AnimaStagingFixture, 'queue'> & {
  material: SmartPatchInputMaterial
  models: SmartPatchExecutionModelResolver
  queue: GenerationQueueRepository
}
type Family = 'anima' | 'illustrious'
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

/**
 * Actual SQLite/Project/files, literal PNG inputs and a declared exact-file catalog resolver. The
 * resolver checks real file identities; these bytes are not trained model/header qualification.
 */
export async function withSmartPatchQueueFixture(
  family: Family,
  run: (f: SmartPatchQueueFixture) => Promise<void>,
  hooks: GenerationQueueTestHooks = {},
) {
  await withAnimaStagingFixture(async (normal) => {
    const { executions, prepared } = literalSmartPatchPreparedInput(family, 'inpaint')
    prepared.context.projectKey = localProjectRecoveryKey(normal.projectPath)
    prepared.context.documentId = normal.prepared.context.documentId
    prepared.context.documentRevision = normal.prepared.context.documentRevision
    const unused = async (): Promise<never> => {
      throw new Error('An unselected resource must not resolve')
    }
    const models: SmartPatchExecutionModelResolver = {
      assertNoUnboundGenerationEmbeddings: async () => undefined,
      resolveVerifiedAnimaGenerationLoraForPlan: unused,
      resolveVerifiedGenerationAnimaBundleForPlan: unused,
      resolveVerifiedGenerationCheckpointForPlan: unused,
      resolveVerifiedGenerationEmbeddingForPlan: unused,
      resolveVerifiedGenerationLoraForPlan: unused,
      resolveVerifiedGenerationVaeForPlan: unused,
    }
    if (family === 'anima') {
      const bundle = normal.prepared.context.model
      prepared.context.generationDraft.model = structuredClone(bundle.checkpoint.reference)
      const request = executions[0].request
      assert.equal(request.family, 'anima')
      if (request.family !== 'anima') {
        assert.fail('Anima fixture request')
      }
      const component = (entry: { byteSize: number; managedPath: string; sha256: string }) => ({
        byteSize: entry.byteSize,
        path: entry.managedPath,
        sha256: entry.sha256,
      })
      request.inference = {
        ...request.inference,
        model: {
          architecture: bundle.architecture,
          checkpoint: {
            byteSize: bundle.checkpoint.byteSize,
            path: bundle.checkpoint.managedPath,
            sha256: bundle.checkpoint.reference.fileSha256,
          },
          qwen3Encoder: component(bundle.qwen3Encoder),
          vae: component(bundle.vae),
        },
      }
      models.resolveVerifiedGenerationAnimaBundleForPlan =
        normal.modelService.resolveVerifiedGenerationAnimaBundleForPlan.bind(normal.modelService)
    } else {
      const file = path.join(normal.root, 'smart-patch-checkpoint.safetensors')
      const bytes = Buffer.from('declared exact checkpoint fixture, not trained weights')
      await writeFile(file, bytes)
      const reference = prepared.context.generationDraft.model!
      reference.fileSha256 = digest(bytes)
      const request = executions[0].request
      if (request.family !== 'illustrious') {
        assert.fail('Illustrious fixture request')
      }
      request.inference.checkpoint = {
        path: file,
        predictionType: 'v_prediction',
        sha256: digest(bytes),
      }
      models.resolveVerifiedGenerationCheckpointForPlan = async (saved) => {
        const actual = await readFile(file)
        assert.equal(
          digest(actual),
          reference.fileSha256,
          'The exact managed checkpoint bytes changed',
        )
        assert.equal(saved.fileSha256, reference.fileSha256)
        return {
          managedPath: file,
          noiseProfile: defaultIllustriousNoiseProfile(),
          reference: { ...structuredClone(reference), predictionType: 'v_prediction' },
        }
      }
    }
    const second = structuredClone(executions[0])
    second.item.seed = 1
    if (second.request.family === 'anima') {
      second.request.inference = {
        ...second.request.inference,
        sampling: compileAnimaFlowSamplingPlan({
          guidanceScale: 4,
          height: 64,
          mode: 'img2img',
          scheduler: 'euler',
          seed: 1,
          steps: 3,
          strength: 0.5,
          width: 64,
        }),
      }
    } else {
      second.request.inference.sampling.seed = 1
    }
    const material = await captureSmartPatchInputMaterial(prepared, [executions[0], second])
    const queue = new GenerationQueueRepository(normal.database.db, normal.root, hooks)
    await queue.recoverAfterRestart()
    await run({ ...normal, material, models, queue })
  })
}

export function admitSmartPatch(
  f: SmartPatchQueueFixture,
  overrides: Partial<
    Parameters<GenerationQueueRepository['enqueuePreparedSmartPatchBatch']>[0]
  > = {},
) {
  return f.queue.enqueuePreparedSmartPatchBatch({
    assertCurrent: () => undefined,
    material: f.material,
    modelService: f.models,
    projectPath: f.projectPath,
    stagingSessionId: randomUUID(),
    ...overrides,
  })
}
