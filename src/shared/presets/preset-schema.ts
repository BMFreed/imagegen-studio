import * as v from 'valibot'

import { ANIMA_SAMPLING_METHOD_KEYS } from '../projects/anima-sampling-method.js'
import { IllustriousNoiseProfileV1Schema } from '../projects/illustrious-noise-profile.js'
import {
  GenerationLoraSchema,
  GenerationPromptSchema,
  GenerationResourceRefSchema,
  IGS_SAFETY_CEILINGS,
} from '../projects/project-schema.js'

/** The section list mirrors the approved editor; absence means leave the target unchanged. */
export const PRESET_SECTION_KEYS = [
  'prompt',
  'negativePrompt',
  'model',
  'loras',
  'size',
  'sampling',
  'guidance',
  'cfgRescale',
  'denoisingStrength',
  'seed',
  'vae',
  'vaePrecision',
] as const

export const PRESET_WORKFLOWS = ['textToImage', 'imageToImage', 'smartPatch'] as const
export type PresetSectionKey = (typeof PRESET_SECTION_KEYS)[number]
export type PresetWorkflow = (typeof PRESET_WORKFLOWS)[number]

const FiniteNumberSchema = v.pipe(v.number(), v.finite())
const PositiveIntegerSchema = v.pipe(FiniteNumberSchema, v.safeInteger(), v.minValue(1))
const UInt32Schema = v.pipe(
  FiniteNumberSchema,
  v.safeInteger(),
  v.minValue(0),
  v.maxValue(0xff_ff_ff_ff),
)
const UnitIntervalSchema = v.pipe(FiniteNumberSchema, v.minValue(0), v.maxValue(1))
const NonemptyTextSchema = v.pipe(
  v.string(),
  v.maxBytes(IGS_SAFETY_CEILINGS.titleBytes),
  v.check((value) => value.trim().length > 0, 'Expected nonempty text.'),
)
const CanonicalUtcSchema = v.pipe(
  v.string(),
  v.check(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    'Expected a canonical UTC timestamp.',
  ),
)

const CheckpointSchema = v.pipe(
  v.strictObject({
    ...GenerationResourceRefSchema.entries,
    kind: v.literal('checkpoint'),
    /** Advisory snapshot only: applying this section never changes exact-file library policy. */
    noiseProfile: v.optional(IllustriousNoiseProfileV1Schema),
  }),
  v.check(
    (value) => value.noiseProfile === undefined || value.baseModelFamily === 'illustrious',
    'Only an Illustrious checkpoint can carry an SD noise-profile snapshot.',
  ),
)
const EmbeddingResourceSchema = v.strictObject({
  ...GenerationResourceRefSchema.entries,
  kind: v.literal('embedding'),
})
const PromptSchema = v.strictObject({
  embeddingRefs: v.pipe(
    v.array(v.strictObject({ resource: EmbeddingResourceSchema, token: NonemptyTextSchema })),
    v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
  ),
  text: GenerationPromptSchema.entries.text,
})
const LoraSchema = v.strictObject({
  ...GenerationLoraSchema.entries,
  resource: v.strictObject({
    ...GenerationResourceRefSchema.entries,
    kind: v.literal('lora'),
  }),
})
const VaeSchema = v.strictObject({
  ...GenerationResourceRefSchema.entries,
  kind: v.literal('vae'),
})
const SamplingSchema = v.pipe(
  v.strictObject({
    animaMethod: v.optional(v.picklist(ANIMA_SAMPLING_METHOD_KEYS)),
    sampler: v.optional(NonemptyTextSchema),
    scheduler: v.optional(NonemptyTextSchema),
  }),
  v.check(
    (value) =>
      value.animaMethod !== undefined ||
      value.sampler !== undefined ||
      value.scheduler !== undefined,
    'A sampling section must contain at least one explicit setting.',
  ),
)
const SeedSchema = v.variant('policy', [
  v.strictObject({ policy: v.literal('fixed'), value: UInt32Schema }),
  v.strictObject({ policy: v.literal('random') }),
  v.strictObject({ policy: v.literal('reuse') }),
])
const SizeDimensionSchema = v.pipe(
  PositiveIntegerSchema,
  v.minValue(8),
  v.maxValue(IGS_SAFETY_CEILINGS.rasterDimension),
)

/** These are portable authoring values, not evidence of resource availability or ML support. */
export const PresetPayloadSchema = v.pipe(
  v.strictObject({
    cfgRescale: v.optional(UnitIntervalSchema),
    denoisingStrength: v.optional(UnitIntervalSchema),
    guidance: v.optional(
      v.strictObject({
        cfgScale: v.pipe(FiniteNumberSchema, v.minValue(0)),
        steps: PositiveIntegerSchema,
      }),
    ),
    loras: v.optional(v.pipe(v.array(LoraSchema), v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries))),
    model: v.optional(CheckpointSchema),
    negativePrompt: v.optional(PromptSchema),
    prompt: v.optional(PromptSchema),
    sampling: v.optional(SamplingSchema),
    seed: v.optional(SeedSchema),
    size: v.optional(v.strictObject({ height: SizeDimensionSchema, width: SizeDimensionSchema })),
    /** Explicit null selects Embedded; an omitted section must not clear an external VAE. */
    vae: v.optional(v.nullable(VaeSchema)),
    vaePrecision: v.optional(v.picklist(['Auto', 'FP16', 'FP32'])),
  }),
  v.check((value) => withinJsonBudget(value), 'Preset payload exceeds the portable JSON budget.'),
)

const DefinitionFieldsSchema = v.strictObject({
  description: v.pipe(v.string(), v.maxBytes(IGS_SAFETY_CEILINGS.textBytes)),
  favorite: v.boolean(),
  name: NonemptyTextSchema,
  payload: PresetPayloadSchema,
  tags: v.pipe(v.array(v.pipe(v.string(), v.maxBytes(128))), v.maxLength(64)),
  workflow: v.picklist(PRESET_WORKFLOWS),
})

/** Writes normalize workflow once; switching back to image-to-image invents no strength value. */
export const PresetDefinitionSchema = v.pipe(
  DefinitionFieldsSchema,
  v.transform((definition) => {
    const payload = { ...definition.payload }
    if (definition.workflow === 'textToImage') {
      delete payload.denoisingStrength
    }
    return { ...definition, name: definition.name.trim(), payload }
  }),
  v.check(
    (definition) => hasIncludedSection(definition.payload),
    'Include at least one preset section.',
  ),
  v.check(
    (value) => withinJsonBudget(value),
    'Preset definition exceeds the portable JSON budget.',
  ),
)

/** Reads reject noncanonical persisted data instead of silently repairing it. */
export const PresetRecordSchema = v.pipe(
  v.strictObject({
    ...DefinitionFieldsSchema.entries,
    deletedAt: v.nullable(CanonicalUtcSchema),
    expiresAt: v.nullable(CanonicalUtcSchema),
    id: v.pipe(v.string(), v.uuid()),
    updatedAt: CanonicalUtcSchema,
  }),
  v.check((record) => record.name === record.name.trim(), 'Stored preset names must be trimmed.'),
  v.check(
    (record) => record.workflow !== 'textToImage' || record.payload.denoisingStrength === undefined,
    'Stored text-to-image presets cannot include denoising strength.',
  ),
  v.check((record) => hasIncludedSection(record.payload), 'Include at least one preset section.'),
  v.check(
    (record) =>
      record.deletedAt === null
        ? record.expiresAt === null
        : record.expiresAt !== null && Date.parse(record.expiresAt) > Date.parse(record.deletedAt),
    'Deletion and expiry must form one valid lifecycle state.',
  ),
  v.check(
    ({ description, favorite, name, payload, tags, workflow }) =>
      withinJsonBudget({ description, favorite, name, payload, tags, workflow }),
    'Preset definition exceeds the portable JSON budget.',
  ),
)

export type PresetPayload = v.InferOutput<typeof PresetPayloadSchema>
export type PresetDefinition = v.InferOutput<typeof PresetDefinitionSchema>
export type PresetRecord = v.InferOutput<typeof PresetRecordSchema>

export function parsePresetPayload(input: unknown): PresetPayload {
  return v.parse(PresetPayloadSchema, input)
}

export function parsePresetDefinition(input: unknown): PresetDefinition {
  return v.parse(PresetDefinitionSchema, input)
}

export function isPresetRecord(input: unknown): input is PresetRecord {
  return v.is(PresetRecordSchema, input)
}

function hasIncludedSection(payload: PresetPayload): boolean {
  return PRESET_SECTION_KEYS.some((key) => payload[key] !== undefined)
}

function withinJsonBudget(value: unknown): boolean {
  try {
    return (
      new TextEncoder().encode(JSON.stringify(value)).byteLength <=
      IGS_SAFETY_CEILINGS.projectJsonBytes
    )
  } catch {
    return false
  }
}
