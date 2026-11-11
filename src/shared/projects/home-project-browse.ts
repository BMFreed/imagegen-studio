import type { ProjectSummary } from '../api.js'
import type { ProjectWorkspaceSummary } from './project-workspaces.js'

export type HomeProjectSort = 'lastOpened' | 'modified' | 'name'
export type HomeProjectStatus = 'all' | 'attention' | 'open' | 'recovery'

/** New metadata is canonical ISO or unknown; legacy summaries may omit it entirely. */
export function isHomeProjectTimestamp(value: unknown): value is string | null {
  if (value === null) {
    return true
  }
  if (typeof value !== 'string' || value.length > 32) {
    return false
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

/**
 * Adapt Invoke's pure project-library filter/sort pipeline. Studio keeps its independent status
 * predicates and nullable saved metadata; no pin/date groups or filesystem writes.
 */
export function selectHomeProjects<T extends ProjectSummary>(input: {
  openProjectIds: readonly string[]
  projects: readonly T[]
  search: string
  sort: HomeProjectSort
  status: HomeProjectStatus
  workspaces: readonly Pick<ProjectWorkspaceSummary, 'availability' | 'id'>[]
}): T[] {
  const needle = input.search.trim().toLocaleLowerCase()
  const open = new Set(input.openProjectIds)
  const available = new Set(
    input.workspaces
      .filter((workspace) => workspace.availability === 'available')
      .map(({ id }) => id),
  )
  const matched = input.projects.filter((project) => {
    if (!project.title.toLocaleLowerCase().includes(needle)) {
      return false
    }
    switch (input.status) {
      case 'attention': {
        return project.health !== 'ready' || !available.has(project.workspaceId)
      }
      case 'open': {
        return open.has(project.id)
      }
      case 'recovery': {
        return project.recoveryStatus === 'recoverable'
      }
      default: {
        return true
      }
    }
  })
  // Invoke's natural, case-insensitive name ordering; stable identity resolves exact ties.
  const byName = (a: T, b: T): number =>
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }) ||
    a.id.localeCompare(b.id)
  return matched.sort((a, b) => {
    if (input.sort === 'name') {
      return byName(a, b)
    }
    const field = input.sort === 'modified' ? 'modifiedAt' : 'lastOpenedAt'
    const left = sortTimestamp(a[field])
    const right = sortTimestamp(b[field])
    if (left === null || right === null) {
      return left === right ? byName(a, b) : left === null ? 1 : -1
    }
    return right - left || byName(a, b)
  })
}

function sortTimestamp(value: string | null | undefined): number | null {
  return value != null && isHomeProjectTimestamp(value) ? Date.parse(value) : null
}
