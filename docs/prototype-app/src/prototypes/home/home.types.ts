import type { PresetPayload } from '../presets/presets.types';

export type HomeScenarioId = 'default' | 'first-run' | 'no-model' | 'problems';

export type HomeBrowseSelection =
  { kind: 'all' } | { kind: 'trash' } | { kind: 'workspace'; workspaceId: string };

export type HomeSort = 'lastOpened' | 'modified' | 'name';
export type HomeStatusFilter = 'all' | 'attention' | 'open' | 'recovery';
export type HomeViewMode = 'grid' | 'list';

export type ProjectHealth = 'corrupt' | 'missing' | 'ready' | 'unsupported_schema';
export type ThumbnailState = 'missing' | 'ready';
export type WorkspaceAvailability = 'available' | 'inaccessible' | 'missing';
export type ProjectThumbnailTone = 'blue' | 'emerald' | 'gray' | 'rose' | 'violet';

export interface HomeWorkspace {
  availability: WorkspaceAvailability;
  color: string;
  id: string;
  isDefault: boolean;
  name: string;
  path: string;
}

export interface HomeProjectRecord {
  displayName: string;
  fileName: string;
  generationPayload?: PresetPayload;
  generationPresetId?: string;
  health: ProjectHealth;
  height: number;
  id: string;
  lastOpenedAt: string;
  layerCount: number;
  modelName?: string;
  modifiedAt: string;
  recoveryAvailable: boolean;
  thumbnailState: ThumbnailState;
  thumbnailTone: ProjectThumbnailTone;
  trashedAt?: string;
  width: number;
  workspaceId: string;
}

export interface NewProjectDraft {
  generationPayload?: PresetPayload;
  generationPresetId?: string;
  height: number;
  name: string;
  width: number;
  workspaceId: string;
}

export interface ExternalProjectDraft {
  destinationWorkspaceId: string;
  fileName: string;
  operation: 'copy' | 'move';
  sourcePath: string;
}

export interface HomeScenario {
  hasInstalledModel: boolean;
  projects: HomeProjectRecord[];
  workspaces: HomeWorkspace[];
}

export interface HomeProjectAction {
  action:
    'delete-permanently' | 'move' | 'open-new' | 'open' | 'rename' | 'restore' | 'reveal' | 'trash';
  projectId: string;
}

export interface HomeProjectOpenIntent {
  projectId: string;
  target: 'current' | 'new';
}
