/** Existing recovery-format ceilings, also checked before admitting a grouped batch. */
export const GENERATION_STAGING_LIMITS = {
  candidates: 64,
  frozenPayloadBytes: 128 * 1024,
  manifestBytes: 8 * 1024 * 1024,
} as const
