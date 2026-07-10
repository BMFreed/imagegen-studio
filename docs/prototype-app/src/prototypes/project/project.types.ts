import type { GenerationPayload } from '../../components/generation/generation.types';

export type ProjectScenarioId =
  'default' | 'empty-project' | 'errors' | 'regional-guidance' | 'smart-patch' | 'staging';

export type ProjectArtworkTone = 'blue' | 'emerald' | 'rose' | 'violet';
export type DerivedGenerationMode = 'img2img' | 'inpaint' | 'outpaint' | 'txt2img';
export type ProjectTool =
  | 'bbox'
  | 'brush'
  | 'crop-canvas'
  | 'eraser'
  | 'lasso'
  | 'pan'
  | 'polygon-lasso'
  | 'transform-mask'
  | 'transform-region';

export interface ProjectRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface ProjectGenerationDraft {
  cfgRescale: number;
  dynamicPrompting: boolean;
  payload: GenerationPayload;
  vaePrecision: 'Auto' | 'FP16' | 'FP32';
}

export interface ProjectRasterLayer {
  blendMode: 'multiply' | 'normal' | 'overlay' | 'screen';
  id: string;
  kind: 'raster';
  locked: boolean;
  name: string;
  opacity: number;
  tone: ProjectArtworkTone;
  visible: boolean;
}

export interface SmartPatchVariant {
  id: string;
  name: string;
  tone: ProjectArtworkTone;
}

export interface ProjectSmartPatchLayer {
  activeVariantId?: string;
  bbox: ProjectRect;
  generationDraft: ProjectGenerationDraft;
  id: string;
  internalHeight: number;
  internalWidth: number;
  kind: 'smart-patch';
  locked: boolean;
  maskRevision: number;
  name: string;
  status: 'empty' | 'failed' | 'generating' | 'outdated' | 'ready';
  variants: SmartPatchVariant[];
  visible: boolean;
}

export type ProjectCompositingLayer = ProjectRasterLayer | ProjectSmartPatchLayer;

export interface RegionalGuidanceLayerModel {
  autoNegative: boolean;
  compatibilityStatus: 'ok' | 'unsupported' | 'warning';
  enabled: boolean;
  id: string;
  locked: boolean;
  name: string;
  negativePrompt: string;
  positivePrompt: string;
  referenceImages: { id: string; name: string; tone: ProjectArtworkTone }[];
  regionRevision: number;
}

export type ProjectEntitySelection =
  { id: string; kind: 'compositing-layer' } | { id: string; kind: 'regional-guidance' } | undefined;

export interface ProjectDocumentModel {
  canvas: { height: number; width: number };
  generationDraft: ProjectGenerationDraft;
  id: string;
  layers: ProjectCompositingLayer[];
  regionalGuidance: RegionalGuidanceLayerModel[];
  title: string;
  updatedAt: string;
}

export interface GenerationCandidate {
  error?: string;
  id: string;
  imageIndex: number;
  queueItemId: string;
  status: 'canceled' | 'completed' | 'failed' | 'pending' | 'running';
  tone: ProjectArtworkTone;
}

export interface GenerationStagingSession {
  candidates: GenerationCandidate[];
  collapsed: boolean;
  focusedCandidateId?: string;
  previewVisible: boolean;
  selectedCandidateIds: string[];
  target: { kind: 'project-canvas' } | { kind: 'smart-patch'; layerId: string };
}

export interface ProjectQueueItem {
  id: string;
  label: string;
  progress: number;
  status: 'canceled' | 'completed' | 'failed' | 'pending' | 'running';
}

export interface ProjectHistoryEntry {
  document: ProjectDocumentModel;
  label: string;
}
export interface ProjectHistoryState {
  future: ProjectHistoryEntry[];
  past: ProjectHistoryEntry[];
}

export interface ProjectUiState {
  activeTool: ProjectTool;
  applyPresetOpen: boolean;
  leftCollapsed: boolean;
  leftSize: number | string;
  notice?: { text: string; type: 'error' | 'success' };
  queueOpen: boolean;
  rightCollapsed: boolean;
  rightSize: number | string;
  selection: ProjectEntitySelection;
  viewport: { offsetX: number; offsetY: number; scale: number };
}

export interface ProjectSession {
  dirty: boolean;
  document: ProjectDocumentModel;
  history: ProjectHistoryState;
  queueItems: ProjectQueueItem[];
  savedDocument: ProjectDocumentModel;
  saveShouldFail: boolean;
  scenario: ProjectScenarioId;
  staging?: GenerationStagingSession;
  ui: ProjectUiState;
}
