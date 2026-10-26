import {
  GENERATION_BATCH_PROMPT_MAX_BYTES,
  type PlannedGenerationBatchItem,
} from '../../shared/projects/generation-batch-plan.js'
import { PROJECT_MASK_MAX_COORDINATE } from '../../shared/projects/project-mask.js'
import {
  IGS_SAFETY_CEILINGS,
  type IgsRectV1,
  type IgsRegionalGuidanceV1,
  isProjectGenerationDraftV1,
  isProjectRegionalGuidanceV1,
  projectOwnedIds,
} from '../../shared/projects/project-schema.js'
import {
  activePromptEmbeddingRefs,
  type GenerationPrompt,
  sameExactPromptEmbedding,
} from '../../shared/projects/prompt-embeddings.js'

import path from 'node:path'
import * as v from 'valibot'

import type { ModelService } from '../models/model-service.js'
import type { FrozenGenerationEmbeddings } from './illustrious-generation-embeddings.js'
import type { ProjectRegionalGuidanceCoverage } from './project-regional-guidance-coverage.js'
import type { CapturedRegionalGuidanceInput } from './project-regional-guidance-input.js'

import { ExactIllustriousEmbeddingSchema } from './illustrious-generation-embeddings.js'

/** Private defensive allocation bound, not document, model or execution capacity. */
const MAX_COVERAGE_ALPHA_SAMPLES = 64 * 1024 * 1024
/** Count bindings across streams, including independently owned inherited negatives. */
const MAX_ACTIVE_EMBEDDING_BINDINGS = 16

const UuidSchema = v.pipe(v.string(), v.uuid())
const SafeUIntSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const UInt32Schema = v.pipe(SafeUIntSchema, v.maxValue(0xff_ff_ff_ff))
const ResolvedEmbeddingSchema = v.strictObject({
  byteSize: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
  managedPath: v.pipe(v.string(), v.nonEmpty()),
  reference: ExactIllustriousEmbeddingSchema,
})
const RectSchema = v.strictObject({
  height: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
  width: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
  x: v.pipe(v.number(), v.safeInteger()),
  y: v.pipe(v.number(), v.safeInteger()),
})
const JobSchema = v.strictObject({
  bbox: RectSchema,
  documentId: UuidSchema,
  documentRevision: UuidSchema,
  family: v.picklist(['illustrious', 'anima']),
  item: v.strictObject({
    iteration: SafeUIntSchema,
    promptPairIndex: SafeUIntSchema,
    prompts: v.strictObject({ negative: v.string(), positive: v.string() }),
    seed: UInt32Schema,
  }),
})
const SnapshotSchema = v.strictObject({
  documentId: UuidSchema,
  documentRevision: UuidSchema,
  generationDraft: v.custom<CapturedRegionalGuidanceInput['snapshot']['generationDraft']>(
    isProjectGenerationDraftV1,
  ),
  lastActualSeedSnapshot: v.nullable(UInt32Schema),
  primaryBbox: RectSchema,
  regionalGuidance: v.optional(
    v.pipe(
      v.array(v.custom<IgsRegionalGuidanceV1>(isProjectRegionalGuidanceV1)),
      v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
    ),
  ),
})

/** Private recipe; raw reference-image descriptors grant no family execution compatibility. */
export interface CurrentCanvasRegionalRecipe {
  bbox: IgsRectV1
  documentId: string
  documentRevision: string
  family: 'anima' | 'illustrious'
  globalEmbeddings?: FrozenGenerationEmbeddings
  globalPrompts: { negative: GenerationPrompt; positive: GenerationPrompt }
  item: PlannedGenerationBatchItem
  kind: 'current-canvas-regional-recipe'
  regions: {
    authoredPrompts?: IgsRegionalGuidanceV1['prompts']
    coverage: ProjectRegionalGuidanceCoverage
    embeddings?: FrozenGenerationEmbeddings
    maskId: string
    maskRevision: number
    negative: { prompt: GenerationPrompt; source: 'current-canvas' | 'regional' }
    positive: GenerationPrompt | null
    referenceImages?: IgsRegionalGuidanceV1['referenceImages']
    regionId: string
  }[]
}

export class CurrentCanvasRegionalRecipeError extends Error {
  constructor(
    readonly code:
      | 'REGIONAL_RECIPE_DYNAMIC_UNSUPPORTED'
      | 'REGIONAL_RECIPE_INPUT_INVALID'
      | 'REGIONAL_RECIPE_LIMIT',
    message: string,
  ) {
    super(message)
    this.name = 'CurrentCanvasRegionalRecipeError'
  }
}

/**
 * Invoke inside ProjectService.withCapturedRegionalGuidanceInput's callback. The supplied item is
 * trusted Main batch-planner output; this adapter does not prove membership in an external batch or
 * seed history. Optional models verify only effective Illustrious embedding resources; the default
 * remains semantic-only. This grants no admission, expands no text and changes no capture lease.
 */
export async function prepareCurrentCanvasRegionalRecipe(input: {
  capture: CapturedRegionalGuidanceInput
  job: {
    bbox: IgsRectV1
    documentId: string
    documentRevision: string
    family: 'anima' | 'illustrious'
    item: PlannedGenerationBatchItem
  }
  models?: Pick<
    ModelService,
    'assertNoUnboundGenerationEmbeddings' | 'resolveVerifiedGenerationEmbeddingForPlan'
  >
}): Promise<CurrentCanvasRegionalRecipe> {
  let detached: {
    job: typeof input.job
    models?: NonNullable<typeof input.models>
    projectMask: CapturedRegionalGuidanceInput['projectMask']
    snapshot: CapturedRegionalGuidanceInput['snapshot']
  }
  try {
    // Detach the entire exposed snapshot and job synchronously, including dormant authored data.
    const capture = input.capture
    const models = input.models
    const projectMask = capture.projectMask
    if (typeof projectMask !== 'function') {
      throw invalidInput('The captured mask projector is invalid.')
    }
    let boundModels: typeof detached.models
    if (models !== undefined) {
      if (
        models === null ||
        typeof models !== 'object' ||
        typeof models.assertNoUnboundGenerationEmbeddings !== 'function' ||
        typeof models.resolveVerifiedGenerationEmbeddingForPlan !== 'function'
      ) {
        throw invalidInput('The regional embedding collaborators are invalid.')
      }
      boundModels = {
        assertNoUnboundGenerationEmbeddings:
          models.assertNoUnboundGenerationEmbeddings.bind(models),
        resolveVerifiedGenerationEmbeddingForPlan:
          models.resolveVerifiedGenerationEmbeddingForPlan.bind(models),
      }
    }
    detached = {
      job: structuredClone(input.job),
      ...(boundModels === undefined ? {} : { models: boundModels }),
      projectMask: projectMask.bind(capture),
      snapshot: structuredClone(capture.snapshot),
    }
  } catch {
    throw invalidInput('The regional recipe input cannot be detached.')
  }
  const parsedJob = v.safeParse(JobSchema, detached.job)
  const parsedSnapshot = v.safeParse(SnapshotSchema, detached.snapshot)
  if (!parsedJob.success || !parsedSnapshot.success || typeof detached.projectMask !== 'function') {
    throw invalidInput('The regional recipe job or captured snapshot is invalid.')
  }
  const job = parsedJob.output
  const snapshot = parsedSnapshot.output
  if (detached.models && job.family !== 'illustrious') {
    throw invalidInput('Regional embedding preparation requires an Illustrious Current Canvas job.')
  }
  const ownedIds = projectOwnedIds({ layers: [], regionalGuidance: snapshot.regionalGuidance })
  if (new Set(ownedIds).size !== ownedIds.length) {
    throw invalidInput('Captured regions, masks and references must have unique identities.')
  }
  if (
    job.documentId !== snapshot.documentId ||
    job.documentRevision !== snapshot.documentRevision ||
    !sameRect(job.bbox, snapshot.primaryBbox) ||
    snapshot.generationDraft.model === null ||
    snapshot.generationDraft.model.baseModelFamily !== job.family
  ) {
    throw invalidInput('The job does not match its captured Current Canvas owner and model.')
  }

  const enabled = (snapshot.regionalGuidance ?? []).filter((region) => region.enabled)
  assertCoverageBudget(job.bbox, enabled.length)
  assertStaticText(job.item.prompts.positive)
  assertStaticText(job.item.prompts.negative)
  const globalPrompts: CurrentCanvasRegionalRecipe['globalPrompts'] = {
    negative: {
      embeddingRefs: activePromptEmbeddingRefs(
        job.item.prompts.negative,
        snapshot.generationDraft.negativePrompt.embeddingRefs,
      ),
      text: job.item.prompts.negative,
    },
    positive: {
      embeddingRefs: activePromptEmbeddingRefs(
        job.item.prompts.positive,
        snapshot.generationDraft.positivePrompt.embeddingRefs,
      ),
      text: job.item.prompts.positive,
    },
  }

  // Finish every semantic check before the first lease projection, including later regions.
  const prepared = enabled.map(
    (region): Omit<CurrentCanvasRegionalRecipe['regions'][number], 'coverage'> => {
      const authored = region.prompts
      const positive = authored?.positive ? staticPrompt(authored.positive) : null
      let negative: CurrentCanvasRegionalRecipe['regions'][number]['negative']
      if (authored && !authored.useGlobalNegativePrompt) {
        if (authored.negative === null) {
          throw invalidInput('A regional negative source requires a local prompt block.')
        }
        negative = { prompt: staticPrompt(authored.negative), source: 'regional' }
      } else {
        // Concrete batch text selects Canvas refs; raw Canvas and dormant local text stay authored.
        negative = {
          prompt: {
            embeddingRefs: activePromptEmbeddingRefs(
              job.item.prompts.negative,
              snapshot.generationDraft.negativePrompt.embeddingRefs,
            ),
            text: job.item.prompts.negative,
          },
          source: 'current-canvas',
        }
      }
      return {
        ...(Object.hasOwn(region, 'prompts')
          ? { authoredPrompts: structuredClone(region.prompts) }
          : {}),
        maskId: region.mask.id,
        maskRevision: region.mask.revision,
        negative,
        positive,
        ...(Object.hasOwn(region, 'referenceImages')
          ? { referenceImages: structuredClone(region.referenceImages) }
          : {}),
        regionId: region.id,
      }
    },
  )

  let globalEmbeddings: FrozenGenerationEmbeddings | undefined
  if (detached.models) {
    const pairs = [
      globalPrompts,
      ...prepared.map((region) => ({
        negative: region.negative.prompt,
        positive: region.positive ?? { embeddingRefs: [], text: '' },
      })),
    ]
    let bindingCount = 0
    // Validate every effective stream and the aggregate before any collaborator or projection.
    for (const pair of pairs) {
      for (const sign of ['positive', 'negative'] as const) {
        for (const ref of pair[sign].embeddingRefs) {
          if (!v.safeParse(ExactIllustriousEmbeddingSchema, ref.resource).success) {
            throw invalidInput('An active regional embedding is not an exact Illustrious resource.')
          }
          bindingCount++
        }
      }
    }
    if (bindingCount > MAX_ACTIVE_EMBEDDING_BINDINGS) {
      throw new CurrentCanvasRegionalRecipeError(
        'REGIONAL_RECIPE_LIMIT',
        'The regional recipe exceeds its private 16 active embedding binding limit.',
      )
    }
    const resolvedPairs: FrozenGenerationEmbeddings[] = []
    for (const pair of pairs) {
      await detached.models.assertNoUnboundGenerationEmbeddings({
        modelFamily: job.family,
        negativePrompt: structuredClone(pair.negative),
        positivePrompt: structuredClone(pair.positive),
      })
      const embeddings: FrozenGenerationEmbeddings = { negative: [], positive: [] }
      for (const sign of ['positive', 'negative'] as const) {
        for (const ref of pair[sign].embeddingRefs) {
          const result = await detached.models.resolveVerifiedGenerationEmbeddingForPlan(
            structuredClone(ref.resource),
          )
          let copied: unknown
          try {
            // Own this result before any later collaborator can mutate its scratch objects.
            copied = structuredClone(result)
          } catch {
            throw invalidInput('A resolved regional embedding cannot be detached.')
          }
          const parsed = v.safeParse(ResolvedEmbeddingSchema, copied)
          if (
            !parsed.success ||
            !path.isAbsolute(parsed.output.managedPath) ||
            path.resolve(parsed.output.managedPath) !== parsed.output.managedPath ||
            !sameExactPromptEmbedding(ref.resource, parsed.output.reference)
          ) {
            throw invalidInput('A resolved regional embedding does not match its exact binding.')
          }
          embeddings[sign].push({
            byteSize: parsed.output.byteSize,
            managedPath: parsed.output.managedPath,
            reference: structuredClone(ref.resource),
            token: ref.token,
          })
        }
      }
      resolvedPairs.push(embeddings)
    }
    globalEmbeddings = resolvedPairs[0]
    for (let index = 0; index < prepared.length; index++) {
      prepared[index].embeddings = resolvedPairs[index + 1]
    }
  }

  const regions: CurrentCanvasRegionalRecipe['regions'] = []
  for (const region of prepared) {
    const coverage = await detached.projectMask(region.regionId, { ...job.bbox })
    regions.push({ ...region, coverage: copyCoverage(coverage) })
  }
  return {
    bbox: { ...job.bbox },
    documentId: job.documentId,
    documentRevision: job.documentRevision,
    family: job.family,
    ...(globalEmbeddings === undefined ? {} : { globalEmbeddings }),
    globalPrompts,
    item: job.item,
    kind: 'current-canvas-regional-recipe',
    regions,
  }
}

function invalidInput(message: string): CurrentCanvasRegionalRecipeError {
  return new CurrentCanvasRegionalRecipeError('REGIONAL_RECIPE_INPUT_INVALID', message)
}

function sameRect(a: IgsRectV1, b: IgsRectV1): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function assertCoverageBudget(bbox: IgsRectV1, enabledCount: number): void {
  const pixels = bbox.width * bbox.height
  const samples = enabledCount * pixels
  // Match projectRegionalGuidanceCoverage's integer-world target limits before any projection.
  if (
    Math.abs(bbox.x) > PROJECT_MASK_MAX_COORDINATE ||
    Math.abs(bbox.y) > PROJECT_MASK_MAX_COORDINATE ||
    bbox.width > 2048 ||
    bbox.height > 2048 ||
    !Number.isSafeInteger(pixels) ||
    pixels > 4_000_000 ||
    !Number.isSafeInteger(samples) ||
    samples > MAX_COVERAGE_ALPHA_SAMPLES
  ) {
    throw new CurrentCanvasRegionalRecipeError(
      'REGIONAL_RECIPE_LIMIT',
      'The regional recipe exceeds its private CPU coverage budget.',
    )
  }
}

function assertStaticText(text: string): void {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code >= 0xd8_00 && code <= 0xdb_ff) {
      const next = text.charCodeAt(index + 1)
      if (!(next >= 0xdc_00 && next <= 0xdf_ff)) {
        throw invalidInput('Active regional recipe text is not valid UTF-8.')
      }
      index++
    } else if (code >= 0xdc_00 && code <= 0xdf_ff) {
      throw invalidInput('Active regional recipe text is not valid UTF-8.')
    }
  }
  if (Buffer.byteLength(text, 'utf8') > GENERATION_BATCH_PROMPT_MAX_BYTES) {
    throw new CurrentCanvasRegionalRecipeError(
      'REGIONAL_RECIPE_LIMIT',
      'Active regional recipe text exceeds the internal prompt byte limit.',
    )
  }
  if (/[{}]/u.test(text)) {
    throw new CurrentCanvasRegionalRecipeError(
      'REGIONAL_RECIPE_DYNAMIC_UNSUPPORTED',
      'Regional recipes require concrete static text without braces, including escaped braces.',
    )
  }
}

function staticPrompt(prompt: GenerationPrompt): GenerationPrompt {
  assertStaticText(prompt.text)
  return {
    embeddingRefs: activePromptEmbeddingRefs(prompt.text, prompt.embeddingRefs),
    text: prompt.text,
  }
}

function copyCoverage(coverage: ProjectRegionalGuidanceCoverage): ProjectRegionalGuidanceCoverage {
  const copy = {
    // Uint8Array.from also copies Buffer inputs; Buffer.slice would retain borrowed bytes.
    alpha: Uint8Array.from(coverage.alpha),
    bounds: { ...coverage.bounds },
  }
  return coverage.intersection === null
    ? { ...copy, intersection: null, kind: coverage.kind }
    : { ...copy, intersection: { ...coverage.intersection }, kind: coverage.kind }
}
