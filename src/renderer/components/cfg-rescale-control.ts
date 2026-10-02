export function cfgRescaleControlState(input: {
  editingDisabled: boolean
  modelFamily: string | null
  runtimeSupported: boolean | null
  runtimeUnavailableReason: string | null
}) {
  let reason: string | null = null
  if (input.modelFamily === 'anima') {
    reason = 'CFG Rescale is currently available only for Illustrious.'
  } else if (input.modelFamily !== 'illustrious') {
    reason = 'Choose an Illustrious checkpoint to use CFG Rescale.'
  } else if (input.runtimeUnavailableReason) {
    reason = input.runtimeUnavailableReason
  } else if (input.runtimeSupported === null) {
    reason = 'Checking image engine support for CFG Rescale.'
  } else if (!input.runtimeSupported) {
    reason = 'The current image engine does not support CFG Rescale for Illustrious.'
  }
  return { disabled: input.editingDisabled || reason !== null, reason }
}

export function parseCfgRescaleInput(
  text: string,
): { kind: 'invalid' } | { kind: 'valid'; value: number | null } {
  const trimmed = text.trim()
  if (trimmed === '') {
    return { kind: 'valid', value: null }
  }
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
    return { kind: 'invalid' }
  }
  const value = Number(trimmed)
  return Number.isFinite(value) && value >= 0 && value <= 0.99
    ? { kind: 'valid', value }
    : { kind: 'invalid' }
}

export function cfgRescaleDisplayValue(value: number | null, modelFamily: string | null): string {
  return value !== null ? String(value) : modelFamily === 'illustrious' ? '0' : ''
}

export function cfgRescaleEditingValid(text: string, edited: boolean): boolean {
  return !edited || parseCfgRescaleInput(text).kind === 'valid'
}

export function cfgRescaleGenerationRangeReason(value: number | undefined): string | null {
  return value === undefined || (Number.isFinite(value) && value >= 0 && value <= 0.99)
    ? null
    : 'Reset CFG Rescale or enter a value from 0 to 0.99 before generating.'
}

export function cfgRescaleGenerationCapabilityReason(
  value: number | undefined,
  supported: boolean,
): string | null {
  return value === undefined || value === 0 || supported
    ? null
    : 'The current image engine does not support CFG Rescale. Reset CFG Rescale or update the image engine before generating.'
}
