import * as v from 'valibot'

/** Fixed SDXL schedule semantics; checkpoint objective is independently owned by the library. */
export const IllustriousNoiseProfileV1Schema = v.strictObject({
  baseSchedule: v.literal('sdxl-scaled-linear-v1'),
  rescaleBetasZeroSnr: v.boolean(),
  schemaVersion: v.literal(1),
  timestepSpacing: v.picklist(['leading', 'linspace', 'trailing']),
})

export type IllustriousNoiseProfileV1 = v.InferOutput<typeof IllustriousNoiseProfileV1Schema>
export type IllustriousTimestepSpacing = IllustriousNoiseProfileV1['timestepSpacing']

export function defaultIllustriousNoiseProfile(): IllustriousNoiseProfileV1 {
  return {
    baseSchedule: 'sdxl-scaled-linear-v1',
    rescaleBetasZeroSnr: false,
    schemaVersion: 1,
    timestepSpacing: 'leading',
  }
}

export function isIllustriousNoiseProfileV1(value: unknown): value is IllustriousNoiseProfileV1 {
  return v.is(IllustriousNoiseProfileV1Schema, value)
}

/** Absence in historical frozen execution means the original baseline, never today's policy. */
export function equalIllustriousNoiseProfiles(
  left: IllustriousNoiseProfileV1 | undefined,
  right: IllustriousNoiseProfileV1 | undefined,
): boolean {
  const a = left ?? defaultIllustriousNoiseProfile()
  const b = right ?? defaultIllustriousNoiseProfile()
  return (
    a.schemaVersion === b.schemaVersion &&
    a.baseSchedule === b.baseSchedule &&
    a.rescaleBetasZeroSnr === b.rescaleBetasZeroSnr &&
    a.timestepSpacing === b.timestepSpacing
  )
}

export function isDefaultIllustriousNoiseProfile(value: IllustriousNoiseProfileV1): boolean {
  return equalIllustriousNoiseProfiles(value, defaultIllustriousNoiseProfile())
}

/** Native Diffusers 0.40 DPM++ SDE has no zero-SNR transform; config extras do not implement it. */
export function supportsIllustriousNoiseProfile(
  scheduler: string,
  profile: IllustriousNoiseProfileV1,
): boolean {
  return !(
    profile.rescaleBetasZeroSnr &&
    (scheduler === 'dpmpp_sde' || scheduler === 'dpmpp_sde_k')
  )
}
