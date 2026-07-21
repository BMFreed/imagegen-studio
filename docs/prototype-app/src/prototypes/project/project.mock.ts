import type { HomeProjectRecord } from '../home/home.types'
import type {
  ProjectDocumentModel,
  ProjectGenerationDraft,
  ProjectScenarioId,
  ProjectSession,
} from './project.types'

import {
  parseLegacyPromptString,
  serializeGenerationPrompt,
} from '../../components/generation/generation-prompt.utils'
import { generationEmbeddings, mockDanbooruTags } from '../../components/generation/generation.mock'
import { currentProjectPresetSource } from '../presets/presets.mock'
import { cloneDocument } from './project-history'

const baseDraft: ProjectGenerationDraft = {
  cfgRescale: 0,
  dynamicPrompt: { maxPrompts: 100, seedBehavior: 'per-iteration' },
  payload: structuredClone(currentProjectPresetSource.definition.payload),
  vaePrecision: 'Auto',
}

export function createProjectScenario(id: ProjectScenarioId): ProjectSession {
  const document = baseDocument()
  const session: ProjectSession = {
    dirty: false,
    document,
    history: { future: [], past: [] },
    queueItems: [],
    savedDocument: cloneDocument(document),
    saveShouldFail: false,
    scenario: id,
    ui: {
      activeTool: 'pan',
      applyPresetOpen: false,
      aspectRatio: { id: 'free', locked: false, value: 888 / 1184 },
      leftCollapsed: false,
      leftWidth: 380,
      queueOpen: false,
      rightCollapsed: false,
      rightWidth: 380,
      selection: { id: 'raster-main', kind: 'compositing-layer' },
      viewport: { offsetX: 0, offsetY: 0, scale: 0.62 },
    },
  }

  if (id === 'smart-patch') {
    session.ui.selection = { id: 'hand-repair', kind: 'compositing-layer' }
  }
  if (id === 'regional-guidance') {
    session.ui.selection = { id: 'face-light', kind: 'regional-guidance' }
  }
  if (id === 'staging') {
    session.staging = stagingSession()
    session.queueItems = [
      queueItem('queue-1', 1, 100, 'completed'),
      queueItem('queue-2', 2, 100, 'completed'),
      queueItem('queue-3', 3, 100, 'completed'),
      queueItem('queue-4', 4, 58, 'running'),
    ]
  }
  if (id === 'empty-project') {
    session.document.canvas = { height: 1024, width: 1024 }
    session.document.layers = []
    session.document.regionalGuidance = []
    session.document.generationDraft.payload.size = { height: 1024, width: 1024 }
    session.ui.selection = undefined
    session.savedDocument = cloneDocument(session.document)
  }
  if (id === 'errors') {
    if (session.document.generationDraft.payload.model) {
      session.document.generationDraft.payload.model.missing = true
    }
    if (session.document.generationDraft.payload.loras?.[0]) {
      session.document.generationDraft.payload.loras[0].resource.missing = true
    }
    session.document.generationDraft.payload.prompt = parseLegacyPromptString(
      'portrait, dramatic light, (broken attention',
      generationEmbeddings,
      mockDanbooruTags,
    )
    const missingRef = session.document.generationDraft.payload.negativePrompt?.embeddingRefs.find(
      (ref) => ref.resource.id === generationEmbeddings[0]!.id,
    )
    if (missingRef) {
      missingRef.resource.missing = true
    }
    const patch = session.document.layers.find((layer) => layer.kind === 'smart-patch')
    if (patch?.kind === 'smart-patch') {
      patch.status = 'outdated'
    }
    session.staging = {
      candidates: [
        {
          error: 'CUDA allocation failed',
          id: 'candidate-failed',
          imageIndex: 1,
          queueItemId: 'queue-failed',
          status: 'failed',
          tone: 'rose',
        },
      ],
      collapsed: false,
      previewVisible: true,
      selectedCandidateIds: [],
      target: { kind: 'project-canvas' },
    }
    session.queueItems = [queueItem('queue-failed', 1, 72, 'failed', 'Portrait generation')]
    session.saveShouldFail = true
    session.dirty = true
  }
  return session
}

export function createProjectSessionFromHomeRecord(project: HomeProjectRecord): ProjectSession {
  const session = createProjectScenario(
    project.id === 'smart-patch-costume' ? 'smart-patch' : 'default',
  )
  session.document.id = project.id
  session.document.title = project.fileName
  session.document.canvas = { height: project.height, width: project.width }
  if (project.generationPayload) {
    session.document.generationDraft.payload = structuredClone(project.generationPayload)
  }
  session.savedDocument = cloneDocument(session.document)
  return session
}

function baseDocument(): ProjectDocumentModel {
  return {
    canvas: { height: 1184, width: 888 },
    generationDraft: structuredClone(baseDraft),
    id: 'sample-project-b',
    layers: [
      {
        blendMode: 'normal',
        id: 'raster-highlight',
        kind: 'raster',
        locked: false,
        mockCoverage: 'partial',
        name: 'Highlight Pass',
        opacity: 78,
        tone: 'blue',
        visible: true,
      },
      {
        activeVariantId: 'patch-v2',
        bbox: { height: 356, width: 420, x: 318, y: 312 },
        generationDraft: {
          ...structuredClone(baseDraft),
          payload: { ...structuredClone(baseDraft.payload), denoisingStrength: 0.72 },
        },
        id: 'hand-repair',
        internalHeight: 640,
        internalWidth: 768,
        kind: 'smart-patch',
        locked: false,
        maskRevision: 2,
        name: 'Hand Repair Patch',
        status: 'ready',
        variants: [
          { id: 'patch-v1', name: 'Variant 1', tone: 'rose' },
          { id: 'patch-v2', name: 'Variant 2', tone: 'emerald' },
          { id: 'patch-v3', name: 'Variant 3', tone: 'violet' },
        ],
        visible: true,
      },
      {
        blendMode: 'normal',
        id: 'raster-main',
        kind: 'raster',
        locked: false,
        mockCoverage: 'opaque',
        name: 'Portrait Base',
        opacity: 100,
        tone: 'emerald',
        visible: true,
      },
      {
        blendMode: 'normal',
        id: 'background',
        kind: 'raster',
        locked: true,
        mockCoverage: 'opaque',
        name: 'Background Plate',
        opacity: 100,
        tone: 'rose',
        visible: true,
      },
    ],
    regionalGuidance: [
      {
        autoNegative: true,
        compatibilityStatus: 'warning',
        enabled: true,
        id: 'face-light',
        locked: false,
        name: 'Face lighting',
        negativePrompt: '',
        positivePrompt: 'even lighting, simple background',
        referenceImages: [{ id: 'face-reference', name: 'Lighting reference', tone: 'violet' }],
        regionRevision: 1,
      },
    ],
    title: 'Sample Project B.igs',
    updatedAt: '2026-07-10T13:42:00.000Z',
  }
}

function queueItem(
  id: string,
  iteration: number,
  progress: number,
  status: 'canceled' | 'completed' | 'failed' | 'pending' | 'running',
  label = `Image ${iteration}`,
) {
  return {
    derivedMode: 'img2img' as const,
    id,
    iteration,
    label,
    negativePrompt: serializeGenerationPrompt(baseDraft.payload.negativePrompt),
    negativePromptEmbeddingRefs: structuredClone(
      baseDraft.payload.negativePrompt?.embeddingRefs ?? [],
    ),
    progress,
    prompt: serializeGenerationPrompt(baseDraft.payload.prompt),
    promptEmbeddingRefs: structuredClone(baseDraft.payload.prompt?.embeddingRefs ?? []),
    status,
  }
}

function stagingSession() {
  return {
    candidates: [
      {
        id: 'candidate-1',
        imageIndex: 1,
        queueItemId: 'queue-1',
        status: 'completed' as const,
        tone: 'emerald' as const,
      },
      {
        id: 'candidate-2',
        imageIndex: 2,
        queueItemId: 'queue-2',
        status: 'completed' as const,
        tone: 'blue' as const,
      },
      {
        id: 'candidate-3',
        imageIndex: 3,
        queueItemId: 'queue-3',
        status: 'completed' as const,
        tone: 'rose' as const,
      },
      {
        id: 'candidate-4',
        imageIndex: 4,
        queueItemId: 'queue-4',
        status: 'running' as const,
        tone: 'violet' as const,
      },
    ],
    collapsed: false,
    focusedCandidateId: 'candidate-3',
    previewVisible: true,
    selectedCandidateIds: ['candidate-1', 'candidate-2'],
    target: { kind: 'project-canvas' as const },
  }
}
