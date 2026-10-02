import type { ModelCatalogItem, ProjectRasterLayerView } from '../../../../../src/shared/api.js'
import type {
  GenerationSettingsComparisonCurrent,
  RasterGenerationData,
} from '../../../../../src/shared/projects/generation-settings-comparison.js'
import type { IgsRasterGenerationProvenanceV1 } from '../../../../../src/shared/projects/project-schema.js'
import {
  createEmptyProjectDocumentV1,
  isRasterGenerationConfigurationV1,
} from '../../../../../src/shared/projects/project-schema.js'

import illustrationPreview from '../../assets/resource-previews/illustration.svg'

const GENERATED_LAYER_ID = '11111111-1111-4111-8111-111111111111'
const IMPORTED_LAYER_ID = '22222222-2222-4222-8222-222222222222'

/** Only inputs are mocked. Rows, semantic projection, layer menu and comparison UI are production. */
export function createGenerationComparisonMock(scenario: string): {
  current: GenerationSettingsComparisonCurrent
  data: RasterGenerationData
  error: string | null
  generatedLayerId: string
  layers: ProjectRasterLayerView[]
} {
  const model: IgsRasterGenerationProvenanceV1['generationConfiguration']['model'] = {
    baseModelFamily: 'illustrious',
    civitaiFileId: 93,
    civitaiModelId: 91,
    civitaiVersionId: 92,
    displayName: 'Illustrious XL',
    fileSha256: 'a'.repeat(64),
    kind: 'checkpoint',
    localModelId: '33333333-3333-4333-8333-333333333333',
    localVersionId: '44444444-4444-4444-8444-444444444444',
    predictionType: 'epsilon',
    versionName: 'v1.1 main',
  }
  const positiveText = `portrait in a midnight greenhouse, soft rim light, a detailed cinematic background, ${'long-unbroken-description'.repeat(
    20,
  )}`
  const config: IgsRasterGenerationProvenanceV1['generationConfiguration'] = {
    mode: 'txt2img',
    model,
    negativePrompt: { embeddingRefs: [], text: '' },
    positivePrompt: { embeddingRefs: [], text: positiveText },
    sampling: {
      actualSeed: 0,
      cfgScale: 7,
      invokeScheduler: 'dpmpp_2m_k',
      requestedSeedPolicy: 'random',
      sampler: 'DPM++ 2M',
      scheduler: 'Karras',
      steps: 30,
    },
    size: { height: 768, width: 1024 },
  }
  if (!isRasterGenerationConfigurationV1(config)) {
    throw new Error('Generation comparison mock no longer matches portable v1 settings.')
  }
  const draft = createEmptyProjectDocumentV1({
    documentId: '55555555-5555-4555-8555-555555555555',
    documentRevision: '66666666-6666-4666-8666-666666666666',
    title: 'Generation comparison UI fixture',
  }).generationDraft
  Object.assign(draft, {
    model: structuredClone(model),
    negativePrompt: { embeddingRefs: [], text: 'blur, noise' },
    positivePrompt: { embeddingRefs: [], text: positiveText },
    sampling: {
      cfgScale: 7,
      denoisingStrength: null,
      sampler: 'DPM++ 2M',
      scheduler: 'Karras',
      steps: 26,
    },
    seed: { policy: 'fixed', value: 0 },
  })
  const catalog: ModelCatalogItem[] = [
    {
      author: null,
      defaultVersionId: model.localVersionId,
      description: null,
      id: model.localModelId,
      modelId: model.civitaiModelId,
      name: model.displayName,
      previewDataUrl: null,
      resourceType: 'checkpoint',
      sourceUrl: null,
      trainedWords: [],
      versions: [
        {
          baseModelFamily: 'illustrious',
          civitaiFileId: model.civitaiFileId,
          civitaiVersionId: model.civitaiVersionId,
          dependencyIssues: [],
          fileName: 'illustrious.safetensors',
          fileSizeBytes: 1024,
          fileStatus: 'ready',
          format: 'SafeTensor',
          id: model.localVersionId,
          installedAt: '2026-10-02T10:00:00.000Z',
          name: model.versionName,
          predictionType: 'v_prediction',
          predictionTypeSource: 'user',
          sha256: model.fileSha256,
          trainedWords: [],
        },
      ],
    },
  ]
  const layer = (id: string, name: string): ProjectRasterLayerView => ({
    blendMode: 'normal',
    height: 768,
    id,
    imageUrl: illustrationPreview,
    locked: false,
    name,
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
    visible: true,
    width: 1024,
  })
  return {
    current: {
      bbox: { height: 768, width: 1024 },
      generationDraft: draft,
      modelCatalog: scenario === 'missing' ? [] : catalog,
      modelCatalogError: null,
      reuseSeed: 0,
    },
    data: {
      currentMode: scenario === 'unavailable' ? null : 'txt2img',
      documentId: '55555555-5555-4555-8555-555555555555',
      generationConfiguration: config,
      layerId: GENERATED_LAYER_ID,
      modeUnavailableReason: scenario === 'unavailable' ? 'Image engine is not installed' : null,
    },
    error: scenario === 'error' ? 'Generation data could not be read. Close and try again.' : null,
    generatedLayerId: GENERATED_LAYER_ID,
    layers: [
      layer(GENERATED_LAYER_ID, 'Generated greenhouse'),
      layer(IMPORTED_LAYER_ID, 'Imported reference'),
    ],
  }
}
