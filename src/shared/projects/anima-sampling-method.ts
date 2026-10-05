/** Authoring labels for the complete existing native registry; no default is implied. */
export const ANIMA_SAMPLING_METHOD_LABELS = {
  dpmpp_2m: 'DPM++ 2M',
  dpmpp_2m_sde: 'DPM++ 2M SDE',
  er_sde: 'ER-SDE',
  euler: 'Euler',
  heun: 'Heun',
  lcm: 'LCM',
} as const

export type AnimaSamplingMethod = keyof typeof ANIMA_SAMPLING_METHOD_LABELS

export const ANIMA_SAMPLING_METHOD_KEYS: readonly AnimaSamplingMethod[] = [
  'euler',
  'heun',
  'dpmpp_2m',
  'dpmpp_2m_sde',
  'er_sde',
  'lcm',
]

export const ANIMA_SAMPLING_METHOD_OPTIONS = ANIMA_SAMPLING_METHOD_KEYS.map((value) => ({
  label: ANIMA_SAMPLING_METHOD_LABELS[value],
  value,
}))

export function isAnimaSamplingMethod(value: unknown): value is AnimaSamplingMethod {
  return typeof value === 'string' && Object.hasOwn(ANIMA_SAMPLING_METHOD_LABELS, value)
}
