import * as v from 'valibot'

/** Authored prompt-prefix setting; the measured batch job limit is a separate boundary. */
export const GENERATION_DYNAMIC_PROMPT_MAX_PROMPTS = 100

export const GenerationDynamicPromptSettingsSchema = v.strictObject({
  maxPrompts: v.pipe(
    v.number(),
    v.safeInteger(),
    v.minValue(1),
    v.maxValue(GENERATION_DYNAMIC_PROMPT_MAX_PROMPTS),
  ),
  seedBehavior: v.picklist(['per-iteration', 'per-prompt']),
})

export type GenerationDynamicPromptSettings = v.InferOutput<
  typeof GenerationDynamicPromptSettingsSchema
>

export const GENERATION_DYNAMIC_PROMPT_DEFAULTS: Readonly<GenerationDynamicPromptSettings> =
  Object.freeze({
    maxPrompts: GENERATION_DYNAMIC_PROMPT_MAX_PROMPTS,
    seedBehavior: 'per-iteration',
  })

export function isGenerationDynamicPromptSettings(
  input: unknown,
): input is GenerationDynamicPromptSettings {
  return v.is(GenerationDynamicPromptSettingsSchema, input)
}

/** Returns an owned effective value without inserting defaults into legacy documents. */
export function getEffectiveDynamicPromptSettings(
  settings?: GenerationDynamicPromptSettings,
): GenerationDynamicPromptSettings {
  return { ...(settings ?? GENERATION_DYNAMIC_PROMPT_DEFAULTS) }
}
