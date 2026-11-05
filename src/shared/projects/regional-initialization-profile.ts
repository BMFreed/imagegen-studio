import * as v from 'valibot'

/** Explicit frozen execution identity; absence retains historical native initialization. */
export const RegionalInitializationProfileSchema = v.literal('invoke-cpu-f32-add-noise-v1')
export type RegionalInitializationProfile = v.InferOutput<
  typeof RegionalInitializationProfileSchema
>
