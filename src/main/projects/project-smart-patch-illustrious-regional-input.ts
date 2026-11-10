import type { PlannedGenerationBatchItem } from '../../shared/projects/generation-batch-plan.js'
import {
  defaultIllustriousNoiseProfile,
  type IllustriousNoiseProfileV1,
  IllustriousNoiseProfileV1Schema,
} from '../../shared/projects/illustrious-noise-profile.js'
import { PROJECT_MASK_MAX_COORDINATE } from '../../shared/projects/project-mask.js'
import { GenerationPromptSchema } from '../../shared/projects/project-schema.js'

import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { CapturedSmartPatchRegionalGenerationInput } from './project-smart-patch-regional-input.js'
import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'

import {
  captureSmartPatchRegionalSources,
  checkedSmartPatchRegionalCoverage,
  SMART_PATCH_REGIONAL_ALPHA_ROLES,
  SmartPatchRegionalInputError,
} from './project-smart-patch-regional-input.js'
import { captureSmartPatchExecutionRequest } from './smart-patch-execution-request.js'

export const ILLUSTRIOUS_SMART_REGIONAL_MODES = {
  'invoke-illustrious-smart-regional-img2img-v1': 'img2img',
  'invoke-illustrious-smart-regional-inpaint-v1': 'inpaint',
  'invoke-illustrious-smart-regional-outpaint-v1': 'outpaint',
  'invoke-illustrious-smart-regional-txt2img-v1': 'txt2img',
  'invoke-illustrious-smart-regional-v-prediction-img2img-v1': 'img2img',
  'invoke-illustrious-smart-regional-v-prediction-inpaint-v1': 'inpaint',
  'invoke-illustrious-smart-regional-v-prediction-outpaint-v1': 'outpaint',
  'invoke-illustrious-smart-regional-v-prediction-txt2img-v1': 'txt2img',
} as const
export type SmartPatchIllustriousRegionalProfile = keyof typeof ILLUSTRIOUS_SMART_REGIONAL_MODES

/** Objective and noise are resolved by the existing exact-file library owner, never by naming. */
export interface SmartPatchIllustriousRegionalResolvedPolicy {
  modelSha256: string
  noiseProfile: IllustriousNoiseProfileV1
  predictionType: 'epsilon' | 'v_prediction'
}

export function isSmartPatchIllustriousRegionalVPredictionProfile(
  profile: SmartPatchIllustriousRegionalProfile,
): boolean {
  return (
    profile === 'invoke-illustrious-smart-regional-v-prediction-img2img-v1' ||
    profile === 'invoke-illustrious-smart-regional-v-prediction-inpaint-v1' ||
    profile === 'invoke-illustrious-smart-regional-v-prediction-outpaint-v1' ||
    profile === 'invoke-illustrious-smart-regional-v-prediction-txt2img-v1'
  )
}

const integer = (min: number, max = Number.MAX_SAFE_INTEGER) =>
  v.pipe(v.number(), v.safeInteger(), v.minValue(min), v.maxValue(max))
const numeric = (min: number, max: number) =>
  v.pipe(v.number(), v.finite(), v.minValue(min), v.maxValue(max))
const uuid = v.pipe(v.string(), v.uuid())
const sha256 = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u))
const resolvedPolicySchema = v.strictObject({
  modelSha256: sha256,
  noiseProfile: IllustriousNoiseProfileV1Schema,
  predictionType: v.picklist(['epsilon', 'v_prediction']),
})
const rect = v.strictObject({
  height: integer(1, 2048),
  width: integer(1, 2048),
  x: integer(-PROJECT_MASK_MAX_COORDINATE, PROJECT_MASK_MAX_COORDINATE),
  y: integer(-PROJECT_MASK_MAX_COORDINATE, PROJECT_MASK_MAX_COORDINATE),
})
const recipeSchema = v.strictObject({
  bbox: rect,
  documentId: uuid,
  documentRevision: uuid,
  family: v.literal('illustrious'),
  globalPrompts: v.strictObject({
    negative: GenerationPromptSchema,
    positive: GenerationPromptSchema,
  }),
  internalResolution: v.strictObject({ height: integer(64, 512), width: integer(64, 512) }),
  item: v.strictObject({
    iteration: integer(0, 0),
    promptPairIndex: integer(0, 0),
    prompts: v.strictObject({ negative: v.string(), positive: v.string() }),
    seed: integer(0, 0xff_ff_ff_ff),
  }),
  kind: v.literal('smart-patch-regional-recipe'),
  layerId: uuid,
  modelSha256: sha256,
  regions: v.array(
    v.strictObject({
      authoredPrompts: v.optional(
        v.strictObject({
          negative: v.nullable(GenerationPromptSchema),
          positive: v.nullable(GenerationPromptSchema),
          useGlobalNegativePrompt: v.boolean(),
        }),
      ),
      coverage: v.strictObject({
        alpha: v.custom<Uint8Array>((value) => value instanceof Uint8Array),
        bounds: rect,
        intersection: v.nullable(rect),
        kind: v.picklist(['covered', 'empty', 'intersecting-empty', 'outside']),
      }),
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
    cfgScale: v.pipe(
      numeric(1, 30),
      v.check((n) => n > 1),
    ),
    denoisingStrength: numeric(0, 1),
    noiseProfile: v.optional(IllustriousNoiseProfileV1Schema),
    scheduler: v.literal('euler'),
    steps: integer(1, 200),
  }),
  smartMask: v.strictObject({ maskId: uuid, maskRevision: integer(0) }),
})
const preparedSchema = v.strictObject({
  profile: v.picklist(
    Object.keys(ILLUSTRIOUS_SMART_REGIONAL_MODES) as SmartPatchIllustriousRegionalProfile[],
  ),
  recipe: recipeSchema,
  schemaVersion: v.literal(1),
})
const frozenPreparedSchema = v.strictObject({
  ...preparedSchema.entries,
  recipe: v.strictObject({
    ...recipeSchema.entries,
    regions: v.array(
      v.strictObject({
        ...recipeSchema.entries.regions.item.entries,
        coverage: v.strictObject({
          ...recipeSchema.entries.regions.item.entries.coverage.entries,
          alpha: v.picklist(SMART_PATCH_REGIONAL_ALPHA_ROLES),
        }),
      }),
    ),
  }),
})
export type FrozenSmartPatchIllustriousRegionalInputV1 = v.InferOutput<typeof frozenPreparedSchema>
export type PreparedSmartPatchIllustriousRegionalInput = v.InferOutput<typeof preparedSchema>
export type BoundSmartPatchIllustriousRegionalInput = PreparedSmartPatchIllustriousRegionalInput & {
  execution: Extract<SmartPatchExecutionRequest, { family: 'illustrious' }>
}

type RecipeSources = Omit<PreparedSmartPatchIllustriousRegionalInput['recipe'], 'regions'> & {
  regions: Omit<
    PreparedSmartPatchIllustriousRegionalInput['recipe']['regions'][number],
    'coverage'
  >[]
}

/** Private Main companion; neither public permission nor a second source/mask classifier. */
export async function prepareSmartPatchIllustriousRegionalInput(input: {
  capture: CapturedSmartPatchRegionalGenerationInput
  item: PlannedGenerationBatchItem
  profile: SmartPatchIllustriousRegionalProfile
  resolvedPolicy?: SmartPatchIllustriousRegionalResolvedPolicy
}): Promise<PreparedSmartPatchIllustriousRegionalInput> {
  const { context, document, item, patch, projectMask } = captureSmartPatchRegionalSources(input)
  const profile = input.profile
  const requestedPolicy = input.resolvedPolicy
  const draft = patch.generationDraft
  let policy: SmartPatchIllustriousRegionalResolvedPolicy
  if (requestedPolicy === undefined) {
    if (draft.model?.predictionType !== 'epsilon') {
      throw invalid('V Smart regions require the explicit exact-file resolved policy.')
    }
    policy = {
      modelSha256: draft.model.fileSha256,
      noiseProfile: defaultIllustriousNoiseProfile(),
      predictionType: 'epsilon',
    }
  } else {
    const parsed = v.safeParse(resolvedPolicySchema, structuredClone(requestedPolicy))
    if (!parsed.success) {
      throw invalid('The resolved Illustrious Smart regional policy is malformed.')
    }
    policy = parsed.output
  }
  const vPrediction = isSmartPatchIllustriousRegionalVPredictionProfile(profile)
  if (
    draft.model?.baseModelFamily !== 'illustrious' ||
    policy.modelSha256 !== draft.model.fileSha256 ||
    policy.predictionType !== (vPrediction ? 'v_prediction' : 'epsilon') ||
    (!vPrediction && !isDeepStrictEqual(policy.noiseProfile, defaultIllustriousNoiseProfile())) ||
    draft.loras.some((lora) => lora.enabled) ||
    draft.vae !== null ||
    (draft.vaePrecision ?? 'Auto') !== 'Auto' ||
    (draft.cfgRescale ?? 0) !== 0 ||
    draft.clipSkip !== undefined ||
    draft.sampling.sampler !== 'Euler' ||
    draft.sampling.scheduler !== 'Normal' ||
    draft.sampling.animaMethod != null
  ) {
    throw invalid(
      'Private Illustrious Smart regions require their exact objective/policy, Euler/Normal, embedded Auto VAE and no enabled LoRA.',
    )
  }
  const recipe: PreparedSmartPatchIllustriousRegionalInput['recipe'] = {
    bbox: { ...context.bbox },
    documentId: context.documentId,
    documentRevision: context.documentRevision,
    family: 'illustrious',
    globalPrompts: structuredClone({
      negative: draft.negativePrompt,
      positive: draft.positivePrompt,
    }),
    internalResolution: { ...context.internalResolution },
    item,
    kind: 'smart-patch-regional-recipe',
    layerId: patch.id,
    modelSha256: draft.model.fileSha256,
    regions: (document.regionalGuidance ?? [])
      .filter((region) => region.enabled)
      .map((region) => ({
        ...(region.prompts ? { authoredPrompts: structuredClone(region.prompts) } : {}),
        coverage: {
          alpha: new Uint8Array(0),
          bounds: { ...context.bbox },
          intersection: null,
          kind: 'empty',
        },
        maskId: region.mask.id,
        maskRevision: region.mask.revision,
        negative:
          region.prompts?.useGlobalNegativePrompt === false
            ? { prompt: structuredClone(region.prompts.negative!), source: 'regional' }
            : { prompt: structuredClone(draft.negativePrompt), source: 'smart-patch' },
        positive: region.prompts?.positive ? structuredClone(region.prompts.positive) : null,
        ...(Object.hasOwn(region, 'referenceImages')
          ? { referenceImages: structuredClone(region.referenceImages) }
          : {}),
        regionId: region.id,
      })),
    sampling: {
      cfgScale: draft.sampling.cfgScale!,
      denoisingStrength: draft.sampling.denoisingStrength!,
      ...(vPrediction ? { noiseProfile: structuredClone(policy.noiseProfile) } : {}),
      scheduler: 'euler',
      steps: draft.sampling.steps!,
    },
    smartMask: { maskId: patch.mask.id, maskRevision: patch.mask.revision },
  }
  // Reject unsupported active text/policy before reading any regional pixels.
  validateSources(parsePrepared({ profile, recipe, schemaVersion: 1 }).recipe)
  for (const region of recipe.regions) {
    region.coverage = checkedSmartPatchRegionalCoverage(
      structuredClone(await projectMask(region.regionId, { ...recipe.bbox })),
      recipe.bbox,
    )
  }
  return capturePreparedSmartPatchIllustriousRegionalInput({ profile, recipe, schemaVersion: 1 })
}

export function capturePreparedSmartPatchIllustriousRegionalInput(
  input: unknown,
): PreparedSmartPatchIllustriousRegionalInput {
  const prepared = parsePrepared(input)
  validateSources(prepared.recipe)
  for (const region of prepared.recipe.regions) {
    region.coverage = checkedSmartPatchRegionalCoverage(region.coverage, prepared.recipe.bbox)
    if (region.maskRevision === 0 && region.coverage.kind !== 'empty') {
      throw invalid('An unauthored regional mask cannot carry projected pixels.')
    }
  }
  return prepared
}

/** Bind the one original Smart command; keep source, KEEP and resource ownership there. */
export function bindSmartPatchIllustriousRegionalExecution(
  input: PreparedSmartPatchIllustriousRegionalInput,
  executionInput: SmartPatchExecutionRequest,
): BoundSmartPatchIllustriousRegionalInput {
  const prepared = capturePreparedSmartPatchIllustriousRegionalInput(input)
  const execution = captureSmartPatchExecutionRequest(executionInput)
  assertSmartPatchIllustriousRegionalExecutionAgreement(prepared, execution)

  return { ...prepared, execution }
}

/** Validate the complete original policy without fabricating regional alpha during metadata reads. */
export function assertSmartPatchIllustriousRegionalExecutionAgreement(
  input: Omit<PreparedSmartPatchIllustriousRegionalInput, 'recipe'> & { recipe: RecipeSources },
  execution: SmartPatchExecutionRequest,
): asserts execution is Extract<SmartPatchExecutionRequest, { family: 'illustrious' }> {
  if (execution.family !== 'illustrious') {
    throw invalid('Illustrious regions require their original Smart command.')
  }
  const { recipe } = input
  validateProfilePolicy(input)
  const vPrediction = isSmartPatchIllustriousRegionalVPredictionProfile(input.profile)
  const policy = execution.inference
  if (
    execution.mode !== ILLUSTRIOUS_SMART_REGIONAL_MODES[input.profile] ||
    !isDeepStrictEqual(execution.internalResolution, recipe.internalResolution) ||
    policy.checkpoint.predictionType !== (vPrediction ? 'v_prediction' : 'epsilon') ||
    policy.checkpoint.sha256 !== recipe.modelSha256 ||
    !isDeepStrictEqual(policy.prompts, recipe.item.prompts) ||
    policy.sampling.scheduler !== 'euler' ||
    policy.sampling.seed !== recipe.item.seed ||
    policy.sampling.steps !== recipe.sampling.steps ||
    policy.sampling.cfgScale !== recipe.sampling.cfgScale ||
    (policy.sampling.cfgRescale ?? 0) !== 0 ||
    (execution.mode === 'txt2img'
      ? policy.sampling.denoisingStrength !== undefined
      : policy.sampling.denoisingStrength !== recipe.sampling.denoisingStrength) ||
    !isDeepStrictEqual(
      policy.sampling.noiseProfile,
      vPrediction ? recipe.sampling.noiseProfile : defaultIllustriousNoiseProfile(),
    ) ||
    (policy.loras?.length ?? 0) !== 0 ||
    (policy.embeddings?.positive.length ?? 0) !== 0 ||
    (policy.embeddings?.negative.length ?? 0) !== 0 ||
    policy.vae != null ||
    (policy.vaePrecision ?? 'Auto') !== 'Auto'
  ) {
    throw invalid(
      'The original Smart execution differs from its frozen Illustrious regional input.',
    )
  }
}

/**
 * Frozen metadata authenticates role/owner associations; actual bytes remain the bundle owner's
 * job.
 */
export function captureFrozenSmartPatchIllustriousRegionalInputV1(
  input: unknown,
): FrozenSmartPatchIllustriousRegionalInputV1 {
  const parsed = v.safeParse(frozenPreparedSchema, structuredClone(input))
  if (!parsed.success) {
    throw invalid('The frozen Illustrious Smart regional input is malformed.')
  }
  const value = parsed.output
  validateProfilePolicy(value)
  validateSources(value.recipe)
  for (const [index, region] of value.recipe.regions.entries()) {
    const plane = region.coverage
    const bbox = value.recipe.bbox
    const intersection = plane.intersection
    if (
      plane.alpha !== SMART_PATCH_REGIONAL_ALPHA_ROLES[index] ||
      !isDeepStrictEqual(plane.bounds, bbox) ||
      (plane.kind === 'covered' || plane.kind === 'intersecting-empty') !==
        (intersection !== null) ||
      (region.maskRevision === 0 && plane.kind !== 'empty') ||
      (intersection &&
        (intersection.x < bbox.x ||
          intersection.y < bbox.y ||
          intersection.x + intersection.width > bbox.x + bbox.width ||
          intersection.y + intersection.height > bbox.y + bbox.height))
    ) {
      throw invalid('Frozen Illustrious regional role/world metadata differs from its owned plane.')
    }
  }
  return value
}

function parsePrepared(input: unknown): PreparedSmartPatchIllustriousRegionalInput {
  const parsed = v.safeParse(preparedSchema, structuredClone(input))
  if (!parsed.success) {
    throw invalid('The private Illustrious Smart regional input is malformed.')
  }
  validateProfilePolicy(parsed.output)
  return parsed.output
}

function validateProfilePolicy(input: {
  profile: SmartPatchIllustriousRegionalProfile
  recipe: { sampling: { noiseProfile?: IllustriousNoiseProfileV1 } }
}): void {
  const vPrediction = isSmartPatchIllustriousRegionalVPredictionProfile(input.profile)
  if (
    vPrediction
      ? input.recipe.sampling.noiseProfile === undefined
      : Object.hasOwn(input.recipe.sampling, 'noiseProfile')
  ) {
    throw invalid('Only V Smart regional profiles require an explicit independent noise policy.')
  }
}

function validateSources(recipe: RecipeSources): void {
  const { bbox, internalResolution: size } = recipe
  if (
    bbox.width * bbox.height > 4_000_000 ||
    size.width % 8 !== 0 ||
    size.height % 8 !== 0 ||
    recipe.regions.length > 3
  ) {
    throw invalid('Private Illustrious Smart regional geometry or stream count exceeds its bounds.')
  }
  const owned = new Set([recipe.documentId, recipe.layerId, recipe.smartMask.maskId])
  if (owned.size !== 3) {
    throw invalid('Document, Smart layer and mask owners collide.')
  }
  if (
    !isDeepStrictEqual(recipe.item.prompts, {
      negative: recipe.globalPrompts.negative.text,
      positive: recipe.globalPrompts.positive.text,
    })
  ) {
    throw invalid('The concrete item differs from selected Smart prompts.')
  }
  const consumed = [recipe.globalPrompts.positive, recipe.globalPrompts.negative]
  for (const region of recipe.regions) {
    if (
      owned.has(region.regionId) ||
      owned.has(region.maskId) ||
      region.regionId === region.maskId
    ) {
      throw invalid('Regional and Smart owners collide.')
    }
    owned.add(region.regionId)
    owned.add(region.maskId)
    if (region.referenceImages?.length) {
      throw invalid('Private Illustrious Smart regional references are not admitted.')
    }
    const authored = region.authoredPrompts
    if (region.positive !== null) {
      if (!authored || !isDeepStrictEqual(authored.positive, region.positive)) {
        throw invalid('The regional positive differs from its authored owner.')
      }
      consumed.push(region.positive)
    } else if (authored?.positive != null) {
      throw invalid('A regional positive was silently omitted.')
    }
    if (region.negative.source === 'smart-patch') {
      if (
        authored?.useGlobalNegativePrompt === false ||
        !isDeepStrictEqual(region.negative.prompt, recipe.globalPrompts.negative)
      ) {
        throw invalid('Inherited negative differs from selected Smart settings.')
      }
    } else if (
      !authored ||
      authored.useGlobalNegativePrompt ||
      !isDeepStrictEqual(authored.negative, region.negative.prompt)
    ) {
      throw invalid('Local negative differs from its authored owner.')
    }
    consumed.push(region.negative.prompt)
  }
  let bytes = 0
  for (const prompt of consumed) {
    if (
      prompt.embeddingRefs.length ||
      /[{}]/u.test(prompt.text) ||
      Buffer.from(prompt.text).toString('utf8') !== prompt.text
    ) {
      throw invalid(
        'Private Illustrious Smart regions require static Unicode prompts without TI references.',
      )
    }
    const count = Buffer.byteLength(prompt.text)
    bytes += count
    if (count > 16 * 1024 || bytes > 128 * 1024) {
      throw invalid('Private Illustrious Smart regional text exceeds its budget.')
    }
  }
}

function invalid(message: string): SmartPatchRegionalInputError {
  return new SmartPatchRegionalInputError('SMART_PATCH_REGIONAL_INPUT_INVALID', message)
}
