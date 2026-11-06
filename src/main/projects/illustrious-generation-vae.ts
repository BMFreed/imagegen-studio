import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { GenerationModelResolver } from './illustrious-generation-loras.js'

export interface FrozenGenerationVae {
  byteSize: number
  managedPath: string
  reference: ExactVae
}
export interface IllustriousWorkerVae {
  byteSize: number
  path: string
  sha256: string
}
type ExactVae = NonNullable<IgsProjectDocumentV1['generationDraft']['vae']>
interface FrozenVaeFields {
  /** New jobs explicitly record Embedded as null; old jobs leave it unrecorded. */
  vae?: FrozenGenerationVae | null
}

const NonemptySchema = v.pipe(v.string(), v.nonEmpty())
const SourceIdSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const Sha256Schema = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))
const ByteSizeSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(1))
export const ExactIllustriousVaeSchema = v.strictObject({
  baseModelFamily: v.literal('illustrious'),
  civitaiFileId: SourceIdSchema,
  civitaiModelId: SourceIdSchema,
  civitaiVersionId: SourceIdSchema,
  displayName: NonemptySchema,
  fileSha256: Sha256Schema,
  kind: v.literal('vae'),
  localModelId: NonemptySchema,
  localVersionId: NonemptySchema,
  predictionType: v.null(),
  versionName: NonemptySchema,
})
export const FrozenGenerationVaeSchema = v.strictObject({
  byteSize: ByteSizeSchema,
  managedPath: NonemptySchema,
  reference: ExactIllustriousVaeSchema,
})
export const IllustriousWorkerVaeSchema = v.strictObject({
  byteSize: ByteSizeSchema,
  path: NonemptySchema,
  sha256: Sha256Schema,
})

export function validAuthoredGenerationVae(value: ExactVae | null): boolean {
  return value === null || v.safeParse(ExactIllustriousVaeSchema, value).success
}

export function workerVae(context: FrozenVaeFields): IllustriousWorkerVae | null | undefined {
  const entry = context.vae
  return entry === undefined || entry === null
    ? entry
    : { byteSize: entry.byteSize, path: entry.managedPath, sha256: entry.reference.fileSha256 }
}

/** A recorded Embedded choice and historical absence cannot replace each other in storage. */
export function frozenVaeFieldsAgree(
  context: FrozenVaeFields,
  wire: IllustriousWorkerVae | null | undefined,
): boolean {
  const entry = context.vae
  if (entry === undefined || entry === null) {
    return entry === wire
  }
  return (
    v.safeParse(FrozenGenerationVaeSchema, entry).success &&
    path.isAbsolute(entry.managedPath) &&
    path.resolve(entry.managedPath) === entry.managedPath &&
    isDeepStrictEqual(wire, workerVae(context))
  )
}

export function validWorkerVae(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true
  }
  const parsed = v.safeParse(IllustriousWorkerVaeSchema, value)
  return (
    parsed.success &&
    path.isAbsolute(parsed.output.path) &&
    path.resolve(parsed.output.path) === parsed.output.path
  )
}

/** Never replace a captured exact selection with the current Project choice or library Default. */
export async function reverifyFrozenGenerationVae(
  context: FrozenVaeFields,
  models: Pick<GenerationModelResolver, 'resolveVerifiedGenerationVaeForPlan'>,
): Promise<void> {
  if (!frozenVaeFieldsAgree(context, workerVae(context))) {
    throw new Error('The frozen VAE configuration is invalid.')
  }
  const entry = context.vae
  if (!entry) {
    return
  }
  const verified = await models.resolveVerifiedGenerationVaeForPlan(entry.reference)
  if (
    verified.managedPath !== entry.managedPath ||
    verified.byteSize !== entry.byteSize ||
    !isDeepStrictEqual(verified.reference, entry.reference)
  ) {
    throw new Error('The exact VAE changed after preparation.')
  }
}
