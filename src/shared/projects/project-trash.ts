import type { ProjectSummary } from '../api.js'

export interface ProjectTrashSummary extends ProjectSummary {
  deletionError: string | null
  deletionStatus: 'deleting' | 'trashed'
  fileName: string
  originalWorkspaceDirectoryPath: string
  originalWorkspaceName: string
  trashedAt: string
  trashId: string
}

export type ProjectTrashDeleteResult = { kind: 'deleted' } | { kind: 'pending'; message: string }
