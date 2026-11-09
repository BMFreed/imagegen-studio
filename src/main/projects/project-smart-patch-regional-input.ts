import { compileAnimaFlowSamplingPlan } from '../../shared/projects/anima-flow-sampling-plan.js'
import {
  ANIMA_PROMPT_INTERPRETATION,
  compileAnimaPromptWeighting,
  compileAnimaPromptWeightingForInterpretation,
  type CompiledAnimaPromptWeighting,
} from '../../shared/projects/anima-prompt-weighting.js'
import {
  GENERATION_BATCH_PROMPT_MAX_BYTES,
  type PlannedGenerationBatchItem,
} from '../../shared/projects/generation-batch-plan.js'
import { resolveProjectMaskSettings } from '../../shared/projects/project-mask-settings.js'
import { PROJECT_MASK_MAX_COORDINATE } from '../../shared/projects/project-mask.js'
import {
  GenerationPromptSchema,
  type IgsRectV1,
  type IgsRegionalGuidanceV1,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'
import type { GenerationPrompt } from '../../shared/projects/prompt-embeddings.js'
import { resolveSmartPatchCoherenceSettings } from '../../shared/projects/smart-patch-coherence-settings.js'

import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { ProjectRegionalGuidanceCoverage } from './project-regional-guidance-coverage.js'
import type { CapturedRegionalGuidanceInput } from './project-regional-guidance-input.js'
import type { CapturedSmartPatchGenerationInput } from './project-smart-patch-generation-input.js'
import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'

import { compositionRasterLayers } from './project-raster-snapshot.js'
import { captureSmartPatchExecutionRequest } from './smart-patch-execution-request.js'

export const ANIMA_SMART_PATCH_REGIONAL_PROFILE = 'invoke-anima-smart-regional-inpaint-v1' as const
export const ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE =
  'invoke-anima-smart-regional-outpaint-v1' as const
export const ANIMA_SMART_PATCH_REGIONAL_TXT2IMG_PROFILE =
  'invoke-anima-smart-regional-txt2img-v1' as const
export const ANIMA_SMART_PATCH_REGIONAL_IMG2IMG_PROFILE =
  'invoke-anima-smart-regional-img2img-v1' as const
/** Each public frozen profile keeps its exact original Smart execution mode. */
export type SmartPatchAnimaRegionalProfile =
  | typeof ANIMA_SMART_PATCH_REGIONAL_IMG2IMG_PROFILE
  | typeof ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE
  | typeof ANIMA_SMART_PATCH_REGIONAL_PROFILE
  | typeof ANIMA_SMART_PATCH_REGIONAL_TXT2IMG_PROFILE
export type PreparedSmartPatchAnimaRegionalProfile = SmartPatchAnimaRegionalProfile
const MODE_BY_PROFILE = {
  [ANIMA_SMART_PATCH_REGIONAL_IMG2IMG_PROFILE]: 'img2img',
  [ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE]: 'outpaint',
  [ANIMA_SMART_PATCH_REGIONAL_PROFILE]: 'inpaint',
  [ANIMA_SMART_PATCH_REGIONAL_TXT2IMG_PROFILE]: 'txt2img',
} as const
const MAX_REGIONS = 3
const MAX_AGGREGATE_TEXT_BYTES = 128 * 1024

export interface CapturedSmartPatchRegionalGenerationInput {
  regional: CapturedRegionalGuidanceInput
  smartPatch: CapturedSmartPatchGenerationInput
}

export interface SmartPatchAnimaRegionalRecipe {
  bbox: IgsRectV1
  documentId: string
  documentRevision: string
  family: 'anima'
  globalPrompts: { negative: GenerationPrompt; positive: GenerationPrompt }
  internalResolution: { height: number; width: number }
  item: PlannedGenerationBatchItem
  kind: 'smart-patch-regional-recipe'
  layerId: string
  modelSha256: string
  regions: {
    authoredPrompts?: IgsRegionalGuidanceV1['prompts']
    coverage: ProjectRegionalGuidanceCoverage
    maskId: string
    maskRevision: number
    negative: { prompt: GenerationPrompt; source: 'regional' | 'smart-patch' }
    positive: GenerationPrompt | null
    referenceImages?: IgsRegionalGuidanceV1['referenceImages']
    regionId: string
  }[]
  sampling: {
    animaMethod: 'euler' | 'heun'
    cfgScale: number
    denoisingStrength: number
    steps: number
  }
  smartMask: { maskId: string; maskRevision: number }
}

export interface CompiledSmartPatchAnimaRegionalPrompt {
  readonly polarity: 'negative' | 'positive'
  readonly prompt: CompiledAnimaPromptWeighting
  readonly sourceId: string
  readonly text: string
}

export interface PreparedSmartPatchAnimaRegionalInput {
  compiledPrompts: readonly CompiledSmartPatchAnimaRegionalPrompt[]
  profile: PreparedSmartPatchAnimaRegionalProfile
  promptInterpretation?: typeof ANIMA_PROMPT_INTERPRETATION
  recipe: SmartPatchAnimaRegionalRecipe
  schemaVersion: 1
}

export interface BoundSmartPatchAnimaRegionalInput extends PreparedSmartPatchAnimaRegionalInput {
  execution: Extract<SmartPatchExecutionRequest, { family: 'anima' }>
}

export const SMART_PATCH_REGIONAL_ALPHA_ROLES = [
  'regional-0.alpha8',
  'regional-1.alpha8',
  'regional-2.alpha8',
] as const
export type SmartPatchRegionalAlphaRole = (typeof SMART_PATCH_REGIONAL_ALPHA_ROLES)[number]
/** Operational metadata only. Actual raw alpha is owned by the existing Smart bundle. */
export interface FrozenSmartPatchAnimaRegionalInputV1 extends Omit<
  PreparedSmartPatchAnimaRegionalInput,
  'profile' | 'promptInterpretation' | 'recipe'
> {
  profile: SmartPatchAnimaRegionalProfile
  promptInterpretation: typeof ANIMA_PROMPT_INTERPRETATION
  recipe: Omit<SmartPatchAnimaRegionalRecipe, 'regions'> & {
    regions: (Omit<SmartPatchAnimaRegionalRecipe['regions'][number], 'coverage'> & {
      coverage: FrozenRegionalCoverage
    })[]
  }
}

type FrozenRegionalCoverage = Omit<ProjectRegionalGuidanceCoverage, 'alpha'> & {
  alpha: SmartPatchRegionalAlphaRole
}

export class SmartPatchRegionalInputError extends Error {
  constructor(
    readonly code:
      | 'SMART_PATCH_REGIONAL_INPUT_INVALID'
      | 'SMART_PATCH_REGIONAL_LIMIT'
      | 'SMART_PATCH_REGIONAL_UNSUPPORTED',
    message: string,
  ) {
    super(message)
    this.name = 'SmartPatchRegionalInputError'
  }
}

const uuid = v.pipe(v.string(), v.uuid())
const integer = (minimum: number, maximum = Number.MAX_SAFE_INTEGER) =>
  v.pipe(v.number(), v.safeInteger(), v.minValue(minimum), v.maxValue(maximum))
const numeric = (minimum: number, maximum: number) =>
  v.pipe(v.number(), v.finite(), v.minValue(minimum), v.maxValue(maximum))
const rect = v.strictObject({
  height: integer(1, 2048),
  width: integer(1, 2048),
  x: integer(-PROJECT_MASK_MAX_COORDINATE, PROJECT_MASK_MAX_COORDINATE),
  y: integer(-PROJECT_MASK_MAX_COORDINATE, PROJECT_MASK_MAX_COORDINATE),
})
const prompts = v.strictObject({
  negative: GenerationPromptSchema,
  positive: GenerationPromptSchema,
})
const authoredPrompts = v.strictObject({
  negative: v.nullable(GenerationPromptSchema),
  positive: v.nullable(GenerationPromptSchema),
  useGlobalNegativePrompt: v.boolean(),
})
const coverage = v.strictObject({
  alpha: v.instance(Uint8Array),
  bounds: rect,
  intersection: v.nullable(rect),
  kind: v.picklist(['covered', 'empty', 'intersecting-empty', 'outside']),
})
const recipeSchema = v.strictObject({
  bbox: rect,
  documentId: uuid,
  documentRevision: uuid,
  family: v.literal('anima'),
  globalPrompts: prompts,
  internalResolution: v.strictObject({ height: integer(64, 512), width: integer(64, 512) }),
  item: v.strictObject({
    iteration: integer(0),
    promptPairIndex: integer(0),
    prompts: v.strictObject({ negative: v.string(), positive: v.string() }),
    seed: integer(0, 0xff_ff_ff_ff),
  }),
  kind: v.literal('smart-patch-regional-recipe'),
  layerId: uuid,
  modelSha256: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u)),
  regions: v.array(
    v.strictObject({
      authoredPrompts: v.optional(authoredPrompts),
      coverage,
      maskId: uuid,
      maskRevision: integer(0),
      negative: v.strictObject({
        prompt: GenerationPromptSchema,
        source: v.picklist(['regional', 'smart-patch']),
      }),
      positive: v.nullable(GenerationPromptSchema),
      referenceImages: v.optional(v.array(v.unknown())),
      regionId: uuid,
    }),
  ),
  sampling: v.strictObject({
    animaMethod: v.picklist(['euler', 'heun']),
    cfgScale: numeric(1, 30),
    denoisingStrength: numeric(0, 1),
    steps: integer(1, 200),
  }),
  smartMask: v.strictObject({ maskId: uuid, maskRevision: integer(0) }),
})
const preparedSchema = v.strictObject({
  compiledPrompts: v.array(
    v.strictObject({
      polarity: v.picklist(['negative', 'positive']),
      prompt: v.unknown(),
      sourceId: uuid,
      text: v.string(),
    }),
  ),
  profile: v.picklist([
    ANIMA_SMART_PATCH_REGIONAL_PROFILE,
    ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
    ANIMA_SMART_PATCH_REGIONAL_TXT2IMG_PROFILE,
    ANIMA_SMART_PATCH_REGIONAL_IMG2IMG_PROFILE,
  ]),
  promptInterpretation: v.optional(v.literal(ANIMA_PROMPT_INTERPRETATION)),
  recipe: recipeSchema,
  schemaVersion: v.literal(1),
})

const frozenCoverage = v.strictObject({
  ...coverage.entries,
  alpha: v.picklist(SMART_PATCH_REGIONAL_ALPHA_ROLES),
})
const frozenPreparedSchema = v.strictObject({
  ...preparedSchema.entries,
  profile: v.picklist([
    ANIMA_SMART_PATCH_REGIONAL_PROFILE,
    ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE,
    ANIMA_SMART_PATCH_REGIONAL_TXT2IMG_PROFILE,
    ANIMA_SMART_PATCH_REGIONAL_IMG2IMG_PROFILE,
  ]),
  promptInterpretation: v.literal(ANIMA_PROMPT_INTERPRETATION),
  recipe: v.strictObject({
    ...recipeSchema.entries,
    regions: v.array(
      v.strictObject({
        ...recipeSchema.entries.regions.item.entries,
        coverage: frozenCoverage,
      }),
    ),
  }),
})

type RecipeSources = Omit<SmartPatchAnimaRegionalRecipe, 'regions'> & {
  regions: (Omit<
    SmartPatchAnimaRegionalRecipe['regions'][number],
    'coverage' | 'referenceImages'
  > & {
    referenceImages?: readonly unknown[]
  })[]
}

/** Detach and verify the existing selected-Smart and regional lease before awaits. */
export function captureSmartPatchRegionalSources(input: {
  capture: CapturedSmartPatchRegionalGenerationInput
  item: PlannedGenerationBatchItem
}) {
  let document: ReturnType<typeof parseProjectDocumentV1>
  let context: CapturedSmartPatchGenerationInput['context']
  let snapshot: CapturedRegionalGuidanceInput['snapshot']
  let item: PlannedGenerationBatchItem
  let projectMask: CapturedRegionalGuidanceInput['projectMask']
  try {
    document = parseProjectDocumentV1(structuredClone(input.capture.smartPatch.document))
    context = structuredClone(input.capture.smartPatch.context)
    snapshot = structuredClone(input.capture.regional.snapshot)
    item = structuredClone(input.item)
    projectMask = input.capture.regional.projectMask.bind(input.capture.regional)
  } catch {
    throw invalid('The private Smart Patch regional capture cannot be detached.')
  }
  if (!context || typeof context !== 'object' || !snapshot || typeof snapshot !== 'object') {
    throw invalid('The captured Smart and regional contexts are invalid.')
  }
  const patch = document.layers.find((layer) => layer.id === context.layerId)
  if (
    patch?.kind !== 'smart-patch' ||
    document.documentId !== context.documentId ||
    document.documentRevision !== context.documentRevision ||
    snapshot.documentId !== context.documentId ||
    snapshot.documentRevision !== context.documentRevision ||
    snapshot.lastActualSeedSnapshot !== document.lastActualSeedSnapshot ||
    !isDeepStrictEqual(snapshot.regionalGuidance ?? [], document.regionalGuidance ?? []) ||
    !isDeepStrictEqual(snapshot.generationDraft, document.generationDraft) ||
    !isDeepStrictEqual(snapshot.primaryBbox, document.primaryBbox) ||
    !isDeepStrictEqual(context.bbox, patch.boundingBox) ||
    !isDeepStrictEqual(context.internalResolution, patch.internalResolution) ||
    !isDeepStrictEqual(context.generationDraft, patch.generationDraft) ||
    !isDeepStrictEqual(context.mask, patch.mask) ||
    !isDeepStrictEqual(context.maskSettings, resolveProjectMaskSettings(patch.maskSettings)) ||
    !isDeepStrictEqual(
      context.coherenceSettings,
      resolveSmartPatchCoherenceSettings(patch.coherenceSettings),
    ) ||
    context.lastActualSeedSnapshot !== document.lastActualSeedSnapshot ||
    context.locked !== patch.locked ||
    context.visible !== patch.visible ||
    !isDeepStrictEqual(
      context.sourceLayerIds,
      compositionRasterLayers(document, { beneathLayerId: patch.id }).map((layer) => layer.id),
    )
  ) {
    throw invalid('Smart Patch and regional leases do not describe the same frozen target.')
  }
  return { context, document, item, patch, projectMask }
}

/**
 * Invoke4875 compileCanvasGraph grafts image sources before the same regional collector for every
 * mode; TXT needs no source graft. This companion preserves that job association. This private
 * companion freezes selected Smart settings; it grants neither public admission nor queue/variant
 * persistence. World clipping stays with the existing regional lease. Anima's binary/NEAREST
 * processing-token projection belongs to the native consumer, independently of KEEP.
 */
export async function prepareSmartPatchAnimaRegionalInput(input: {
  capture: CapturedSmartPatchRegionalGenerationInput
  item: PlannedGenerationBatchItem
  profile?: PreparedSmartPatchAnimaRegionalProfile
  promptInterpretation?: typeof ANIMA_PROMPT_INTERPRETATION
}): Promise<PreparedSmartPatchAnimaRegionalInput> {
  const { context, document, item, patch, projectMask } = captureSmartPatchRegionalSources(input)
  const requestedProfile = input.profile
  const profile =
    requestedProfile === undefined ? ANIMA_SMART_PATCH_REGIONAL_PROFILE : requestedProfile
  const promptInterpretation = input.promptInterpretation
  if (!Object.hasOwn(MODE_BY_PROFILE, profile)) {
    throw invalid('The Smart regional execution profile is unsupported.')
  }
  if (promptInterpretation !== undefined && promptInterpretation !== ANIMA_PROMPT_INTERPRETATION) {
    throw invalid('The Smart regional prompt interpretation is unsupported.')
  }
  const draft = patch.generationDraft
  if (
    draft.model?.kind !== 'checkpoint' ||
    draft.model.baseModelFamily !== 'anima' ||
    draft.model.predictionType !== null
  ) {
    throw unsupported('Private Smart regional INP requires an original Anima checkpoint.')
  }
  if (draft.loras.some((entry) => entry.enabled)) {
    throw unsupported('Private Smart regional INP does not admit enabled LoRAs.')
  }
  if (
    draft.vae !== null ||
    (draft.vaePrecision ?? 'Auto') !== 'Auto' ||
    (draft.cfgRescale ?? 0) !== 0 ||
    draft.clipSkip !== undefined ||
    draft.sampling.sampler !== null ||
    draft.sampling.scheduler !== null
  ) {
    throw unsupported('Private Smart regional INP requires embedded Auto VAE and native Anima CFG.')
  }
  if (!['euler', 'heun'].includes(draft.sampling.animaMethod ?? '')) {
    throw unsupported('Private Smart regional INP supports existing Euler and Heun only.')
  }
  const recipe: SmartPatchAnimaRegionalRecipe = {
    bbox: { ...context.bbox },
    documentId: context.documentId,
    documentRevision: context.documentRevision,
    family: 'anima',
    globalPrompts: {
      negative: structuredClone(draft.negativePrompt),
      positive: structuredClone(draft.positivePrompt),
    },
    internalResolution: { ...context.internalResolution },
    item,
    kind: 'smart-patch-regional-recipe',
    layerId: patch.id,
    modelSha256: draft.model.fileSha256,
    regions: (document.regionalGuidance ?? [])
      .filter((region) => region.enabled)
      .map((region) => ({
        ...(region.prompts ? { authoredPrompts: structuredClone(region.prompts) } : {}),
        // No full alpha allocation is needed for semantic/compiled preflight before projection.
        coverage: {
          alpha: new Uint8Array(0),
          bounds: { ...context.bbox },
          intersection: null,
          kind: 'empty' as const,
        },
        maskId: region.mask.id,
        maskRevision: region.mask.revision,
        negative:
          region.prompts?.useGlobalNegativePrompt === false
            ? { prompt: structuredClone(region.prompts.negative!), source: 'regional' as const }
            : { prompt: structuredClone(draft.negativePrompt), source: 'smart-patch' as const },
        positive: region.prompts?.positive ? structuredClone(region.prompts.positive) : null,
        ...(Object.hasOwn(region, 'referenceImages')
          ? { referenceImages: structuredClone(region.referenceImages) }
          : {}),
        regionId: region.id,
      })),
    sampling: {
      animaMethod: draft.sampling.animaMethod as 'euler' | 'heun',
      cfgScale: draft.sampling.cfgScale!,
      denoisingStrength: draft.sampling.denoisingStrength!,
      steps: draft.sampling.steps!,
    },
    smartMask: { maskId: patch.mask.id, maskRevision: patch.mask.revision },
  }
  if (
    item?.prompts?.positive !== draft.positivePrompt.text ||
    item?.prompts?.negative !== draft.negativePrompt.text
  ) {
    throw invalid('The concrete item differs from the selected Smart Patch static prompts.')
  }
  // Compile the complete signed list before calling a projection collaborator for any region.
  const compiledPrompts = compileRecipe(recipe, promptInterpretation)
  for (const region of recipe.regions) {
    const projected = structuredClone(await projectMask(region.regionId, { ...recipe.bbox }))
    region.coverage = checkedSmartPatchRegionalCoverage(projected, recipe.bbox)
  }
  return capturePrepared({
    compiledPrompts,
    ...(promptInterpretation !== undefined ? { promptInterpretation } : {}),
    profile,
    recipe,
    schemaVersion: 1,
  })
}

/** Attach the one original prepared command; no second source/KEEP/sampling record is selected. */
export function bindSmartPatchAnimaRegionalExecution(
  input: PreparedSmartPatchAnimaRegionalInput,
  executionInput: SmartPatchExecutionRequest,
): BoundSmartPatchAnimaRegionalInput {
  const prepared = capturePrepared(input)
  const execution = captureSmartPatchExecutionRequest(executionInput)
  const expectedMode = MODE_BY_PROFILE[prepared.profile]
  if (execution.family !== 'anima' || execution.mode !== expectedMode) {
    throw unsupported(
      prepared.profile === ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_PROFILE
        ? 'Private Smart regional OUT requires an original Anima OUT command.'
        : prepared.profile === ANIMA_SMART_PATCH_REGIONAL_PROFILE
          ? 'Private Smart regional execution requires an original Anima INP command.'
          : `Private Smart regional ${expectedMode} requires its original Anima command.`,
    )
  }
  const { recipe } = prepared
  const expectedPlan = compileAnimaFlowSamplingPlan({
    guidanceScale: recipe.sampling.cfgScale,
    height: recipe.internalResolution.height,
    mode: expectedMode === 'txt2img' ? 'txt2img' : 'img2img',
    scheduler: recipe.sampling.animaMethod,
    seed: recipe.item.seed,
    steps: recipe.sampling.steps,
    strength: expectedMode === 'txt2img' ? null : recipe.sampling.denoisingStrength,
    width: recipe.internalResolution.width,
  })
  if (
    !isDeepStrictEqual(execution.internalResolution, recipe.internalResolution) ||
    execution.inference.model.checkpoint.sha256 !== recipe.modelSha256 ||
    !isDeepStrictEqual(execution.inference.sampling, expectedPlan) ||
    !isDeepStrictEqual(execution.inference.prompts.positive, prepared.compiledPrompts[0].prompt) ||
    !isDeepStrictEqual(execution.inference.prompts.negative, prepared.compiledPrompts[1].prompt)
  ) {
    throw invalid('The prepared Smart execution differs from its frozen regional target.')
  }
  if (execution.inference.loras.length !== 0) {
    throw unsupported('Private Smart regional INP does not admit enabled LoRAs.')
  }
  return { ...prepared, execution }
}

export { capturePrepared as capturePreparedSmartPatchAnimaRegionalInput }

/** Validate signed metadata without fabricating alpha or treating descriptors as pixels. */
export function captureFrozenSmartPatchAnimaRegionalInputV1(
  input: unknown,
): FrozenSmartPatchAnimaRegionalInputV1 {
  const parsed = v.safeParse(frozenPreparedSchema, structuredClone(input))
  if (!parsed.success) {
    throw invalid('The frozen Smart regional metadata is incomplete or malformed.')
  }
  const value = parsed.output
  const compiled = compileRecipeSources(value.recipe, value.promptInterpretation)
  if (!isDeepStrictEqual(value.compiledPrompts, compiled)) {
    throw invalid('Frozen Smart regional compiled records differ from their signed sources.')
  }
  for (const [index, region] of value.recipe.regions.entries()) {
    const plane = region.coverage
    const bbox = value.recipe.bbox
    const intersection = plane.intersection
    if (
      plane.alpha !== SMART_PATCH_REGIONAL_ALPHA_ROLES[index] ||
      !isDeepStrictEqual(plane.bounds, bbox) ||
      (plane.kind === 'covered' || plane.kind === 'intersecting-empty') !==
        (intersection !== null) ||
      (intersection &&
        (intersection.x < bbox.x ||
          intersection.y < bbox.y ||
          intersection.x + intersection.width > bbox.x + bbox.width ||
          intersection.y + intersection.height > bbox.y + bbox.height))
    ) {
      throw invalid(
        'The frozen regional alpha role or world metadata differs from its ordered owner.',
      )
    }
  }
  return {
    ...value,
    compiledPrompts: compiled,
    recipe: {
      ...value.recipe,
      regions: value.recipe.regions.map(({ referenceImages, ...region }) => ({
        ...region,
        ...(referenceImages !== undefined ? { referenceImages: [] } : {}),
      })),
    },
  }
}

export function checkedSmartPatchRegionalCoverage(
  input: unknown,
  bbox: IgsRectV1,
): ProjectRegionalGuidanceCoverage {
  const parsed = v.safeParse(coverage, input)
  if (!parsed.success) {
    throw invalid('The projected regional world coverage is invalid.')
  }
  const value = parsed.output
  if (!isDeepStrictEqual(value.bounds, bbox) || value.alpha.length !== bbox.width * bbox.height) {
    throw invalid('The regional world coverage differs from the Smart bbox.')
  }
  const intersection = value.intersection
  if (
    intersection &&
    (intersection.x < bbox.x ||
      intersection.y < bbox.y ||
      intersection.x + intersection.width > bbox.x + bbox.width ||
      intersection.y + intersection.height > bbox.y + bbox.height)
  ) {
    throw invalid('The regional world intersection is outside the Smart bbox.')
  }
  if (intersection) {
    for (let row = 0; row < bbox.height; row++) {
      for (let column = 0; column < bbox.width; column++) {
        if (
          value.alpha[row * bbox.width + column] !== 0 &&
          (bbox.x + column < intersection.x ||
            bbox.y + row < intersection.y ||
            bbox.x + column >= intersection.x + intersection.width ||
            bbox.y + row >= intersection.y + intersection.height)
        ) {
          throw invalid('Regional pixels exceed their declared clipped world intersection.')
        }
      }
    }
  }
  const nonzero = value.alpha.some((sample) => sample !== 0)
  if (
    (value.kind === 'covered' && (!intersection || !nonzero)) ||
    (value.kind === 'intersecting-empty' && (!intersection || nonzero)) ||
    ((value.kind === 'empty' || value.kind === 'outside') && (intersection || nonzero))
  ) {
    throw invalid('The regional world coverage classification differs from its pixels.')
  }
  const common = { alpha: new Uint8Array(value.alpha), bounds: { ...value.bounds } }
  return value.kind === 'covered' || value.kind === 'intersecting-empty'
    ? { ...common, intersection: { ...intersection! }, kind: value.kind }
    : { ...common, intersection: null, kind: value.kind }
}

function capturePrepared(value: unknown): PreparedSmartPatchAnimaRegionalInput {
  const parsed = v.safeParse(preparedSchema, structuredClone(value))
  if (!parsed.success) {
    throw invalid('The prepared Smart regional input is incomplete or malformed.')
  }
  const data = parsed.output
  const expected = compileRecipe(data.recipe, data.promptInterpretation)
  if (!isDeepStrictEqual(data.compiledPrompts, expected)) {
    throw invalid('Compiled Smart regional records differ from their signed authored sources.')
  }
  return {
    compiledPrompts: expected,
    profile: data.profile,
    ...(data.promptInterpretation !== undefined
      ? { promptInterpretation: data.promptInterpretation }
      : {}),
    recipe: {
      ...data.recipe,
      regions: data.recipe.regions.map(({ referenceImages, ...region }) => ({
        ...region,
        coverage: checkedSmartPatchRegionalCoverage(region.coverage, data.recipe.bbox),
        ...(referenceImages !== undefined ? { referenceImages: [] } : {}),
      })),
    },
    schemaVersion: 1,
  }
}

function compileRecipe(
  recipe: SmartPatchAnimaRegionalRecipe | v.InferOutput<typeof recipeSchema>,
  interpretation?: typeof ANIMA_PROMPT_INTERPRETATION,
) {
  const parsed = v.safeParse(recipeSchema, recipe)
  if (!parsed.success) {
    throw invalid('The frozen Smart regional recipe is invalid.')
  }
  return compileRecipeSources(parsed.output, interpretation)
}

/** Source/policy checks shared by pixel-owned input and descriptor-only metadata. */
function compileRecipeSources(
  value: RecipeSources,
  interpretation?: typeof ANIMA_PROMPT_INTERPRETATION,
) {
  if (
    value.bbox.width * value.bbox.height > 4_000_000 ||
    value.internalResolution.width % 8 !== 0 ||
    value.internalResolution.height % 8 !== 0
  ) {
    throw limit('Smart regional world or processing geometry exceeds its existing bounds.')
  }
  if (value.regions.length > MAX_REGIONS) {
    throw limit('Private Smart regional INP admits at most three enabled regions.')
  }
  const owned = new Set([value.documentId, value.layerId, value.smartMask.maskId])
  if (owned.size !== 3) {
    throw invalid('Document, Smart layer and mask identities must be independent.')
  }
  const pending: Omit<CompiledSmartPatchAnimaRegionalPrompt, 'prompt'>[] = [
    {
      polarity: 'positive',
      sourceId: value.layerId,
      text: consumedPrompt(value.globalPrompts.positive),
    },
    {
      polarity: 'negative',
      sourceId: value.layerId,
      text: consumedPrompt(value.globalPrompts.negative),
    },
  ]
  if (
    !isDeepStrictEqual(value.item.prompts, {
      negative: value.globalPrompts.negative.text,
      positive: value.globalPrompts.positive.text,
    })
  ) {
    throw invalid('The concrete item and Smart global prompt pair differ.')
  }
  let bytes = pending.reduce((sum, entry) => sum + textBytes(entry.text), 0)
  for (const region of value.regions) {
    if (
      owned.has(region.regionId) ||
      owned.has(region.maskId) ||
      region.regionId === region.maskId
    ) {
      throw invalid('Smart and regional source/mask ownership collides.')
    }
    owned.add(region.regionId)
    owned.add(region.maskId)
    if (region.referenceImages?.length) {
      throw unsupported('Private Anima Smart regions do not admit reference images.')
    }
    const authored = region.authoredPrompts
    if (region.positive === null) {
      if (authored && authored.positive !== null) {
        throw invalid('An absent regional positive differs from its authored block.')
      }
    } else {
      const text = consumedPrompt(region.positive)
      if (!authored || !isDeepStrictEqual(authored.positive, region.positive)) {
        throw invalid('A regional positive differs from its authored block.')
      }
      pending.push({ polarity: 'positive', sourceId: region.regionId, text })
      bytes += textBytes(text)
    }
    const negative = consumedPrompt(region.negative.prompt)
    if (region.negative.source === 'smart-patch') {
      if (
        (authored && !authored.useGlobalNegativePrompt) ||
        !isDeepStrictEqual(region.negative.prompt, value.globalPrompts.negative)
      ) {
        throw invalid(
          'Inherited negative text and references differ from the selected Smart Patch.',
        )
      }
    } else if (
      !authored ||
      authored.useGlobalNegativePrompt ||
      !isDeepStrictEqual(authored.negative, region.negative.prompt)
    ) {
      throw invalid('A local negative differs from its authored regional owner.')
    }
    if (negative !== '') {
      pending.push({ polarity: 'negative', sourceId: region.regionId, text: negative })
      bytes += textBytes(negative)
    }
  }
  if (bytes > MAX_AGGREGATE_TEXT_BYTES) {
    throw limit('Private Smart regional signed text exceeds 128 KiB.')
  }
  return Object.freeze(
    pending.map((entry) =>
      Object.freeze({
        ...entry,
        prompt:
          interpretation === undefined
            ? compileAnimaPromptWeighting(entry.text)
            : compileAnimaPromptWeightingForInterpretation(entry.text, interpretation),
      }),
    ),
  )
}

function consumedPrompt(prompt: GenerationPrompt): string {
  if (prompt.embeddingRefs.length !== 0) {
    throw unsupported('Private Anima Smart regions do not consume textual-inversion references.')
  }
  textBytes(prompt.text)
  return prompt.text
}

function textBytes(text: string): number {
  if (Buffer.from(text, 'utf8').toString('utf8') !== text || /[{}]/u.test(text)) {
    throw invalid('Private Smart regional prompts require valid static Unicode text.')
  }
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > GENERATION_BATCH_PROMPT_MAX_BYTES) {
    throw limit('Private Smart regional text exceeds 16 KiB.')
  }
  return bytes
}

function invalid(message: string): SmartPatchRegionalInputError {
  return new SmartPatchRegionalInputError('SMART_PATCH_REGIONAL_INPUT_INVALID', message)
}
function limit(message: string): SmartPatchRegionalInputError {
  return new SmartPatchRegionalInputError('SMART_PATCH_REGIONAL_LIMIT', message)
}
function unsupported(message: string): SmartPatchRegionalInputError {
  return new SmartPatchRegionalInputError('SMART_PATCH_REGIONAL_UNSUPPORTED', message)
}
