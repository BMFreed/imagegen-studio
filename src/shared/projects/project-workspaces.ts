/** Workspace metadata follows Invoke's bounded named-record CRUD; paths belong to Main. */
export const PROJECT_WORKSPACE_COLORS = ['green', 'blue', 'amber', 'violet', 'teal'] as const
export type ProjectWorkspaceColor = (typeof PROJECT_WORKSPACE_COLORS)[number]
export const PROJECT_WORKSPACE_NAME_MAX_LENGTH = 300
export const DEFAULT_PROJECT_WORKSPACE_ID = 'uncategorized'

export interface ProjectWorkspaceAddInput {
  color: ProjectWorkspaceColor
  displayName: string
}

export interface ProjectWorkspaceSummary {
  availability: 'available' | 'inaccessible' | 'missing'
  color: string
  directoryPath: string
  displayName: string
  id: string
  isDefault: boolean
  projectCount: number
  writable: boolean
}

export function isProjectWorkspaceId(value: unknown): value is string {
  return (
    value === DEFAULT_PROJECT_WORKSPACE_ID ||
    (typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
  )
}

export function parseProjectWorkspaceAddInput(value: unknown): ProjectWorkspaceAddInput {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'color') ||
    !Object.hasOwn(value, 'displayName')
  ) {
    throw new Error('Enter a workspace name and color.')
  }
  const input = value as { color: unknown; displayName: unknown }
  if (
    typeof input.displayName !== 'string' ||
    !input.displayName.trim() ||
    input.displayName.trim().length > PROJECT_WORKSPACE_NAME_MAX_LENGTH ||
    typeof input.color !== 'string' ||
    !PROJECT_WORKSPACE_COLORS.includes(input.color as ProjectWorkspaceColor)
  ) {
    throw new Error('The workspace name or color is invalid.')
  }
  return { color: input.color as ProjectWorkspaceColor, displayName: input.displayName.trim() }
}

export function isProjectWorkspaceAddInput(value: unknown): value is ProjectWorkspaceAddInput {
  try {
    parseProjectWorkspaceAddInput(value)
    return true
  } catch {
    return false
  }
}
