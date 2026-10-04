import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'
import {
  activePromptEmbeddingRefs,
  type PromptEmbeddingRef,
} from '../../shared/projects/prompt-embeddings.js'

import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { ModelService } from '../models/model-service.js'

export interface FrozenGenerationEmbedding {
  byteSize: number
  managedPath: string
  reference: PromptEmbeddingRef['resource']
  token: string
}
export interface FrozenGenerationEmbeddings {
  negative: FrozenGenerationEmbedding[]
  positive: FrozenGenerationEmbedding[]
}
export interface IllustriousWorkerEmbedding {
  byteSize: number
  path: string
  sha256: string
  token: string
}
export interface IllustriousWorkerEmbeddings {
  negative: IllustriousWorkerEmbedding[]
  positive: IllustriousWorkerEmbedding[]
}
export interface FrozenPromptEmbeddingRefs {
  negative: PromptEmbeddingRef[]
  positive: PromptEmbeddingRef[]
}
interface FrozenEmbeddingFields {
  embeddingRefs?: FrozenPromptEmbeddingRefs
  embeddings?: FrozenGenerationEmbeddings
  prompts: { negative: string; positive: string }
}

const NonemptySchema = v.pipe(v.string(), v.nonEmpty())
const SourceIdSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const Sha256Schema = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))
const ByteSizeSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(1))
export const ExactIllustriousEmbeddingSchema = v.strictObject({
  baseModelFamily: v.literal('illustrious'),
  civitaiFileId: SourceIdSchema,
  civitaiModelId: SourceIdSchema,
  civitaiVersionId: SourceIdSchema,
  displayName: NonemptySchema,
  fileSha256: Sha256Schema,
  kind: v.literal('embedding'),
  localModelId: NonemptySchema,
  localVersionId: NonemptySchema,
  predictionType: v.null(),
  versionName: NonemptySchema,
})
const RefArraySchema = v.pipe(
  v.array(v.strictObject({ resource: ExactIllustriousEmbeddingSchema, token: NonemptySchema })),
  v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
  v.check((refs) => new Set(refs.map((ref) => ref.token)).size === refs.length),
)
export const PromptEmbeddingRefsSchema = v.strictObject({
  negative: RefArraySchema,
  positive: RefArraySchema,
})
const FrozenArraySchema = v.pipe(
  v.array(
    v.strictObject({
      byteSize: ByteSizeSchema,
      managedPath: NonemptySchema,
      reference: ExactIllustriousEmbeddingSchema,
      token: NonemptySchema,
    }),
  ),
  v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
)
export const FrozenGenerationEmbeddingsSchema = v.strictObject({
  negative: FrozenArraySchema,
  positive: FrozenArraySchema,
})
const WorkerArraySchema = v.pipe(
  v.array(
    v.strictObject({
      byteSize: ByteSizeSchema,
      path: NonemptySchema,
      sha256: Sha256Schema,
      token: NonemptySchema,
    }),
  ),
  v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
)
export const IllustriousWorkerEmbeddingsSchema = v.strictObject({
  negative: WorkerArraySchema,
  positive: WorkerArraySchema,
})

export function validAuthoredGenerationEmbeddings(refs: FrozenPromptEmbeddingRefs): boolean {
  return v.safeParse(PromptEmbeddingRefsSchema, refs).success
}

/** Select from already verified detached descriptors; expansion never resolves a new resource. */
export function effectiveGenerationEmbeddings(
  prompts: { negative: string; positive: string },
  refs: FrozenPromptEmbeddingRefs,
  pool: FrozenGenerationEmbeddings,
): FrozenGenerationEmbeddings {
  const result: FrozenGenerationEmbeddings = { negative: [], positive: [] }
  for (const polarity of ['positive', 'negative'] as const) {
    result[polarity] = activePromptEmbeddingRefs(prompts[polarity], refs[polarity]).map((ref) => {
      const descriptor = pool[polarity].find(
        (entry) => entry.token === ref.token && isDeepStrictEqual(entry.reference, ref.resource),
      )
      if (!descriptor) {
        throw new Error('The concrete embedding is absent from its verified preparation pool.')
      }
      return structuredClone(descriptor)
    })
  }
  return result
}

/** Empty effective input needs no new wire field, retaining legacy plain-text peers. */
export function workerEmbeddings(
  context: Pick<FrozenEmbeddingFields, 'embeddings'>,
): IllustriousWorkerEmbeddings | undefined {
  const pair = context.embeddings
  if (
    !pair ||
    !v.safeParse(FrozenGenerationEmbeddingsSchema, pair).success ||
    (!pair.positive.length && !pair.negative.length)
  ) {
    return undefined
  }
  const project = (entry: FrozenGenerationEmbedding): IllustriousWorkerEmbedding => ({
    byteSize: entry.byteSize,
    path: entry.managedPath,
    sha256: entry.reference.fileSha256,
    token: entry.token,
  })
  return { negative: pair.negative.map(project), positive: pair.positive.map(project) }
}

/** Original refs and effective concrete files are paired; historical absence is not inferred. */
export function frozenEmbeddingFieldsAgree(
  context: FrozenEmbeddingFields,
  wire?: IllustriousWorkerEmbeddings,
): boolean {
  if (context.embeddingRefs === undefined || context.embeddings === undefined) {
    return (
      context.embeddingRefs === undefined && context.embeddings === undefined && wire === undefined
    )
  }
  if (
    !validAuthoredGenerationEmbeddings(context.embeddingRefs) ||
    !v.safeParse(FrozenGenerationEmbeddingsSchema, context.embeddings).success ||
    typeof context.prompts?.positive !== 'string' ||
    typeof context.prompts?.negative !== 'string'
  ) {
    return false
  }
  for (const polarity of ['positive', 'negative'] as const) {
    const expected = activePromptEmbeddingRefs(
      context.prompts[polarity],
      context.embeddingRefs[polarity],
    )
    const actual = context.embeddings[polarity]
    if (
      actual.length !== expected.length ||
      !actual.every(
        (entry, index) =>
          path.isAbsolute(entry.managedPath) &&
          path.resolve(entry.managedPath) === entry.managedPath &&
          entry.token === expected[index].token &&
          isDeepStrictEqual(entry.reference, expected[index].resource),
      )
    ) {
      return false
    }
  }
  return isDeepStrictEqual(wire, workerEmbeddings(context))
}

/** Retry and dispatch check only concrete effective files, never library Default or later drafts. */
export async function reverifyFrozenGenerationEmbeddings(
  input: FrozenEmbeddingFields,
  models: Pick<ModelService, 'resolveVerifiedGenerationEmbeddingForPlan'>,
): Promise<void> {
  const context = structuredClone(input)
  if (!frozenEmbeddingFieldsAgree(context, workerEmbeddings(context))) {
    throw new Error('The frozen embedding configuration is invalid.')
  }
  for (const polarity of ['positive', 'negative'] as const) {
    for (const entry of context.embeddings?.[polarity] ?? []) {
      const verified = await models.resolveVerifiedGenerationEmbeddingForPlan(entry.reference)
      if (
        verified.managedPath !== entry.managedPath ||
        verified.byteSize !== entry.byteSize ||
        !isDeepStrictEqual(verified.reference, entry.reference)
      ) {
        throw new Error('The exact embedding changed after preparation.')
      }
    }
  }
}
