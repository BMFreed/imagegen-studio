/** Keep Home's read-only metadata finite and canonical without inventing a current timestamp. */
export function canonicalHomeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    return null
  }
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null
}

/** The filesystem index stores decimal nanoseconds; Home presents their truncated milliseconds. */
export function fileMtimeToHomeTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !/^-?\d{1,22}$/.test(value)) {
    return null
  }
  const milliseconds = BigInt(value) / 1_000_000n
  const dateLimit = 8_640_000_000_000_000n
  if (milliseconds < -dateLimit || milliseconds > dateLimit) {
    return null
  }
  return new Date(Number(milliseconds)).toISOString()
}
