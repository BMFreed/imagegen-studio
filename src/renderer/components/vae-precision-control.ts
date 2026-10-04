export type VaePrecision = 'Auto' | 'FP16' | 'FP32'

export function vaePrecisionGenerationReason(
  value: VaePrecision | undefined,
  supported: boolean,
): string | null {
  return value === undefined || value === 'Auto' || supported
    ? null
    : 'The current image engine does not support manual VAE precision. Select Auto or update the image engine before generating.'
}

export function vaePrecisionControlState(input: {
  editingDisabled: boolean
  modelFamily: string | null
  runtimeSupported: boolean | null
  runtimeUnavailableReason: string | null
  value: VaePrecision | null
}): { disabled: boolean; reason: string | null } {
  const familySupported = input.modelFamily === 'illustrious'
  let reason: string | null = null
  if (!familySupported) {
    reason =
      input.modelFamily === 'anima'
        ? 'VAE precision is currently available only for Illustrious.'
        : 'Choose an Illustrious checkpoint to use VAE precision.'
  } else if (input.value !== null && input.value !== 'Auto') {
    if (input.runtimeUnavailableReason) {
      reason = `${input.runtimeUnavailableReason} You can still save this precision setting.`
    } else if (input.runtimeSupported === null) {
      reason = 'Checking image engine support for manual VAE precision.'
    } else if (!input.runtimeSupported) {
      reason = vaePrecisionGenerationReason(input.value, false)
    }
  }
  return { disabled: input.editingDisabled || !familySupported, reason }
}
