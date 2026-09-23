import type {
  GenerationPayload,
  GenerationPromptEmbeddingRef,
  SeedPolicy,
} from '../../components/generation/generation.types'

export type ProjectScenarioId =
  'default' | 'empty-project' | 'errors' | 'regional-guidance' | 'smart-patch' | 'staging'

export type ProjectArtworkTone = 'blue' | 'emerald' | 'rose' | 'violet'
export type DerivedGenerationMode = 'img2img' | 'inpaint' | 'outpaint' | 'txt2img'
export type ProjectAspectRatioId =
  | '1:1'
  | '1:4'
  | '1:8'
  | '16:9'
  | '2:3'
  | '21:9'
  | '3:2'
  | '3:4'
  | '4:1'
  | '4:3'
  | '4:5'
  | '5:4'
  | '8:1'
  | '9:16'
  | '9:21'
  | 'free'
export type ProjectTool =
  | 'bbox'
  | 'brush'
  | 'crop-canvas'
  | 'eraser'
  | 'lasso'
  | 'pan'
  | 'polygon-lasso'
  | 'transform-mask'
  | 'transform-region'

export interface ProjectRect {
  height: number
  width: number
  x: number
  y: number
}

export interface ProjectGenerationDraft {
  dynamicPrompt: ProjectDynamicPromptSettings
  payload: GenerationPayload
}

export interface ProjectDynamicPromptSettings {
  maxPrompts: number
  seedBehavior: 'per-iteration' | 'per-prompt'
}

export interface ProjectAspectRatioState {
  id: ProjectAspectRatioId
  locked: boolean
  value: number
}

export interface GenerationProvenance {
  dynamicPrompt: ProjectDynamicPromptSettings
  engine: 'Prototype simulation'
  mode: DerivedGenerationMode
  payload: GenerationPayload
  queueItemId: string
  requestedSeedPolicy: SeedPolicy
  resultId?: string
  source?: {
    bbox: ProjectRect
    draft: ProjectGenerationDraft
    internalHeight: number
    internalWidth: number
    maskRevision: number
  }
  unavailableSections?: (keyof GenerationPayload)[]
}

export interface ProjectRasterLayer {
  blendMode: 'multiply' | 'normal' | 'overlay' | 'screen'
  id: string
  kind: 'raster'
  locked: boolean
  /** Prototype-only approximation of real compositor alpha coverage. */
  mockCoverage: 'opaque' | 'partial'
  name: string
  opacity: number
  provenance?: GenerationProvenance
  tone: ProjectArtworkTone
  visible: boolean
}

export interface SmartPatchVariant {
  id: string
  name: string
  provenance?: GenerationProvenance
  tone: ProjectArtworkTone
}

export interface ProjectSmartPatchLayer {
  activeVariantId?: string
  bbox: ProjectRect
  generationDraft: ProjectGenerationDraft
  id: string
  internalHeight: number
  internalWidth: number
  kind: 'smart-patch'
  locked: boolean
  maskRevision: number
  name: string
  status: 'empty' | 'failed' | 'generating' | 'outdated' | 'ready'
  variants: SmartPatchVariant[]
  visible: boolean
}

export type ProjectCompositingLayer = ProjectRasterLayer | ProjectSmartPatchLayer

export interface RegionalGuidanceLayerModel {
  compatibilityStatus: 'ok' | 'unsupported' | 'warning'
  enabled: boolean
  id: string
  locked: boolean
  name: string
  negativePrompt: string
  opacity: number
  positivePrompt: string
  referenceImages: { id: string; name: string; previewUrl?: string; tone: ProjectArtworkTone }[]
  regionRevision: number
  useGlobalNegativePrompt: boolean
}

export type ProjectEntitySelection =
  { id: string; kind: 'compositing-layer' } | { id: string; kind: 'regional-guidance' } | undefined

export interface ProjectDocumentModel {
  canvas: { height: number; width: number }
  generationDraft: ProjectGenerationDraft
  id: string
  layers: ProjectCompositingLayer[]
  regionalGuidance: RegionalGuidanceLayerModel[]
  title: string
  updatedAt: string
}

export interface GenerationCandidate {
  error?: string
  id: string
  imageIndex: number
  queueItemId: string
  status: 'canceled' | 'completed' | 'failed' | 'pending' | 'running'
  tone: ProjectArtworkTone
}

export interface GenerationStagingSession {
  candidates: GenerationCandidate[]
  collapsed: boolean
  focusedCandidateId?: string
  previewVisible: boolean
  selectedCandidateIds: string[]
  target: { kind: 'project-canvas' } | { kind: 'smart-patch'; layerId: string }
}

export interface ProjectQueueItem {
  derivedMode: DerivedGenerationMode
  frozenGeneration?: GenerationProvenance
  id: string
  iteration: number
  label: string
  negativePrompt: string
  negativePromptEmbeddingRefs: GenerationPromptEmbeddingRef[]
  progress: number
  prompt: string
  promptEmbeddingRefs: GenerationPromptEmbeddingRef[]
  status: 'canceled' | 'completed' | 'failed' | 'pending' | 'running'
}

export interface ProjectHistoryEntry {
  document: ProjectDocumentModel
  label: string
}
export interface ProjectHistoryState {
  activeEdit?: ProjectHistoryEditTransaction
  future: ProjectHistoryEntry[]
  past: ProjectHistoryEntry[]
}

export interface ProjectHistoryEditTransaction {
  baseline: ProjectDocumentModel
  key: string
  label: string
}

export interface ProjectUiState {
  activeTool: ProjectTool
  applyPresetOpen: boolean
  aspectRatio: ProjectAspectRatioState
  leftCollapsed: boolean
  leftWidth: number
  notice?: { text: string; type: 'error' | 'success' }
  queueOpen: boolean
  rightCollapsed: boolean
  rightWidth: number
  selection: ProjectEntitySelection
  viewport: { fit?: boolean; offsetX: number; offsetY: number; scale: number }
}

export interface ProjectSession {
  dirty: boolean
  document: ProjectDocumentModel
  history: ProjectHistoryState
  /** Operational cursor, independent of prunable queue rows and document undo. */
  lastActualSeed?: number
  queueItems: ProjectQueueItem[]
  savedDocument: ProjectDocumentModel
  saveShouldFail: boolean
  scenario: ProjectScenarioId
  staging?: GenerationStagingSession
  ui: ProjectUiState
}
