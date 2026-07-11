export interface DocumentTabModel {
  dirty: boolean
  id: string
  kind: 'home' | 'project'
  title: string
  workspaceColor?: string
}

export interface ProjectOpenRequest {
  projectId: string
  recovered?: boolean
  target: 'current' | 'new'
}
