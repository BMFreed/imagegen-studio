/** Explicit first-slice aliases for Invoke's single SDXL scheduler key. */
export const ILLUSTRIOUS_SCHEDULER_PAIRS = [
  { invokeKey: 'dpmpp_2m_k', sampler: 'DPM++ 2M', scheduler: 'Karras' },
  { invokeKey: 'dpmpp_2m', sampler: 'DPM++ 2M', scheduler: 'Normal' },
  { invokeKey: 'euler_a', sampler: 'Euler a', scheduler: 'Normal' },
  { invokeKey: 'dpmpp_sde_k', sampler: 'DPM++ SDE', scheduler: 'Karras' },
  { invokeKey: 'dpmpp_sde', sampler: 'DPM++ SDE', scheduler: 'Normal' },
] as const

export type IllustriousSchedulerKey = (typeof ILLUSTRIOUS_SCHEDULER_PAIRS)[number]['invokeKey']

/** A partially chosen sampler is valid while editing, but never a qualified worker request. */
export function isIllustriousSamplingDraftPair(sampler: unknown, scheduler: unknown): boolean {
  if (sampler === null) {
    return scheduler === null
  }
  if (typeof sampler !== 'string') {
    return false
  }
  const pairs = ILLUSTRIOUS_SCHEDULER_PAIRS.filter((pair) => pair.sampler === sampler)
  return (
    pairs.length > 0 && (scheduler === null || pairs.some((pair) => pair.scheduler === scheduler))
  )
}

export function resolveIllustriousScheduler(
  sampler: string | null,
  scheduler: string | null,
):
  | { key: IllustriousSchedulerKey; kind: 'supported' }
  | { kind: 'missing' }
  | { kind: 'unsupported' } {
  if (sampler === null && scheduler === null) {
    return { kind: 'missing' }
  }
  const matched = ILLUSTRIOUS_SCHEDULER_PAIRS.find(
    (pair) => pair.sampler === sampler && pair.scheduler === scheduler,
  )
  return matched ? { key: matched.invokeKey, kind: 'supported' } : { kind: 'unsupported' }
}
