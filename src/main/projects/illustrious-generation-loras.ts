import type { IllustriousNoiseProfileV1 } from '../../shared/projects/illustrious-noise-profile.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import { RecordedGenerationLoraStackSchema } from '../../shared/projects/project-schema.js'

import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { ModelService } from '../models/model-service.js'

export type GenerationModelResolver = Pick<
  ModelService,
  | 'assertNoUnboundGenerationEmbeddings'
  | 'resolveVerifiedGenerationEmbeddingForPlan'
  | 'resolveVerifiedGenerationLoraForPlan'
  | 'resolveVerifiedGenerationVaeForPlan'
> & {
  /** Production supplies a policy; historical controlled resolvers retain baseline omission. */
  resolveVerifiedGenerationCheckpointForPlan: (
    ...args: Parameters<ModelService['resolveVerifiedGenerationCheckpointForPlan']>
  ) => Promise<
    Omit<
      Awaited<ReturnType<ModelService['resolveVerifiedGenerationCheckpointForPlan']>>,
      'noiseProfile'
    > & {
      noiseProfile?: IllustriousNoiseProfileV1
    }
  >
}
export type FrozenLoraStack = IgsProjectDocumentV1['generationDraft']['loras']
export interface FrozenGenerationLora {
  byteSize: number
  managedPath: string
  reference: FrozenLoraStack[number]['resource']
  weight: number
}
export interface IllustriousWorkerLora {
  byteSize: number
  path: string
  sha256: string
  weight: number
}
interface FrozenLoraFields {
  loras?: FrozenGenerationLora[]
  loraStack?: FrozenLoraStack
}

export function validAuthoredGenerationLoras(stack: FrozenLoraStack): boolean {
  if (!v.safeParse(RecordedGenerationLoraStackSchema, stack).success) {
    return false
  }
  const localModels = new Set<string>()
  const sourceModels = new Set<number>()
  for (const entry of stack) {
    if (!entry.enabled) {
      continue
    }
    const { civitaiModelId, localModelId } = entry.resource
    // Same identity policy as authored one-row-per-model selection, across exact versions.
    if (
      localModels.has(localModelId) ||
      (civitaiModelId !== null && sourceModels.has(civitaiModelId))
    ) {
      return false
    }
    localModels.add(localModelId)
    if (civitaiModelId !== null) {
      sourceModels.add(civitaiModelId)
    }
  }
  return true
}

/** Historical absence stays distinct from a newly recorded empty stack. */
export function frozenLoraFieldsAgree(
  context: FrozenLoraFields,
  wire?: IllustriousWorkerLora[],
): boolean {
  const { loras, loraStack } = context
  if (loraStack === undefined || loras === undefined) {
    return loraStack === undefined && loras === undefined && wire === undefined
  }
  if (!validAuthoredGenerationLoras(loraStack) || !Array.isArray(loras)) {
    return false
  }
  const active = loraStack.filter((entry) => entry.enabled)
  if (
    active.length !== loras.length ||
    new Set(loras.map((entry) => entry.managedPath)).size !== loras.length
  ) {
    return false
  }
  if (
    !active.every((entry, index) => {
      const actual = loras[index]
      return (
        Number.isSafeInteger(actual.byteSize) &&
        actual.byteSize > 0 &&
        Number.isFinite(actual.weight) &&
        path.isAbsolute(actual.managedPath) &&
        path.resolve(actual.managedPath) === actual.managedPath &&
        actual.weight === entry.weight &&
        isDeepStrictEqual(actual.reference, entry.resource)
      )
    })
  ) {
    return false
  }
  return wire !== undefined && isDeepStrictEqual(wire, workerLoras(context))
}

export function workerLoras(context: FrozenLoraFields): IllustriousWorkerLora[] | undefined {
  return context.loras?.map((entry) => ({
    byteSize: entry.byteSize,
    path: entry.managedPath,
    sha256: entry.reference.fileSha256,
    weight: entry.weight,
  }))
}

/** Reverification is deliberately independent of the mutable Project draft and library Default. */
export async function reverifyFrozenGenerationLoras(
  context: FrozenLoraFields,
  models: GenerationModelResolver,
): Promise<void> {
  if (!frozenLoraFieldsAgree(context, workerLoras(context))) {
    throw new Error('The frozen LoRA configuration is invalid.')
  }
  for (const entry of context.loras ?? []) {
    const verified = await models.resolveVerifiedGenerationLoraForPlan(entry.reference)
    if (
      verified.managedPath !== entry.managedPath ||
      verified.byteSize !== entry.byteSize ||
      !isDeepStrictEqual(verified.reference, entry.reference)
    ) {
      throw new Error('The exact LoRA changed after preparation.')
    }
  }
}
