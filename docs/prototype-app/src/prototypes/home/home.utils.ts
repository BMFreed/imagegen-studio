import type {
  ExternalProjectDraft,
  HomeBrowseSelection,
  HomeProjectRecord,
  HomeSort,
  HomeStatusFilter,
  HomeWorkspace,
  NewProjectDraft,
} from './home.types'

export function projectNeedsAttention(project: HomeProjectRecord, workspaces: HomeWorkspace[]) {
  const workspace = workspaces.find((candidate) => candidate.id === project.workspaceId)
  return project.health !== 'ready' || !workspace || workspace.availability !== 'available'
}

export function getProjectsForBrowseSelection(
  projects: HomeProjectRecord[],
  selection: HomeBrowseSelection,
) {
  if (selection.kind === 'trash') {
    return projects.filter((project) => project.trashedAt !== undefined)
  }

  const activeProjects = projects.filter((project) => project.trashedAt === undefined)

  return selection.kind === 'workspace'
    ? activeProjects.filter((project) => project.workspaceId === selection.workspaceId)
    : activeProjects
}

export function filterHomeProjects(
  projects: HomeProjectRecord[],
  search: string,
  status: HomeStatusFilter,
  openProjectIds: string[],
  workspaces: HomeWorkspace[],
) {
  const needle = search.trim().toLocaleLowerCase()
  return projects.filter((project) => {
    if (needle && !project.displayName.toLocaleLowerCase().includes(needle)) {
      return false
    }
    switch (status) {
      case 'attention': {
        return projectNeedsAttention(project, workspaces)
      }
      case 'open': {
        return openProjectIds.includes(project.id)
      }
      case 'recovery': {
        return project.recoveryAvailable
      }
      default: {
        return true
      }
    }
  })
}

export function sortHomeProjects(projects: HomeProjectRecord[], sort: HomeSort) {
  return [...projects].sort((left, right) => {
    if (sort === 'name') {
      return left.displayName.localeCompare(right.displayName)
    }
    if (sort === 'modified') {
      return right.modifiedAt.localeCompare(left.modifiedAt)
    }
    return right.lastOpenedAt.localeCompare(left.lastOpenedAt)
  })
}

export function getWorkspaceProjectCount(projects: HomeProjectRecord[], workspaceId: string) {
  return projects.filter(
    (project) => project.workspaceId === workspaceId && project.trashedAt === undefined,
  ).length
}

export function getProjectConditionLabels(
  project: HomeProjectRecord,
  openProjectIds: string[],
  workspaces: HomeWorkspace[],
) {
  const labels: string[] = []
  if (project.trashedAt) {
    labels.push('In Trash')
  }
  if (openProjectIds.includes(project.id)) {
    labels.push('Open')
  }
  if (project.recoveryAvailable) {
    labels.push('Recovery available')
  }
  if (project.health === 'missing') {
    labels.push('File missing')
  }
  if (project.health === 'corrupt') {
    labels.push('Corrupt project')
  }
  if (project.health === 'unsupported_schema') {
    labels.push('Newer app required')
  }
  if (project.thumbnailState === 'missing' && project.health === 'ready') {
    labels.push('Preview unavailable')
  }
  const workspace = workspaces.find((candidate) => candidate.id === project.workspaceId)
  if (workspace && workspace.availability !== 'available') {
    labels.push('Workspace unavailable')
  }
  return labels
}

export function createProjectFromDraft(draft: NewProjectDraft): HomeProjectRecord {
  const now = new Date().toISOString()
  const displayName = draft.name.trim()
  return {
    displayName,
    fileName: `${displayName}.igs`,
    generationPayload: draft.generationPayload
      ? structuredClone(draft.generationPayload)
      : undefined,
    generationPresetId: draft.generationPresetId,
    health: 'ready',
    height: draft.height,
    id: `project-${slugify(displayName)}-${Date.now()}`,
    lastOpenedAt: now,
    layerCount: 1,
    modelName: draft.generationPayload?.model
      ? `${draft.generationPayload.model.name}${draft.generationPayload.model.version ? ` ${draft.generationPayload.model.version}` : ''}`
      : undefined,
    modifiedAt: now,
    recoveryAvailable: false,
    thumbnailState: 'missing',
    thumbnailTone: 'emerald',
    width: draft.width,
    workspaceId: draft.workspaceId,
  }
}

export function createProjectFromExternalDraft(draft: ExternalProjectDraft): HomeProjectRecord {
  const now = new Date().toISOString()
  const displayName = draft.fileName.replace(/\.igs$/i, '')
  return {
    displayName,
    fileName: draft.fileName,
    health: 'ready',
    height: 1024,
    id: `external-${slugify(displayName)}-${Date.now()}`,
    lastOpenedAt: now,
    layerCount: 4,
    modelName: 'Illustrious XL v1.1',
    modifiedAt: now,
    recoveryAvailable: false,
    thumbnailState: 'ready',
    thumbnailTone: 'blue',
    width: 1024,
    workspaceId: draft.destinationWorkspaceId,
  }
}

export function validateProjectName(
  name: string,
  workspaceId: string,
  projects: HomeProjectRecord[],
  ignoredProjectId?: string,
) {
  const trimmed = name.trim()
  if (!trimmed) {
    return 'Project name is required'
  }
  if (/[\\/:*?"<>|]/.test(trimmed)) {
    return 'Project name contains unsupported characters'
  }
  const fileName = `${trimmed}.igs`.toLocaleLowerCase()
  if (
    projects.some(
      (project) =>
        project.id !== ignoredProjectId &&
        project.workspaceId === workspaceId &&
        project.fileName.toLocaleLowerCase() === fileName,
    )
  ) {
    return 'A project with this name already exists in the workspace'
  }
  return ''
}

export function validateWorkspaceName(
  name: string,
  path: string,
  workspaces: HomeWorkspace[],
  ignoredWorkspaceId?: string,
) {
  const trimmed = name.trim()
  if (!trimmed) {
    return 'Workspace name is required'
  }
  if (!path.trim()) {
    return 'Choose a folder for this workspace'
  }
  if (
    workspaces.some(
      (workspace) =>
        workspace.id !== ignoredWorkspaceId &&
        (workspace.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase() ||
          workspace.path.toLocaleLowerCase() === path.toLocaleLowerCase()),
    )
  ) {
    return 'This workspace name or folder is already registered'
  }
  return ''
}

export function getNextProjectAfterRemoval(
  visibleProjects: HomeProjectRecord[],
  removedProjectId: string,
) {
  const index = visibleProjects.findIndex((project) => project.id === removedProjectId)
  return visibleProjects[index + 1] ?? visibleProjects[index - 1]
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
}
