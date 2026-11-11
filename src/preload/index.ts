import {
  ipcChannels,
  isProjectRegionalGuidanceMaskEditRequest,
  PRESET_ERROR_CODES,
} from '../shared/api.js'
import type {
  ApiError,
  ApiResult,
  CivitaiTokenStatus,
  ModelCatalogItem,
  ModelImportPreview,
  ModelInstallJobView,
  PresetApiError,
  PresetApiResult,
  PresetRecord,
  ProjectCandidateExportResult,
  ProjectCloseImpact,
  ProjectImportFinishResult,
  ProjectImportSelection,
  ProjectOpenResult,
  ProjectRasterLayerView,
  ProjectRebuildResult,
  ProjectRegionalGuidanceLayerView,
  ProjectSaveResult,
  ProjectSmartPatchLayerView,
  ProjectSummary,
  ProjectTab,
  ProjectTrashDeleteResult,
  ProjectTrashSummary,
  ProjectWorkspaceSummary,
  RuntimeStatus,
  StudioApi,
} from '../shared/api.js'
import { isPresetRecord } from '../shared/presets/preset-schema.js'
import {
  isSmartPatchPresetApplicationReviewForRequest,
  parseSmartPatchPresetApplicationRequest,
  parseSmartPatchPresetApplicationReviewRequest,
  type SmartPatchPresetApplicationReview,
} from '../shared/presets/smart-patch-preset-application.js'
import { isAcceptedResultHistoryPage } from '../shared/projects/accepted-result-history.js'
import { isGenerationDynamicPromptSettings } from '../shared/projects/generation-dynamic-settings.js'
import { isGenerationProgressSnapshot } from '../shared/projects/generation-progress.js'
import { isGenerationQueuePage } from '../shared/projects/generation-queue-manager.js'
import {
  isRasterGenerationData,
  type RasterGenerationData,
} from '../shared/projects/generation-settings-comparison.js'
import { isHomeProjectTimestamp } from '../shared/projects/home-project-browse.js'
import { isIllustriousNoiseProfileV1 } from '../shared/projects/illustrious-noise-profile.js'
import { isProjectAcceptedResults } from '../shared/projects/project-accepted-results.js'
import {
  isProjectDocumentId,
  isProjectGenerateResult,
  isProjectGenerationActionState,
} from '../shared/projects/project-generation-actions.js'
import { isProjectGenerationResultsSnapshot } from '../shared/projects/project-generation-results.js'
import {
  isProjectGenerationTargetState,
  type ProjectGenerationTargetState,
} from '../shared/projects/project-generation-target-state.js'
import { validateProjectRenameName } from '../shared/projects/project-rename.js'
import {
  IGS_SAFETY_CEILINGS,
  isProjectRegionalGuidanceV1,
  isProjectSmartPatchMaskV1,
} from '../shared/projects/project-schema.js'
import type { IgsProjectDocumentV1, IgsRectV1 } from '../shared/projects/project-schema.js'
import { isProjectWorkspaceId } from '../shared/projects/project-workspaces.js'
import {
  isProjectRegionalGuidanceChange,
  isProjectRegionalGuidanceDocumentOwner,
  isProjectRegionalGuidanceOwner,
  isProjectRegionalGuidancePromptChangeForOwner,
  isProjectRegionalGuidanceReferenceImageChange,
} from '../shared/projects/regional-guidance.js'
import {
  isProjectSmartPatchDiscardResult,
  isProjectSmartPatchGenerateResult,
  isProjectSmartPatchGenerationTargetState,
  isProjectSmartPatchResultsSnapshot,
} from '../shared/projects/smart-patch-public-generation.js'
import { isProjectSmartPatchVariantsInspection } from '../shared/projects/smart-patch-variants.js'
import {
  isSmartResultComparisonDataForRequest,
  isSmartResultComparisonRequest,
  type SmartResultComparisonData,
  type SmartResultComparisonRequest,
} from '../shared/projects/smart-result-comparison.js'
import {
  isSmartResultPresetDataForRequest,
  isSmartResultPresetRequest,
  type SmartResultPresetData,
  type SmartResultPresetRequest,
} from '../shared/projects/smart-result-preset.js'

import { contextBridge, ipcRenderer } from 'electron'

const runtimeKinds = new Set<RuntimeStatus['kind']>([
  'checking',
  'needs-repair',
  'not-installed',
  'ready',
  'unsupported',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRuntimeStatus(value: unknown): value is RuntimeStatus {
  if (!isRecord(value)) {
    return false
  }

  return (
    runtimeKinds.has(value.kind as RuntimeStatus['kind']) &&
    (value.profile === 'linux-nvidia' || value.profile === null) &&
    typeof value.detail === 'string' &&
    (value.runtimeId === undefined || typeof value.runtimeId === 'string')
  )
}

function isApiError(value: unknown): value is ApiError {
  return isRecord(value) && typeof value.code === 'string' && typeof value.message === 'string'
}

function isRuntimeResult(value: unknown): value is ApiResult<RuntimeStatus> {
  if (!isRecord(value)) {
    return false
  }
  if (value.ok === true) {
    return isRuntimeStatus(value.value)
  }
  if (value.ok === false) {
    return isApiError(value.error)
  }
  return false
}

async function invokeRuntime(
  channel:
    | typeof ipcChannels.runtime.getStatus
    | typeof ipcChannels.runtime.install
    | typeof ipcChannels.runtime.repair,
): Promise<ApiResult<RuntimeStatus>> {
  try {
    const result: unknown = await ipcRenderer.invoke(channel)
    if (isRuntimeResult(result)) {
      return result
    }
    return {
      error: {
        code: 'IPC_INVALID_RESPONSE',
        message: 'The application returned an invalid runtime status.',
      },
      ok: false,
    }
  } catch {
    return {
      error: {
        code: 'IPC_UNAVAILABLE',
        message: 'The application could not reach the runtime service.',
      },
      ok: false,
    }
  }
}

function isTokenStatus(value: unknown): value is CivitaiTokenStatus {
  return (
    isRecord(value) &&
    ['connected', 'failed', 'missing', 'unavailable'].includes(String(value.kind)) &&
    typeof value.detail === 'string'
  )
}

function isModelCatalog(value: unknown): value is ModelCatalogItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        Array.isArray(item.versions) &&
        item.versions.every(
          (version: unknown) =>
            isRecord(version) &&
            typeof version.id === 'string' &&
            typeof version.name === 'string' &&
            typeof version.fileName === 'string' &&
            (version.noiseProfile === undefined ||
              (isRecord(version.noiseProfile) &&
                isIllustriousNoiseProfileV1(version.noiseProfile.effective) &&
                (version.noiseProfile.rescaleBetasZeroSnrSource === 'assumed' ||
                  version.noiseProfile.rescaleBetasZeroSnrSource === 'override') &&
                (version.noiseProfile.timestepSpacingSource === 'assumed' ||
                  version.noiseProfile.timestepSpacingSource === 'override'))),
        ),
    )
  )
}

function isModelImportPreview(value: unknown): value is ModelImportPreview {
  if (!isRecord(value) || typeof value.modelId !== 'number') {
    return false
  }
  if (value.kind === 'select-version') {
    return Array.isArray(value.versions)
  }
  return (
    value.kind === 'select-file' &&
    typeof value.previewId === 'string' &&
    typeof value.versionId === 'number' &&
    Array.isArray(value.files) &&
    Array.isArray(value.dependencies)
  )
}

function isModelInstallJob(value: unknown): value is ModelInstallJobView {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.modelName === 'string' &&
    typeof value.versionName === 'string' &&
    typeof value.bytesDownloaded === 'number' &&
    ['canceled', 'completed', 'downloading', 'failed', 'verifying', 'waiting'].includes(
      String(value.status),
    )
  )
}

async function invokeModel<T>(
  channel: string,
  args: unknown[],
  isValue: (value: unknown) => value is T,
): Promise<ApiResult<T>> {
  try {
    const result: unknown = await ipcRenderer.invoke(channel, ...args)
    if (isRecord(result) && result.ok === true && isValue(result.value)) {
      return { ok: true, value: result.value }
    }
    if (isRecord(result) && result.ok === false && isApiError(result.error)) {
      return { error: result.error, ok: false }
    }
    return {
      error: {
        code: 'IPC_INVALID_RESPONSE',
        message: 'The model service returned an invalid response.',
      },
      ok: false,
    }
  } catch {
    return {
      error: {
        code: 'IPC_UNAVAILABLE',
        message: 'The application could not reach the model service.',
      },
      ok: false,
    }
  }
}

function isVoid(value: unknown): value is void {
  return value === undefined
}

const presetErrorCodes = new Set<string>(PRESET_ERROR_CODES)

type RegionalGuidanceChannel =
  | typeof ipcChannels.projects.addRegionalGuidance
  | typeof ipcChannels.projects.deleteRegionalGuidance
  | typeof ipcChannels.projects.duplicateRegionalGuidance
  | typeof ipcChannels.projects.updateRegionalGuidance
  | typeof ipcChannels.projects.updateRegionalGuidancePrompt

function isPresetApiError(value: unknown): value is PresetApiError {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    typeof value.code === 'string' &&
    presetErrorCodes.has(value.code) &&
    typeof value.message === 'string' &&
    value.message.trim().length > 0 &&
    new TextEncoder().encode(value.message).byteLength <= IGS_SAFETY_CEILINGS.titleBytes
  )
}

async function invokePreset<T>(
  channel: (typeof ipcChannels.presets)[keyof typeof ipcChannels.presets],
  args: unknown[],
  isValue: (value: unknown) => value is T,
): Promise<PresetApiResult<T>> {
  try {
    const result: unknown = await ipcRenderer.invoke(channel, ...args)
    if (isRecord(result) && Object.keys(result).length === 2) {
      if (result.ok === true && isValue(result.value)) {
        return { ok: true, value: result.value }
      }
      if (result.ok === false && isPresetApiError(result.error)) {
        return { error: { code: result.error.code, message: result.error.message }, ok: false }
      }
    }
    return {
      error: {
        code: 'IPC_INVALID_RESPONSE',
        message: 'The preset service returned an invalid response.',
      },
      ok: false,
    }
  } catch {
    return {
      error: {
        code: 'IPC_UNAVAILABLE',
        message: 'The application could not reach the preset service.',
      },
      ok: false,
    }
  }
}

function isProjectCloseImpact(value: unknown): value is ProjectCloseImpact {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.unfinishedJobCount) &&
    (value.unfinishedJobCount as number) >= 0 &&
    Number.isSafeInteger(value.completedCandidateCount) &&
    (value.completedCandidateCount as number) >= 0 &&
    typeof value.generationStorageUnavailable === 'boolean'
  )
}

function isProjectCandidateExportResult(value: unknown): value is ProjectCandidateExportResult {
  if (!isRecord(value)) {
    return false
  }
  if (value.kind === 'canceled') {
    return Object.keys(value).length === 1
  }
  return (
    value.kind === 'saved' &&
    Object.keys(value).length === 2 &&
    typeof value.fileName === 'string' &&
    value.fileName.length > 4 &&
    value.fileName.toLowerCase().endsWith('.png') &&
    !value.fileName.includes('/') &&
    !value.fileName.includes('\\')
  )
}

function isProjectId(value: unknown): value is string {
  return typeof value === 'string' && /^project-v1-[a-f0-9]{64}$/.test(value)
}

function isProjectDimension(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= IGS_SAFETY_CEILINGS.rasterDimension
  )
}

function isProjectDimensions(value: unknown): value is Pick<IgsRectV1, 'height' | 'width'> {
  return isRecord(value) && isProjectDimension(value.width) && isProjectDimension(value.height)
}

function isProjectRect(value: unknown): value is IgsRectV1 {
  if (!isRecord(value)) {
    return false
  }
  const { height, width, x, y } = value
  return (
    typeof x === 'number' &&
    Number.isSafeInteger(x) &&
    Math.abs(x) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    typeof y === 'number' &&
    Number.isSafeInteger(y) &&
    Math.abs(y) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    isProjectDimension(width) &&
    isProjectDimension(height)
  )
}

/** Runtime capabilities are validated separately from the strict portable owner. */
function isRegionalGuidanceLayerView(
  value: unknown,
  tab: Record<string, unknown>,
): value is ProjectRegionalGuidanceLayerView {
  if (!isRecord(value)) {
    return false
  }
  const { maskImageUrl, referenceImages, ...base } = value
  if (
    referenceImages !== undefined &&
    (!Array.isArray(referenceImages) || referenceImages.some((item) => !isRecord(item)))
  ) {
    return false
  }
  const runtimeReferences = Array.isArray(referenceImages) ? referenceImages : []
  const storedReferences = Array.isArray(referenceImages)
    ? runtimeReferences.map((item: Record<string, unknown>) => {
        const { thumbnailUrl: _thumbnailUrl, ...stored } = item
        return stored
      })
    : undefined
  const stored = {
    ...base,
    ...(storedReferences === undefined ? {} : { referenceImages: storedReferences }),
  }
  if (!isProjectRegionalGuidanceV1(stored)) {
    return false
  }
  if (
    stored.referenceImages?.some((reference, index) => {
      const url = runtimeReferences[index].thumbnailUrl
      const prefix = `igs-layer://regional-reference/${tab.id}/${tab.documentRevision}/${stored.id}/${reference.id}/${reference.thumbnail.sha256}/`
      return (
        typeof url !== 'string' ||
        !url.startsWith(prefix) ||
        !/^[a-f0-9]{64}\.webp$/.test(url.slice(prefix.length))
      )
    })
  ) {
    return false
  }
  if (stored.mask.asset === null) {
    return maskImageUrl === undefined || maskImageUrl === null
  }
  if (typeof maskImageUrl !== 'string') {
    return false
  }
  const prefix = `igs-mask://regional/${tab.id}/${tab.documentRevision}/${stored.id}/${stored.mask.id}/${stored.mask.revision}/${stored.mask.asset.sha256}/`
  return (
    maskImageUrl.startsWith(prefix) && /^[a-f0-9]{64}\.png$/.test(maskImageUrl.slice(prefix.length))
  )
}

/** Regional owners share the document's selectable/owned identity namespace. */
function hasValidRegionalGuidanceOwners(value: Record<string, unknown>): boolean {
  if (value.regionalGuidance === undefined) {
    return true
  }
  if (
    !Array.isArray(value.regionalGuidance) ||
    value.regionalGuidance.length > IGS_SAFETY_CEILINGS.archiveEntries ||
    !value.regionalGuidance.every((region): region is ProjectRegionalGuidanceLayerView =>
      isRegionalGuidanceLayerView(region, value),
    ) ||
    !Array.isArray(value.layers)
  ) {
    return false
  }
  const ids: string[] = []
  for (const layer of value.layers) {
    if (!isRecord(layer) || typeof layer.id !== 'string') {
      return false
    }
    ids.push(layer.id)
    if (isProjectSmartPatchLayerView(layer)) {
      ids.push(layer.mask.id, ...layer.rasterSubLayers.map((variant) => variant.id))
    }
  }
  for (const region of value.regionalGuidance) {
    ids.push(region.id, region.mask.id, ...(region.referenceImages ?? []).map((item) => item.id))
  }
  return ids.length === new Set(ids).size
}

function isProjectTab(value: unknown): value is ProjectTab {
  return (
    isRecord(value) &&
    isProjectId(value.id) &&
    isProjectDocumentId(value.documentId) &&
    isProjectDocumentId(value.documentRevision) &&
    typeof value.title === 'string' &&
    (value.workspaceId === undefined || isProjectWorkspaceId(value.workspaceId)) &&
    (value.relocationPending === undefined || typeof value.relocationPending === 'boolean') &&
    typeof value.canUndo === 'boolean' &&
    typeof value.canRedo === 'boolean' &&
    isGenerationDraft(value.generationDraft) &&
    isUInt32OrNull(value.lastActualSeedSnapshot) &&
    isProjectRect(value.primaryBbox) &&
    Array.isArray(value.layers) &&
    value.layers.every(
      (layer) => isProjectRasterLayerView(layer) || isProjectSmartPatchLayerView(layer),
    ) &&
    hasValidRegionalGuidanceOwners(value) &&
    isProjectAcceptedResults(value.acceptedResults, {
      documentRevision: value.documentRevision,
      id: value.id,
      layers: value.layers,
    }) &&
    typeof value.dirty === 'boolean' &&
    (value.autosaveError === null || typeof value.autosaveError === 'string') &&
    (value.storageWarning === undefined || typeof value.storageWarning === 'string')
  )
}

function isUInt32OrNull(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xff_ff_ff_ff)
  )
}

function isGenerationDraft(value: unknown): value is IgsProjectDocumentV1['generationDraft'] {
  if (!isRecord(value) || !isRecord(value.seed) || !isRecord(value.sampling)) {
    return false
  }
  const seed = value.seed
  const sampling = value.sampling
  return (
    (value.dynamicPrompt === undefined || isGenerationDynamicPromptSettings(value.dynamicPrompt)) &&
    isPrompt(value.positivePrompt) &&
    isPrompt(value.negativePrompt) &&
    Array.isArray(value.loras) &&
    value.loras.every(
      (lora: unknown) =>
        isRecord(lora) &&
        typeof lora.enabled === 'boolean' &&
        typeof lora.weight === 'number' &&
        Number.isFinite(lora.weight) &&
        isExactResourceRef(lora.resource, 'lora'),
    ) &&
    (value.model === null || isExactResourceRef(value.model, 'checkpoint')) &&
    (value.vae === null || isExactResourceRef(value.vae, 'vae')) &&
    (seed.policy === 'fixed' || seed.policy === 'random' || seed.policy === 'reuse') &&
    isUInt32OrNull(seed.value) &&
    isNullableNumber(sampling.cfgScale) &&
    isNullableNumber(sampling.denoisingStrength) &&
    isNullablePositiveInteger(sampling.steps) &&
    isNullableString(sampling.sampler) &&
    isNullableString(sampling.scheduler) &&
    (value.cfgRescale === undefined ||
      (typeof value.cfgRescale === 'number' &&
        Number.isFinite(value.cfgRescale) &&
        value.cfgRescale >= 0 &&
        value.cfgRescale <= 1)) &&
    (value.clipSkip === undefined ||
      (typeof value.clipSkip === 'number' && Number.isSafeInteger(value.clipSkip))) &&
    (value.vaePrecision === undefined ||
      ['Auto', 'FP16', 'FP32'].includes(String(value.vaePrecision)))
  )
}

function isPrompt(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.text === 'string' &&
    Array.isArray(value.embeddingRefs) &&
    value.embeddingRefs.every(
      (ref: unknown) =>
        isRecord(ref) &&
        typeof ref.token === 'string' &&
        isExactResourceRef(ref.resource, 'embedding'),
    )
  )
}

function isExactResourceRef(value: unknown, kind: string): boolean {
  return (
    isRecord(value) &&
    value.kind === kind &&
    typeof value.displayName === 'string' &&
    typeof value.fileSha256 === 'string' &&
    typeof value.localModelId === 'string' &&
    typeof value.localVersionId === 'string' &&
    typeof value.versionName === 'string' &&
    (value.baseModelFamily === null ||
      value.baseModelFamily === 'anima' ||
      value.baseModelFamily === 'illustrious') &&
    (value.predictionType === null ||
      value.predictionType === 'epsilon' ||
      value.predictionType === 'sample' ||
      value.predictionType === 'v_prediction') &&
    [value.civitaiFileId, value.civitaiModelId, value.civitaiVersionId].every(
      (id) => id === null || (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0),
    )
  )
}

function isNullableNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isNullablePositiveInteger(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
}

function isNullableString(value: unknown): boolean {
  return value === null || (typeof value === 'string' && value.length > 0)
}

function isProjectRasterLayerView(value: unknown): value is ProjectRasterLayerView {
  if (
    !isRecord(value) ||
    !isRecord(value.transform) ||
    (value.kind !== undefined && value.kind !== 'raster')
  ) {
    return false
  }
  const transform = value.transform
  return (
    typeof value.id === 'string' &&
    /^[a-f0-9-]{36}$/i.test(value.id) &&
    typeof value.name === 'string' &&
    (value.generationSettingsUnavailableReason === undefined ||
      (typeof value.generationSettingsUnavailableReason === 'string' &&
        value.generationSettingsUnavailableReason.trim().length > 0 &&
        value.generationSettingsUnavailableReason.length <= 512)) &&
    (value.resultComparisonSourceKind === undefined ||
      value.resultComparisonSourceKind === 'raster' ||
      value.resultComparisonSourceKind === 'smart-patch') &&
    (value.resultPresetSourceKind === undefined ||
      value.resultPresetSourceKind === 'raster' ||
      value.resultPresetSourceKind === 'smart-patch') &&
    typeof value.imageUrl === 'string' &&
    value.imageUrl.startsWith('igs-layer://asset/') &&
    typeof value.visible === 'boolean' &&
    typeof value.locked === 'boolean' &&
    typeof value.opacity === 'number' &&
    Number.isFinite(value.opacity) &&
    value.opacity >= 0 &&
    value.opacity <= 1 &&
    ['multiply', 'normal', 'overlay', 'screen'].includes(String(value.blendMode)) &&
    isProjectDimension(value.width) &&
    isProjectDimension(value.height) &&
    ['x', 'y', 'scaleX', 'scaleY', 'rotationDegrees'].every(
      (key) => typeof transform[key] === 'number' && Number.isFinite(transform[key]),
    )
  )
}

function isProjectSmartPatchLayerView(value: unknown): value is ProjectSmartPatchLayerView {
  if (!isRecord(value) || !isRecord(value.mask) || value.kind !== 'smart-patch') {
    return false
  }
  const maskId = value.mask.id
  return (
    isProjectDocumentId(value.id) &&
    typeof value.name === 'string' &&
    typeof value.visible === 'boolean' &&
    typeof value.locked === 'boolean' &&
    typeof value.opacity === 'number' &&
    Number.isFinite(value.opacity) &&
    value.opacity >= 0 &&
    value.opacity <= 1 &&
    ['multiply', 'normal', 'overlay', 'screen'].includes(String(value.blendMode)) &&
    isProjectRect(value.boundingBox) &&
    isProjectDimensions(value.internalResolution) &&
    isGenerationDraft(value.generationDraft) &&
    isProjectSmartPatchMaskV1(value.mask) &&
    (value.mask.asset === null
      ? value.maskImageUrl === null
      : typeof value.maskImageUrl === 'string' &&
        value.maskImageUrl.startsWith('igs-mask://asset/')) &&
    Array.isArray(value.rasterSubLayers) &&
    value.rasterSubLayers.length <= IGS_SAFETY_CEILINGS.archiveEntries &&
    value.rasterSubLayers.every(
      (variant: unknown) =>
        isRecord(variant) &&
        Object.keys(variant).length === 2 &&
        isProjectDocumentId(variant.id) &&
        variant.id !== value.id &&
        variant.id !== maskId &&
        typeof variant.name === 'string' &&
        variant.name.trim().length > 0,
    ) &&
    new Set(value.rasterSubLayers.map((variant) => variant.id)).size ===
      value.rasterSubLayers.length &&
    (value.rasterSubLayers.length === 0
      ? value.activeRasterSubLayerId === null &&
        value.activeRaster === null &&
        value.status === 'empty'
      : isProjectDocumentId(value.activeRasterSubLayerId) &&
        value.rasterSubLayers.some((variant) => variant.id === value.activeRasterSubLayerId) &&
        (value.status === 'outdated' || value.status === 'unverified') &&
        isProjectRasterLayerView(value.activeRaster) &&
        value.activeRaster.id === value.id &&
        value.activeRaster.name === value.name &&
        value.activeRaster.blendMode === value.blendMode &&
        value.activeRaster.locked === value.locked &&
        value.activeRaster.opacity === value.opacity &&
        value.activeRaster.visible === value.visible &&
        value.activeRaster.transform.rotationDegrees === 0 &&
        value.activeRaster.transform.scaleX === 1 &&
        value.activeRaster.transform.scaleY === 1)
  )
}

function isProjectImportSelection(value: unknown): value is ProjectImportSelection | null {
  if (value === null) {
    return true
  }
  return (
    isRecord(value) &&
    ((value.kind === 'opened' && isProjectOpenResult(value.result)) ||
      (value.kind === 'transfer-required' &&
        typeof value.importId === 'string' &&
        /^[a-f0-9-]{36}$/i.test(value.importId) &&
        typeof value.fileName === 'string' &&
        typeof value.title === 'string'))
  )
}

function isProjectImportFinishResult(value: unknown): value is ProjectImportFinishResult {
  return (
    isRecord(value) &&
    isProjectOpenResult(value.result) &&
    typeof value.sourceRetained === 'boolean' &&
    (value.warning === undefined || typeof value.warning === 'string')
  )
}

function isProjectSummary(value: unknown): value is ProjectSummary {
  return (
    isRecord(value) &&
    !(value.pendingRename !== undefined && value.pendingMove !== undefined) &&
    (value.pendingRename === undefined ||
      (isRecord(value.pendingRename) &&
        typeof value.pendingRename.name === 'string' &&
        value.pendingRename.name === value.pendingRename.name.trim() &&
        validateProjectRenameName(value.pendingRename.name) === null &&
        typeof value.pendingRename.message === 'string')) &&
    (value.pendingMove === undefined ||
      (isRecord(value.pendingMove) &&
        isProjectWorkspaceId(value.pendingMove.workspaceId) &&
        typeof value.pendingMove.message === 'string')) &&
    (value.lastOpenedAt === undefined || isHomeProjectTimestamp(value.lastOpenedAt)) &&
    (value.modifiedAt === undefined || isHomeProjectTimestamp(value.modifiedAt)) &&
    isProjectId(value.id) &&
    isProjectWorkspaceId(value.workspaceId) &&
    typeof value.title === 'string' &&
    ['corrupt', 'missing', 'ready', 'unsupported_schema'].includes(String(value.health)) &&
    (value.previewStatus === null ||
      ['empty', 'rendered', 'unavailable'].includes(String(value.previewStatus))) &&
    (value.thumbnailUrl === null || isProjectThumbnailUrl(value.thumbnailUrl)) &&
    (value.bbox === null || isProjectDimensions(value.bbox)) &&
    ['invalid', 'none', 'recoverable', 'stale', 'unavailable'].includes(
      String(value.recoveryStatus),
    ) &&
    (value.recoveryReason === undefined || typeof value.recoveryReason === 'string')
  )
}

function isProjectWorkspaceSummary(value: unknown): value is ProjectWorkspaceSummary {
  return (
    isRecord(value) &&
    isProjectWorkspaceId(value.id) &&
    typeof value.displayName === 'string' &&
    typeof value.directoryPath === 'string' &&
    typeof value.color === 'string' &&
    typeof value.isDefault === 'boolean' &&
    ['available', 'inaccessible', 'missing'].includes(String(value.availability)) &&
    typeof value.writable === 'boolean' &&
    (value.availability === 'available' || value.writable === false) &&
    Number.isSafeInteger(value.projectCount) &&
    (value.projectCount as number) >= 0
  )
}

function isProjectTrashSummary(value: unknown): value is ProjectTrashSummary {
  return (
    isProjectSummary(value) &&
    isRecord(value) &&
    isProjectDocumentId(value.trashId) &&
    typeof value.trashedAt === 'string' &&
    Number.isFinite(Date.parse(value.trashedAt)) &&
    typeof value.fileName === 'string' &&
    typeof value.originalWorkspaceDirectoryPath === 'string' &&
    typeof value.originalWorkspaceName === 'string' &&
    (value.deletionStatus === 'trashed' || value.deletionStatus === 'deleting') &&
    (value.deletionError === null || typeof value.deletionError === 'string')
  )
}

function isProjectTrashDeleteResult(value: unknown): value is ProjectTrashDeleteResult {
  return (
    isRecord(value) &&
    (value.kind === 'deleted' || (value.kind === 'pending' && typeof value.message === 'string'))
  )
}

function isProjectThumbnailUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('igs-preview://thumbnail/')) {
    return false
  }
  try {
    const url = new URL(value)
    return (
      url.protocol === 'igs-preview:' &&
      url.hostname === 'thumbnail' &&
      /^\/project-v1-[a-f0-9]{64}\/[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/.test(url.pathname) &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      url.hash === '' &&
      url.search === ''
    )
  } catch {
    return false
  }
}

function isProjectOpenResult(value: unknown): value is ProjectOpenResult {
  if (!isRecord(value)) {
    return false
  }
  if (value.kind === 'opened') {
    return isProjectTab(value.tab)
  }
  return (
    value.kind === 'recovery-required' &&
    isProjectId(value.projectId) &&
    typeof value.reason === 'string' &&
    ['invalid', 'recoverable', 'stale'].includes(String(value.recoveryStatus))
  )
}

function isProjectSaveResult(value: unknown): value is ProjectSaveResult {
  return (
    isRecord(value) &&
    isProjectTab(value.tab) &&
    value.committed === true &&
    typeof value.directorySynced === 'boolean' &&
    typeof value.reloadRequired === 'boolean' &&
    ['clean', 'dirty', 'failed'].includes(String(value.recoveryStatus)) &&
    (value.recoveryError === undefined || typeof value.recoveryError === 'string') &&
    (value.indexWarning === undefined || typeof value.indexWarning === 'string')
  )
}

function isProjectRebuildResult(value: unknown): value is ProjectRebuildResult {
  return (
    isRecord(value) &&
    value.committed === true &&
    typeof value.directorySynced === 'boolean' &&
    (value.indexWarning === undefined || typeof value.indexWarning === 'string')
  )
}

async function invokeProject<T>(
  channel: string,
  args: unknown[],
  isValue: (value: unknown) => value is T,
): Promise<ApiResult<T>> {
  try {
    const result: unknown = await ipcRenderer.invoke(channel, ...args)
    if (isRecord(result) && result.ok === true && isValue(result.value)) {
      return { ok: true, value: result.value }
    }
    if (isRecord(result) && result.ok === false && isApiError(result.error)) {
      return { error: result.error, ok: false }
    }
    return {
      error: {
        code: 'IPC_INVALID_RESPONSE',
        message: 'The Project service returned an invalid response.',
      },
      ok: false,
    }
  } catch {
    return {
      error: {
        code: 'IPC_UNAVAILABLE',
        message: 'The application could not reach the Project service.',
      },
      ok: false,
    }
  }
}

/** Import authorization remains in Main; only detached owner/change scalars cross IPC. */
function invokeRegionalReferenceImage(
  importing: boolean,
  tabId: string,
  owner: unknown,
  change?: unknown,
): Promise<ApiResult<ProjectTab | null>> {
  let capturedOwner: unknown
  let capturedChange: unknown
  try {
    capturedOwner = structuredClone(owner)
    capturedChange = change === undefined ? undefined : structuredClone(change)
  } catch {
    capturedOwner = null
  }
  if (
    !isProjectId(tabId) ||
    !isProjectRegionalGuidanceOwner(capturedOwner) ||
    (importing
      ? capturedChange !== undefined
      : !isProjectRegionalGuidanceReferenceImageChange(capturedChange))
  ) {
    return Promise.resolve({
      error: {
        code: 'IPC_INVALID_CALLER',
        message: 'The Regional Guidance reference-image request was rejected.',
      },
      ok: false,
    })
  }
  const captured = capturedOwner
  return invokeProject(
    importing
      ? ipcChannels.projects.importRegionalGuidanceReferenceImage
      : ipcChannels.projects.updateRegionalGuidanceReferenceImage,
    importing ? [tabId, captured] : [tabId, captured, capturedChange],
    (value): value is ProjectTab | null => {
      if (value === null) {
        return importing
      }
      if (!isProjectTab(value) || value.id !== tabId || value.documentId !== captured.documentId) {
        return false
      }
      const region = value.regionalGuidance?.find((item) => item.id === captured.regionId)
      if (!region) {
        return false
      }
      if (isProjectRegionalGuidanceReferenceImageChange(capturedChange)) {
        return capturedChange.kind === 'remove'
          ? !(region.referenceImages ?? []).some((item) => item.id === capturedChange.referenceId)
          : region.referenceImages?.[capturedChange.targetIndex]?.id === capturedChange.referenceId
      }
      return true
    },
  )
}

/** Snapshot reviewed scalars before IPC; invalid/private fields never reach Main. */
function invokeRegionalGuidance(
  channel: RegionalGuidanceChannel,
  tabId: string,
  owner: unknown,
  change?: unknown,
): Promise<ApiResult<ProjectTab>> {
  const invalid = (): Promise<ApiResult<ProjectTab>> =>
    Promise.resolve({
      error: { code: 'IPC_INVALID_CALLER', message: 'The Regional Guidance request was rejected.' },
      ok: false,
    })
  let capturedOwner: unknown
  let capturedChange: unknown
  try {
    capturedOwner = structuredClone(owner)
    capturedChange = change === undefined ? undefined : structuredClone(change)
  } catch {
    return invalid()
  }
  if (
    !isProjectId(tabId) ||
    (!isProjectRegionalGuidanceDocumentOwner(capturedOwner) &&
      !isProjectRegionalGuidanceOwner(capturedOwner))
  ) {
    return invalid()
  }
  if (channel === ipcChannels.projects.addRegionalGuidance) {
    if (!isProjectRegionalGuidanceDocumentOwner(capturedOwner) || capturedChange !== undefined) {
      return invalid()
    }
  } else if (!isProjectRegionalGuidanceOwner(capturedOwner)) {
    return invalid()
  }
  if (channel === ipcChannels.projects.updateRegionalGuidance) {
    if (!isProjectRegionalGuidanceChange(capturedChange)) {
      return invalid()
    }
  } else if (channel === ipcChannels.projects.updateRegionalGuidancePrompt) {
    if (
      !isProjectRegionalGuidanceOwner(capturedOwner) ||
      !isProjectRegionalGuidancePromptChangeForOwner(capturedChange, capturedOwner)
    ) {
      return invalid()
    }
  } else if (capturedChange !== undefined) {
    return invalid()
  }
  const documentId = capturedOwner.documentId
  return invokeProject(
    channel,
    capturedChange === undefined ? [tabId, capturedOwner] : [tabId, capturedOwner, capturedChange],
    (value): value is ProjectTab =>
      isProjectTab(value) &&
      value.id === tabId &&
      value.documentId === documentId &&
      (channel !== ipcChannels.projects.updateRegionalGuidancePrompt ||
        (isProjectRegionalGuidanceOwner(capturedOwner) &&
          isProjectRegionalGuidancePromptChangeForOwner(capturedChange, capturedOwner) &&
          regionalPromptReplyMatches(value, capturedOwner.regionId, capturedChange))),
  )
}

/** Capture the complete gesture before awaiting Main; never resolve the current selection here. */
function invokeRegionalMaskEdit(
  tabId: string,
  regionId: string,
  request: unknown,
): Promise<ApiResult<ProjectTab>> {
  let captured: unknown
  try {
    captured = structuredClone(request)
  } catch {
    captured = null
  }
  if (
    !isProjectId(tabId) ||
    !isProjectDocumentId(regionId) ||
    !isProjectRegionalGuidanceMaskEditRequest(captured)
  ) {
    return Promise.resolve({
      error: {
        code: 'IPC_INVALID_CALLER',
        message: 'The Regional Guidance mask request was rejected.',
      },
      ok: false,
    })
  }
  const baseline = captured
  return invokeProject(
    ipcChannels.projects.editRegionalGuidanceMask,
    [tabId, regionId, baseline],
    (value): value is ProjectTab => {
      if (!isProjectTab(value) || value.id !== tabId || value.documentId !== baseline.documentId) {
        return false
      }
      const mask = value.regionalGuidance?.find((region) => region.id === regionId)?.mask
      return (
        mask?.id === baseline.maskId &&
        (value.documentRevision === baseline.documentRevision
          ? mask.revision === baseline.maskRevision
          : mask.revision === baseline.maskRevision + 1)
      )
    },
  )
}

function regionalPromptReplyMatches(
  tab: ProjectTab,
  regionId: string,
  change: Parameters<StudioApi['projects']['updateRegionalGuidancePrompt']>[2],
): boolean {
  const region = tab.regionalGuidance?.find((entry) => entry.id === regionId)
  if (!region) {
    return false
  }
  switch (change.kind) {
    case 'block': {
      return Boolean(region.prompts?.[change.polarity]) === change.present
    }
    case 'negative-source': {
      return (
        Boolean(region.prompts?.negative) &&
        region.prompts?.useGlobalNegativePrompt === change.useGlobalNegativePrompt
      )
    }
    case 'text': {
      return region.prompts?.[change.polarity]?.text === change.text
    }
  }
}

const api: StudioApi = {
  models: {
    cancelInstall: (jobId) =>
      invokeModel(ipcChannels.models.cancelInstall, [jobId], isModelInstallJob),
    checkUpdates: (modelId) =>
      invokeModel(
        ipcChannels.models.checkUpdates,
        [modelId],
        (value): value is { availableVersions: { id: number; name: string }[] } =>
          isRecord(value) && Array.isArray(value.availableVersions),
      ),
    getCatalog: () => invokeModel(ipcChannels.models.getCatalog, [], isModelCatalog),
    getInstallJobs: () =>
      invokeModel(
        ipcChannels.models.getInstallJobs,
        [],
        (value): value is ModelInstallJobView[] =>
          Array.isArray(value) && value.every(isModelInstallJob),
      ),
    getStorageSummary: () =>
      invokeModel(
        ipcChannels.models.getStorageSummary,
        [],
        (value): value is { totalBytes: number } =>
          isRecord(value) &&
          typeof value.totalBytes === 'number' &&
          Number.isFinite(value.totalBytes) &&
          value.totalBytes >= 0,
      ),
    getTokenStatus: () => invokeModel(ipcChannels.models.getTokenStatus, [], isTokenStatus),
    onInstallChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, job: unknown): void => {
        if (isModelInstallJob(job)) {
          listener(job)
        }
      }
      ipcRenderer.on(ipcChannels.models.installChanged, handler)
      return () => ipcRenderer.removeListener(ipcChannels.models.installChanged, handler)
    },
    openModelFolder: () => invokeModel(ipcChannels.models.openModelFolder, [], isVoid),
    openSourceLink: (url) => invokeModel(ipcChannels.models.openSourceLink, [url], isVoid),
    previewImport: (url) =>
      invokeModel(ipcChannels.models.previewImport, [url], isModelImportPreview),
    removeToken: () => invokeModel(ipcChannels.models.removeToken, [], isTokenStatus),
    saveToken: (token) => invokeModel(ipcChannels.models.saveToken, [token], isTokenStatus),
    setDefaultVersion: (resourceId, versionId) =>
      invokeModel(ipcChannels.models.setDefaultVersion, [resourceId, versionId], isVoid),
    setNoiseProfile: (resourceId, versionId, change) =>
      invokeModel(ipcChannels.models.setNoiseProfile, [resourceId, versionId, change], isVoid),
    setPredictionType: (resourceId, versionId, predictionType) =>
      invokeModel(
        ipcChannels.models.setPredictionType,
        [resourceId, versionId, predictionType],
        isVoid,
      ),
    startInstall: (previewId, fileId, acceptedAnimaLicense) =>
      invokeModel(
        ipcChannels.models.startInstall,
        [previewId, fileId, acceptedAnimaLicense],
        isModelInstallJob,
      ),
  },
  presets: {
    create: (definition) =>
      invokePreset(
        ipcChannels.presets.create,
        [definition],
        (value): value is PresetRecord => isPresetRecord(value) && value.deletedAt === null,
      ),
    duplicate: (id, name) =>
      invokePreset(
        ipcChannels.presets.duplicate,
        [id, name],
        (value): value is PresetRecord =>
          isPresetRecord(value) && value.id !== id && value.deletedAt === null,
      ),
    get: (id, options) => {
      const includeDeleted = options?.includeDeleted === true
      return invokePreset(
        ipcChannels.presets.get,
        [id, options ?? {}],
        (value): value is PresetRecord | null =>
          value === null ||
          (isPresetRecord(value) &&
            value.id === id &&
            (includeDeleted || value.deletedAt === null)),
      )
    },
    list: (options) => {
      const deleted = options?.deleted === true
      return invokePreset(
        ipcChannels.presets.list,
        [options ?? {}],
        (value): value is PresetRecord[] =>
          Array.isArray(value) &&
          value.every(
            (record: unknown) =>
              isPresetRecord(record) &&
              (deleted ? record.deletedAt !== null : record.deletedAt === null),
          ),
      )
    },
    restore: (id) =>
      invokePreset(
        ipcChannels.presets.restore,
        [id],
        (value): value is PresetRecord =>
          isPresetRecord(value) && value.id === id && value.deletedAt === null,
      ),
    softDelete: (id) =>
      invokePreset(
        ipcChannels.presets.softDelete,
        [id],
        (value): value is PresetRecord =>
          isPresetRecord(value) && value.id === id && value.deletedAt !== null,
      ),
    update: (id, definition) =>
      invokePreset(
        ipcChannels.presets.update,
        [id, definition],
        (value): value is PresetRecord =>
          isPresetRecord(value) && value.id === id && value.deletedAt === null,
      ),
  },
  projects: {
    acceptGenerationCandidates: (
      tabId,
      candidateIds,
      focusedCandidateId,
      expectedAvailableIds,
      expectedUnfinishedJobIds = [],
    ) =>
      invokeProject(
        ipcChannels.projects.acceptGenerationCandidates,
        [tabId, candidateIds, focusedCandidateId, expectedAvailableIds, expectedUnfinishedJobIds],
        isProjectTab,
      ),
    acceptSmartPatchRaster: (tabId, request) =>
      invokeProject(ipcChannels.projects.acceptSmartPatchRaster, [tabId, request], isProjectTab),
    acceptSmartPatchVariants: (tabId, request) =>
      invokeProject(ipcChannels.projects.acceptSmartPatchVariants, [tabId, request], isProjectTab),
    addGenerationLora: (tabId, selection, targetLayerId) =>
      invokeProject(
        ipcChannels.projects.addGenerationLora,
        [tabId, selection, targetLayerId ?? null],
        isProjectTab,
      ),
    addRegionalGuidance: (tabId, owner) =>
      invokeRegionalGuidance(ipcChannels.projects.addRegionalGuidance, tabId, owner),
    addSmartPatchLayer: (tabId) =>
      invokeProject(ipcChannels.projects.addSmartPatchLayer, [tabId], isProjectTab),
    addWorkspace: (input) =>
      invokeProject(
        ipcChannels.projects.addWorkspace,
        [input],
        (value): value is ProjectWorkspaceSummary | null =>
          value === null || isProjectWorkspaceSummary(value),
      ),
    applyPreset: (tabId, request) =>
      invokeProject(ipcChannels.projects.applyPreset, [tabId, request], isProjectTab),
    applySmartPatchPreset: (tabId, request) => {
      try {
        if (!isProjectId(tabId)) {
          throw new Error('Invalid Project.')
        }
        const captured = parseSmartPatchPresetApplicationRequest(request)
        return invokeProject(
          ipcChannels.projects.applySmartPatchPreset,
          [tabId, captured],
          (value): value is ProjectTab =>
            isProjectTab(value) && value.id === tabId && value.documentId === captured.documentId,
        )
      } catch {
        return Promise.resolve({
          error: {
            code: 'PROJECT_INVALID_INPUT',
            message: 'Choose valid preset sections. Size cannot be applied to a Smart Patch.',
          },
          ok: false as const,
        })
      }
    },
    cancelCurrentGeneration: (tabId, documentId, expectedJobId) =>
      invokeProject(
        ipcChannels.projects.cancelCurrentGeneration,
        [tabId, documentId, expectedJobId],
        isProjectGenerationActionState,
      ),
    cancelGenerationJob: (review) =>
      invokeProject(ipcChannels.projects.cancelGenerationJob, [review], isVoid),
    cancelImport: (importId) =>
      invokeProject(ipcChannels.projects.cancelImport, [importId], isVoid),
    clearHistory: (tabId) =>
      invokeProject(ipcChannels.projects.clearHistory, [tabId], isProjectTab),
    close: (tabId, confirmCloseImpact = false) =>
      invokeProject(ipcChannels.projects.close, [tabId, confirmCloseImpact], isVoid),
    create: (options) => invokeProject(ipcChannels.projects.create, [options], isProjectTab),
    deleteGenerationJob: (review) =>
      invokeProject(ipcChannels.projects.deleteGenerationJob, [review], isVoid),
    deleteProjectPermanently: (projectId, trashId, confirmed) =>
      invokeProject(
        ipcChannels.projects.deleteProjectPermanently,
        [projectId, trashId, confirmed],
        isProjectTrashDeleteResult,
      ),
    deleteRegionalGuidance: (tabId, owner) =>
      invokeRegionalGuidance(ipcChannels.projects.deleteRegionalGuidance, tabId, owner),
    discardAndClose: (tabId, confirmCloseImpact = false) =>
      invokeProject(ipcChannels.projects.discardAndClose, [tabId, confirmCloseImpact], isVoid),
    discardSmartPatchGenerationResults: (tabId, request) =>
      invokeProject(
        ipcChannels.projects.discardSmartPatchGenerationResults,
        [tabId, request],
        isProjectSmartPatchDiscardResult,
      ),
    duplicateRegionalGuidance: (tabId, owner) =>
      invokeRegionalGuidance(ipcChannels.projects.duplicateRegionalGuidance, tabId, owner),
    editRegionalGuidanceMask: (tabId, regionId, request) =>
      invokeRegionalMaskEdit(tabId, regionId, request),
    editSmartPatchMask: (tabId, layerId, request) =>
      invokeProject(
        ipcChannels.projects.editSmartPatchMask,
        [tabId, layerId, request],
        isProjectTab,
      ),
    finishImport: (importId, choice, workspaceId) =>
      invokeProject(
        ipcChannels.projects.finishImport,
        workspaceId === undefined ? [importId, choice] : [importId, choice, workspaceId],
        isProjectImportFinishResult,
      ),
    generate: (tabId, options) =>
      invokeProject(ipcChannels.projects.generate, [tabId, options], isProjectGenerateResult),
    generateSmartPatch: (tabId, options) =>
      invokeProject(
        ipcChannels.projects.generateSmartPatch,
        [tabId, options],
        isProjectSmartPatchGenerateResult,
      ),
    getAcceptedResultHistory: (cursor = null) =>
      invokeProject(
        ipcChannels.projects.getAcceptedResultHistory,
        [cursor],
        isAcceptedResultHistoryPage,
      ),
    getCloseImpact: (tabId) =>
      invokeProject(ipcChannels.projects.getCloseImpact, [tabId], isProjectCloseImpact),
    getGenerationProgress: () =>
      invokeProject(ipcChannels.projects.getGenerationProgress, [], isGenerationProgressSnapshot),
    getGenerationQueue: (cursor = null) =>
      invokeProject(ipcChannels.projects.getGenerationQueue, [cursor], isGenerationQueuePage),
    getGenerationState: (tabId) =>
      invokeProject(
        ipcChannels.projects.getGenerationState,
        [tabId],
        isProjectGenerationActionState,
      ),
    getGenerationTargetState: (tabId, documentId, targetKey) =>
      invokeProject(
        ipcChannels.projects.getGenerationTargetState,
        [tabId, documentId, targetKey],
        (value): value is ProjectGenerationTargetState =>
          isProjectGenerationTargetState(value) &&
          value.documentId === documentId &&
          value.targetKey === targetKey,
      ),
    getRasterGenerationData: (tabId, documentId, layerId) =>
      invokeProject(
        ipcChannels.projects.getRasterGenerationData,
        [tabId, documentId, layerId],
        (value): value is RasterGenerationData =>
          isRasterGenerationData(value) &&
          value.documentId === documentId &&
          value.layerId === layerId,
      ),
    getRasterPresetData: (tabId, documentId, layerId) =>
      invokeProject(
        ipcChannels.projects.getRasterPresetData,
        [tabId, documentId, layerId],
        (value): value is RasterGenerationData =>
          isRasterGenerationData(value) &&
          value.documentId === documentId &&
          value.layerId === layerId,
      ),
    getSmartPatchGenerationTargetState: (tabId, documentId, documentRevision, layerId) =>
      invokeProject(
        ipcChannels.projects.getSmartPatchGenerationTargetState,
        [tabId, documentId, documentRevision, layerId],
        isProjectSmartPatchGenerationTargetState,
      ),
    getSmartPatchPresetApplicationReview: (tabId, request) => {
      try {
        if (!isProjectId(tabId)) {
          throw new Error('Invalid Project.')
        }
        const captured = parseSmartPatchPresetApplicationReviewRequest(request)
        return invokeProject(
          ipcChannels.projects.getSmartPatchPresetApplicationReview,
          [tabId, captured],
          (value): value is SmartPatchPresetApplicationReview =>
            isSmartPatchPresetApplicationReviewForRequest(value, captured),
        )
      } catch {
        return Promise.resolve({
          error: {
            code: 'PROJECT_INVALID_INPUT',
            message: 'Choose a valid Smart Patch to review.',
          },
          ok: false as const,
        })
      }
    },
    getSmartPatchVariants: (tabId, layerId, documentId, documentRevision) =>
      invokeProject(
        ipcChannels.projects.getSmartPatchVariants,
        [tabId, layerId, documentId, documentRevision],
        isProjectSmartPatchVariantsInspection,
      ),
    getSmartResultComparisonData: (tabId, request) => {
      let captured: SmartResultComparisonRequest
      try {
        if (!isProjectId(tabId) || !isSmartResultComparisonRequest(request)) {
          throw new Error('Invalid Smart comparison owner.')
        }
        // Capture before invoke yields, including the nested current owner.
        captured = JSON.parse(JSON.stringify(request)) as SmartResultComparisonRequest
        if (!isSmartResultComparisonRequest(captured)) {
          throw new Error('Invalid Smart comparison owner.')
        }
      } catch {
        return Promise.resolve({
          error: { code: 'PROJECT_INVALID_INPUT', message: 'The saved result owner is invalid.' },
          ok: false as const,
        })
      }
      return invokeProject(
        ipcChannels.projects.getSmartResultComparisonData,
        [tabId, captured],
        (value): value is SmartResultComparisonData =>
          isSmartResultComparisonDataForRequest(value, captured),
      )
    },
    getSmartResultPresetData: (tabId, request) => {
      let captured: SmartResultPresetRequest
      try {
        if (!isProjectId(tabId) || !isSmartResultPresetRequest(request)) {
          throw new Error('Invalid Smart result owner.')
        }
        // Capture before invoke can yield; the caller may mutate a Vue-backed request later.
        captured = JSON.parse(JSON.stringify(request)) as SmartResultPresetRequest
        if (!isSmartResultPresetRequest(captured)) {
          throw new Error('Invalid Smart result owner.')
        }
      } catch {
        return Promise.resolve({
          error: { code: 'PROJECT_INVALID_INPUT', message: 'The saved result owner is invalid.' },
          ok: false as const,
        })
      }
      return invokeProject(
        ipcChannels.projects.getSmartResultPresetData,
        [tabId, captured],
        (value): value is SmartResultPresetData =>
          isSmartResultPresetDataForRequest(value, captured),
      )
    },
    importRasterImage: (tabId) =>
      invokeProject(
        ipcChannels.projects.importRasterImage,
        [tabId],
        (value): value is ProjectTab | null => value === null || isProjectTab(value),
      ),
    importRegionalGuidanceReferenceImage: (tabId, owner) =>
      invokeRegionalReferenceImage(true, tabId, owner),
    list: (workspaceId) =>
      invokeProject(
        ipcChannels.projects.list,
        workspaceId === undefined ? [] : [workspaceId],
        (value): value is ProjectSummary[] => Array.isArray(value) && value.every(isProjectSummary),
      ),
    listGenerationResults: (tabId) =>
      invokeProject(
        ipcChannels.projects.listGenerationResults,
        [tabId],
        isProjectGenerationResultsSnapshot,
      ),
    listSmartPatchGenerationResults: (tabId) =>
      invokeProject(
        ipcChannels.projects.listSmartPatchGenerationResults,
        [tabId],
        isProjectSmartPatchResultsSnapshot,
      ),
    listTrash: () =>
      invokeProject(
        ipcChannels.projects.listTrash,
        [],
        (value): value is ProjectTrashSummary[] =>
          Array.isArray(value) && value.every(isProjectTrashSummary),
      ),
    listWorkspaces: () =>
      invokeProject(
        ipcChannels.projects.listWorkspaces,
        [],
        (value): value is ProjectWorkspaceSummary[] =>
          Array.isArray(value) && value.every(isProjectWorkspaceSummary),
      ),
    moveProject: (projectId, workspaceId) =>
      invokeProject(
        ipcChannels.projects.moveProject,
        [projectId, workspaceId],
        (value): value is import('../shared/api.js').ProjectMoveResult =>
          isRecord(value) &&
          (value.kind === 'moved' ||
            (value.kind === 'pending' && typeof value.message === 'string')),
      ),
    moveRasterLayer: (tabId, layerId, targetIndex) =>
      invokeProject(
        ipcChannels.projects.moveRasterLayer,
        [tabId, layerId, targetIndex],
        isProjectTab,
      ),
    onBeforeWindowClose(listener, onCanceled) {
      const handler = (_event: Electron.IpcRendererEvent, requestId: unknown): void => {
        if (typeof requestId !== 'string') {
          return
        }
        void Promise.resolve()
          .then(() =>
            listener((pending) => {
              ipcRenderer.send(ipcChannels.projects.windowCloseDecisionPending, requestId, pending)
            }),
          )
          .then(
            () => ipcRenderer.send(ipcChannels.projects.windowCloseReady, requestId, null),
            (cause: unknown) =>
              ipcRenderer.send(
                ipcChannels.projects.windowCloseReady,
                requestId,
                cause instanceof Error ? cause.message : 'The Project draft could not be flushed.',
              ),
          )
      }
      const releaseHandler = (): void => onCanceled()
      ipcRenderer.on(ipcChannels.projects.prepareWindowClose, handler)
      ipcRenderer.on(ipcChannels.projects.windowCloseReleased, releaseHandler)
      ipcRenderer.send(ipcChannels.projects.windowCloseEditorReady)
      return () => {
        ipcRenderer.removeListener(ipcChannels.projects.prepareWindowClose, handler)
        ipcRenderer.removeListener(ipcChannels.projects.windowCloseReleased, releaseHandler)
      }
    },
    onGenerationChanged: (listener) => {
      const handler = () => listener()
      ipcRenderer.on(ipcChannels.projects.generationChanged, handler)
      return () => ipcRenderer.removeListener(ipcChannels.projects.generationChanged, handler)
    },
    onGenerationProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, snapshot: unknown): void => {
        if (isGenerationProgressSnapshot(snapshot)) {
          listener(snapshot)
        }
      }
      ipcRenderer.on(ipcChannels.projects.generationProgress, handler)
      return () => ipcRenderer.removeListener(ipcChannels.projects.generationProgress, handler)
    },
    onTabsChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, tabs: unknown): void => {
        if (Array.isArray(tabs) && tabs.every(isProjectTab)) {
          listener(tabs)
        }
      }
      ipcRenderer.on(ipcChannels.projects.tabsChanged, handler)
      return () => ipcRenderer.removeListener(ipcChannels.projects.tabsChanged, handler)
    },
    open: (projectId) => invokeProject(ipcChannels.projects.open, [projectId], isProjectOpenResult),
    pruneGenerationQueue: (statuses) =>
      invokeProject(
        ipcChannels.projects.pruneGenerationQueue,
        [statuses],
        (value): value is number =>
          typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
      ),
    rebuildPreview: (projectId) =>
      invokeProject(ipcChannels.projects.rebuildPreview, [projectId], isProjectRebuildResult),
    redo: (tabId) => invokeProject(ipcChannels.projects.redo, [tabId], isProjectTab),
    relinkGenerationEmbedding: (tabId, identity, targetLayerId) =>
      invokeProject(
        ipcChannels.projects.relinkGenerationEmbedding,
        [tabId, identity, targetLayerId ?? null],
        isProjectTab,
      ),
    relinkGenerationLora: (tabId, identity, targetLayerId) =>
      invokeProject(
        ipcChannels.projects.relinkGenerationLora,
        [tabId, identity, targetLayerId ?? null],
        isProjectTab,
      ),
    relinkGenerationModel: (tabId, targetLayerId) =>
      invokeProject(
        ipcChannels.projects.relinkGenerationModel,
        [tabId, targetLayerId ?? null],
        isProjectTab,
      ),
    relinkGenerationVae: (tabId, targetLayerId) =>
      invokeProject(
        ipcChannels.projects.relinkGenerationVae,
        [tabId, targetLayerId ?? null],
        isProjectTab,
      ),
    removeGenerationLora: (tabId, identity, targetLayerId) =>
      invokeProject(
        ipcChannels.projects.removeGenerationLora,
        [tabId, identity, targetLayerId ?? null],
        isProjectTab,
      ),
    removeWorkspace: (workspaceId, confirmed) =>
      invokeProject(ipcChannels.projects.removeWorkspace, [workspaceId, confirmed], isVoid),
    renameProject: (projectId, name) =>
      invokeProject(
        ipcChannels.projects.renameProject,
        [projectId, name],
        (value): value is import('../shared/api.js').ProjectRenameResult =>
          isRecord(value) &&
          (value.kind === 'renamed' ||
            (value.kind === 'pending' && typeof value.message === 'string')),
      ),
    resolveRecovery: (projectId, decision) =>
      invokeProject(ipcChannels.projects.resolveRecovery, [projectId, decision], isProjectTab),
    restoreProject: (projectId, trashId) =>
      invokeProject(ipcChannels.projects.restoreProject, [projectId, trashId], isVoid),
    retryGenerationJob: (review) =>
      invokeProject(ipcChannels.projects.retryGenerationJob, [review], isVoid),
    revealProject: (projectId) =>
      invokeProject(ipcChannels.projects.revealProject, [projectId], isVoid),
    revealWorkspace: (workspaceId) =>
      invokeProject(ipcChannels.projects.revealWorkspace, [workspaceId], isVoid),
    reviewAcceptedResult: (reference) =>
      invokeProject(
        ipcChannels.projects.reviewAcceptedResult,
        [reference],
        (value): value is boolean => typeof value === 'boolean',
      ),
    save: (tabId) => invokeProject(ipcChannels.projects.save, [tabId], isProjectSaveResult),
    saveGenerationCandidateImage: (tabId, candidateId) =>
      invokeProject(
        ipcChannels.projects.saveGenerationCandidateImage,
        [tabId, candidateId],
        isProjectCandidateExportResult,
      ),
    saveSmartPatchCandidateImage: (tabId, request) =>
      invokeProject(
        ipcChannels.projects.saveSmartPatchCandidateImage,
        [tabId, request],
        isProjectCandidateExportResult,
      ),
    sealPromptHistory: (tabId, historyGroupId) =>
      invokeProject(
        ipcChannels.projects.sealPromptHistory,
        [tabId, historyGroupId ?? null],
        isProjectTab,
      ),
    selectImport: () =>
      invokeProject(ipcChannels.projects.selectImport, [], isProjectImportSelection),
    setGenerationModel: (tabId, selection, targetLayerId) =>
      invokeProject(
        ipcChannels.projects.setGenerationModel,
        [tabId, selection, targetLayerId ?? null],
        isProjectTab,
      ),
    setGenerationVae: (tabId, selection, targetLayerId) =>
      invokeProject(
        ipcChannels.projects.setGenerationVae,
        [tabId, selection, targetLayerId ?? null],
        isProjectTab,
      ),
    setPrimaryBbox: (tabId, rect) =>
      invokeProject(ipcChannels.projects.setPrimaryBbox, [tabId, rect], isProjectTab),
    trashProject: (projectId) =>
      invokeProject(ipcChannels.projects.trashProject, [projectId], isVoid),
    undo: (tabId) => invokeProject(ipcChannels.projects.undo, [tabId], isProjectTab),
    updateGenerationDraft: (tabId, change, historyGroupId, targetLayerId) =>
      invokeProject(
        ipcChannels.projects.updateGenerationDraft,
        [tabId, change, historyGroupId ?? null, targetLayerId ?? null],
        isProjectTab,
      ),
    updateRasterLayer: (tabId, layerId, change) =>
      invokeProject(ipcChannels.projects.updateRasterLayer, [tabId, layerId, change], isProjectTab),
    updateRegionalGuidance: (tabId, owner, change) =>
      invokeRegionalGuidance(ipcChannels.projects.updateRegionalGuidance, tabId, owner, change),
    updateRegionalGuidancePrompt: (tabId, owner, change) =>
      invokeRegionalGuidance(
        ipcChannels.projects.updateRegionalGuidancePrompt,
        tabId,
        owner,
        change,
      ),
    updateRegionalGuidanceReferenceImage: async (tabId, owner, change) => {
      const result = await invokeRegionalReferenceImage(false, tabId, owner, change)
      if (!result.ok) {
        return result
      }
      if (result.value === null) {
        return {
          error: { code: 'IPC_INVALID_RESPONSE', message: 'The Project response was empty.' },
          ok: false,
        }
      }
      return { ok: true, value: result.value }
    },
    updateSmartPatchLayer: (tabId, layerId, change) =>
      invokeProject(
        ipcChannels.projects.updateSmartPatchLayer,
        [tabId, layerId, change],
        isProjectTab,
      ),
    updateSmartPatchVariant: (tabId, layerId, change) =>
      invokeProject(
        ipcChannels.projects.updateSmartPatchVariant,
        [tabId, layerId, change],
        isProjectTab,
      ),
    updateWorkspace: (workspaceId, input) =>
      invokeProject(
        ipcChannels.projects.updateWorkspace,
        [workspaceId, input],
        isProjectWorkspaceSummary,
      ),
  },
  runtime: {
    getStatus: () => invokeRuntime(ipcChannels.runtime.getStatus),
    install: () => invokeRuntime(ipcChannels.runtime.install),
    onStatusChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, status: unknown): void => {
        if (isRuntimeStatus(status)) {
          listener(status)
        }
      }
      ipcRenderer.on(ipcChannels.runtime.statusChanged, handler)
      return () => ipcRenderer.removeListener(ipcChannels.runtime.statusChanged, handler)
    },
    repair: () => invokeRuntime(ipcChannels.runtime.repair),
  },
}

contextBridge.exposeInMainWorld('api', api)
