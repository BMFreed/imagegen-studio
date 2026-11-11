import {
  DEFAULT_PROJECT_WORKSPACE_ID,
  type ProjectWorkspaceSummary,
} from '../../shared/projects/project-workspaces.js'

export function defaultProjectWorkspaceId(
  workspaces: readonly ProjectWorkspaceSummary[],
  selectedId: string | null,
): string {
  const selected = workspaces.find(({ id }) => id === selectedId)
  return selected?.availability === 'available' && selected.writable
    ? selected.id
    : DEFAULT_PROJECT_WORKSPACE_ID
}

export function projectWorkspaceDestinationProblem(
  workspaces: readonly ProjectWorkspaceSummary[],
  workspaceId: string,
): string | null {
  const workspace = workspaces.find(({ id }) => id === workspaceId)
  if (!workspace) {
    return 'The selected workspace is unavailable. Choose an available writable workspace.'
  }
  if (workspace.availability === 'missing') {
    return 'The selected workspace folder is missing. Reconnect it or choose another workspace.'
  }
  if (workspace.availability === 'inaccessible') {
    return 'The selected workspace folder cannot be accessed. Restore access or choose another workspace.'
  }
  return workspace.writable
    ? null
    : 'The selected workspace is read-only. Choose a writable workspace.'
}

export function projectWorkspaceDestinationOptions(
  workspaces: readonly ProjectWorkspaceSummary[],
  selectedId: string,
) {
  return workspaces
    .filter(
      (workspace) =>
        (workspace.availability === 'available' && workspace.writable) ||
        workspace.id === selectedId,
    )
    .map((workspace) => ({
      disabled: workspace.availability !== 'available' || !workspace.writable,
      label: workspace.displayName,
      value: workspace.id,
    }))
}
