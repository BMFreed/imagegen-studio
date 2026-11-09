import type { PlannedGenerationBatchItem } from '../../shared/projects/generation-batch-plan.js'
import { defaultIllustriousNoiseProfile } from '../../shared/projects/illustrious-noise-profile.js'
import { PROJECT_MASK_MAX_COORDINATE } from '../../shared/projects/project-mask.js'
import { GenerationPromptSchema } from '../../shared/projects/project-schema.js'

import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { CapturedSmartPatchRegionalGenerationInput } from './project-smart-patch-regional-input.js'
import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'

import {
  captureSmartPatchRegionalSources,
  checkedSmartPatchRegionalCoverage,
  SmartPatchRegionalInputError,
} from './project-smart-patch-regional-input.js'
import { captureSmartPatchExecutionRequest } from './smart-patch-execution-request.js'

export const ILLUSTRIOUS_SMART_REGIONAL_MODES = {
  'invoke-illustrious-smart-regional-img2img-v1': 'img2img',
  'invoke-illustrious-smart-regional-inpaint-v1': 'inpaint',
  'invoke-illustrious-smart-regional-outpaint-v1': 'outpaint',
  'invoke-illustrious-smart-regional-txt2img-v1': 'txt2img',
} as const
export type SmartPatchIllustriousRegionalProfile = keyof typeof ILLUSTRIOUS_SMART_REGIONAL_MODES

const integer = (min: number, max = Number.MAX_SAFE_INTEGER) =>
  v.pipe(v.number(), v.safeInteger(), v.minValue(min), v.maxValue(max))
const numeric = (min: number, max: number) =>
  v.pipe(v.number(), v.finite(), v.minValue(min), v.maxValue(max))
const uuid = v.pipe(v.string(), v.uuid())
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
  modelSha256: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u)),
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
export type PreparedSmartPatchIllustriousRegionalInput = v.InferOutput<typeof preparedSchema>
export type BoundSmartPatchIllustriousRegionalInput = PreparedSmartPatchIllustriousRegionalInput & {
  execution: Extract<SmartPatchExecutionRequest, { family: 'illustrious' }>
}

/** Private Main companion; neither public permission nor a second source/mask classifier. */
export async function prepareSmartPatchIllustriousRegionalInput(input: {
  capture: CapturedSmartPatchRegionalGenerationInput
  item: PlannedGenerationBatchItem
  profile: SmartPatchIllustriousRegionalProfile
}): Promise<PreparedSmartPatchIllustriousRegionalInput> {
  const { context, document, item, patch, projectMask } = captureSmartPatchRegionalSources(input)
  const profile = input.profile
  const draft = patch.generationDraft
  if (
    draft.model?.baseModelFamily !== 'illustrious' ||
    draft.model.predictionType !== 'epsilon' ||
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
      'Private Illustrious Smart regions require epsilon Euler/Normal, embedded Auto VAE and no enabled LoRA.',
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
  if (execution.family !== 'illustrious') {
    throw invalid('Illustrious regions require their original Smart command.')
  }
  const { recipe } = prepared
  const policy = execution.inference
  if (
    execution.mode !== ILLUSTRIOUS_SMART_REGIONAL_MODES[prepared.profile] ||
    !isDeepStrictEqual(execution.internalResolution, recipe.internalResolution) ||
    policy.checkpoint.predictionType !== 'epsilon' ||
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
    !isDeepStrictEqual(policy.sampling.noiseProfile, defaultIllustriousNoiseProfile()) ||
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
  return { ...prepared, execution }
}

function parsePrepared(input: unknown): PreparedSmartPatchIllustriousRegionalInput {
  const parsed = v.safeParse(preparedSchema, structuredClone(input))
  if (!parsed.success) {
    throw invalid('The private Illustrious Smart regional input is malformed.')
  }
  return parsed.output
}

function validateSources(recipe: PreparedSmartPatchIllustriousRegionalInput['recipe']): void {
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
