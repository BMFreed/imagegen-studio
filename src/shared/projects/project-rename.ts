import { IGS_SAFETY_CEILINGS } from './project-schema.js'

/** The Home name is also one filesystem component, including its .igs suffix. */
export function validateProjectRenameName(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return 'Project name is required.'
  }
  const name = value.trim()
  if (/[\\/:*?"<>|\u0000-\u001F\u007F]/.test(name)) {
    return 'Project name contains unsupported characters.'
  }
  const encoder = new TextEncoder()
  if (encoder.encode(name).length > IGS_SAFETY_CEILINGS.titleBytes) {
    return 'Project name is too long.'
  }
  // The supported Linux filesystem filename component is bounded independently of titleBytes.
  if (encoder.encode(`${name}.igs`).length > 255) {
    return 'Project filename is too long.'
  }
  return null
}

export function normalizeProjectRenameName(value: unknown): string | null {
  return validateProjectRenameName(value) === null ? (value as string).trim() : null
}
