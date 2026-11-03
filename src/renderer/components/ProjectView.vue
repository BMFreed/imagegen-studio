<script setup lang="ts">
import type {
  ModelCatalogItem,
  ProjectApi,
  ProjectEmbeddingIdentity,
  ProjectGenerationActionState,
  ProjectGenerationDraftChange,
  ProjectGenerationResultsSnapshot,
  ProjectLoraIdentity,
  ProjectRegionalGuidanceMaskEditRequest,
  ProjectSmartPatchCandidateExportRequest,
  ProjectSmartPatchGenerationTargetState,
  ProjectSmartPatchLayerView,
  ProjectSmartPatchMaskEditRequest,
  ProjectSmartPatchResultsSnapshot,
  ProjectSmartPatchVariantChange,
  ProjectTab,
} from '../../shared/api.js'
import { isProjectRegionalGuidanceMaskEditRequest } from '../../shared/api.js'
import type { PresetRecord } from '../../shared/presets/preset-schema.js'
import type { AcceptedResultHistoryReference } from '../../shared/projects/accepted-result-history.js'
import {
  ANIMA_SAMPLING_METHOD_OPTIONS,
  isAnimaSamplingMethod,
} from '../../shared/projects/anima-sampling-method.js'
import { getEffectiveDynamicPromptSettings } from '../../shared/projects/generation-dynamic-settings.js'
import type { GenerationProgressSnapshot } from '../../shared/projects/generation-progress.js'
import { progressForJob } from '../../shared/projects/generation-progress.js'
import {
  compareRasterGenerationSettings,
  compareSmartResultGenerationSettings,
} from '../../shared/projects/generation-settings-comparison.js'
import {
  ILLUSTRIOUS_SCHEDULER_PAIRS,
  isIllustriousSamplingDraftPair,
} from '../../shared/projects/illustrious-scheduler.js'
import {
  projectAcceptedResultImageIdentity,
  type ProjectAcceptedResultTarget,
} from '../../shared/projects/project-accepted-results.js'
import {
  generationTargetSignature,
  type ProjectGenerationTargetState,
} from '../../shared/projects/project-generation-target-state.js'
import {
  PROJECT_MASK_SETTINGS_MAX,
  resolveProjectMaskSettings,
} from '../../shared/projects/project-mask-settings.js'
import { PROJECT_MASK_DEFAULT_DIAMETER } from '../../shared/projects/project-mask.js'
import type { IgsRectV1, IgsRegionalGuidanceV1 } from '../../shared/projects/project-schema.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'
import {
  embeddingSourcesFromCatalog,
  getPromptEmbeddingMatches,
  type PromptEmbeddingRef,
  type PromptEmbeddingSelection,
} from '../../shared/projects/prompt-embeddings.js'
import {
  getRegionalGuidanceGenerationUnavailableReason,
  type ProjectRegionalGuidanceChange,
  type ProjectRegionalGuidanceOwner,
  type ProjectRegionalGuidancePromptChange,
  type ProjectRegionalGuidanceReferenceImageChange,
} from '../../shared/projects/regional-guidance.js'
import {
  getInvokeRegionalGenerationUnavailableReason,
  hasEnabledRegionalGuidance,
} from '../../shared/projects/regional-invoke-generation.js'

import {
  X as CancelIcon,
  Trash as ClearHistoryIcon,
  Eye,
  EyeOff,
  AspectRatio as FitIcon,
  Wand as GenerateIcon,
  ListCheck as QueueIcon,
  Refresh as RefreshIcon,
  DeviceFloppy as SaveIcon,
  ArrowsShuffle as ShuffleIcon,
} from '@vicons/tabler'
import { DnDProvider } from '@vue-dnd-kit/core'
import {
  NAlert,
  NBadge,
  NButton,
  NFormItem,
  NIcon,
  NInput,
  NInputNumber,
  NPopconfirm,
  NSelect,
  NSwitch,
  NTag,
  NTooltip,
  type SelectOption,
} from 'naive-ui'
import {
  computed,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  useId,
  watch,
} from 'vue'

import type { CandidateExportFeedback } from './candidate-export-feedback.js'
import type { GenerationResultFocusRequest } from './generation-queue-result.js'
import type { MaskGestureOwner, MaskOperation } from './project-mask-gesture.js'
import type { ResolutionSize } from './resolution-control'
import type {
  SmartPatchFreshnessRequest,
  SmartPatchFreshnessState,
} from './smart-patch-freshness-reader.js'
import type {
  SmartResultPresetOrigin,
  SmartResultPresetPresentation,
} from './smart-result-preset-source.js'

import {
  type AcceptedHistoryFocusRequest,
  resolveAcceptedHistoryTarget,
  type SmartPatchVariantFocusRequest,
} from './accepted-history-navigation.js'
import { animaDraftGenerationReason, animaEngineReason } from './anima-generation-control.js'
import {
  cfgRescaleGenerationCapabilityReason,
  cfgRescaleGenerationRangeReason,
} from './cfg-rescale-control.js'
import { denoisingGenerationReason, denoisingRuntimeSupport } from './denoising-strength-control.js'
import DynamicPromptPreview from './DynamicPromptPreview.vue'
import {
  captureGenerationComparisonSource,
  type GenerationComparisonData,
  GenerationComparisonReader,
  generationComparisonSourceCurrent,
} from './generation-comparison-source.js'
import { GenerationTargetReader } from './generation-target-reader.js'
import GenerationProgressIndicator from './GenerationProgressIndicator.vue'
import GenerationSettingsComparison from './GenerationSettingsComparison.vue'
import { type ModelManagerFocus, modelManagerFocusFor } from './model-manager-focus.js'
import PlainPromptEditor from './PlainPromptEditor.vue'
import { fitTargetBounds } from './project-canvas-geometry.js'
import {
  rasterLayerViews,
  resolveSelectedProjectEntity,
  selectedSmartPatchLayer,
} from './project-layer-context.js'
import {
  parseProjectMaskSettingInput,
  type ProjectMaskSettingField,
  ProjectMaskSettingsEditor,
  type ProjectMaskSettingsOwner,
} from './project-mask-settings-editor.js'
import { ProjectMaskSettingsFit } from './project-mask-settings-fit.js'
import {
  checkpointCatalog,
  planModelResourceSelection,
  portableModelRelinkCandidate,
  savedModelAvailability,
  selectableVersion,
} from './project-model-picker.js'
import { projectPromptLoraSources } from './project-prompt-context.js'
import { externalVaeGenerationReason, projectVaeDiagnostic } from './project-vae-picker.js'
import ProjectAcceptedResults from './ProjectAcceptedResults.vue'
import ProjectCanvas from './ProjectCanvas.vue'
import ProjectCoherenceSettings from './ProjectCoherenceSettings.vue'
import ProjectDenoisingStrength from './ProjectDenoisingStrength.vue'
import ProjectGenerationAdvancedOptions from './ProjectGenerationAdvancedOptions.vue'
import ProjectLayerStack from './ProjectLayerStack.vue'
import ProjectLoraStack from './ProjectLoraStack.vue'
import ProjectModelOption from './ProjectModelOption.vue'
import ProjectPresetCard from './ProjectPresetCard.vue'
import ProjectQueuePanel from './ProjectQueuePanel.vue'
import ProjectVaePicker from './ProjectVaePicker.vue'
import { promptEmbeddingDiagnosticReason } from './prompt-embeddings-codemirror.js'
import PromptEmbeddingDiagnostics from './PromptEmbeddingDiagnostics.vue'
import ResolutionControl from './ResolutionControl.vue'
import SmartPatchVariantsBrowser from './SmartPatchVariantsBrowser.vue'
import { vaePrecisionGenerationReason } from './vae-precision-control.js'

const props = defineProps<{
  acceptedHistoryFocus: AcceptedHistoryFocusRequest | null
  busy: boolean
  draftPending: boolean
  error: string | null
  exportFeedback: CandidateExportFeedback | null
  generationCanceling: boolean
  generationDraft: ProjectTab['generationDraft']
  generationError: string | null
  generationNotice: string | null
  generationProgress: GenerationProgressSnapshot
  generationResultFocus: GenerationResultFocusRequest | null
  generationResults: ProjectGenerationResultsSnapshot | null
  generationResultsError: string | null
  generationResultsLoading: boolean
  generationState: ProjectGenerationActionState | null
  generationStateLoading: boolean
  generationSubmitting: boolean
  historyDraftPending?: boolean
  maskDraftPending?: boolean
  modelCatalog: ModelCatalogItem[]
  modelCatalogError: string | null
  modelCatalogLoaded: boolean
  modelCatalogLoading: boolean
  patchFreshness: SmartPatchFreshnessState
  pending: 'bbox' | 'clear-history' | 'import-image' | 'model' | 'redo' | 'save' | 'undo' | null
  presets: PresetRecord[]
  presetsError: string | null
  presetsLoading: boolean
  projectGenerationDraft: ProjectTab['generationDraft']
  promptHistoryEpoch: number
  regionalPromptError?: string | null
  regionalPromptInputBlocked?: boolean
  regionalPromptOverlays?: Readonly<Record<string, IgsRegionalGuidanceV1>>
  regionalPromptPending?: boolean
  reloadRequired: boolean
  runtimeUnavailableReason: string | null
  saveNotice: string | null
  smartPatchResults: ProjectSmartPatchResultsSnapshot | null
  smartPatchResultsError: string | null
  smartPatchResultsLoading: boolean
  tab: ProjectTab
  variantDiagnosticsEpoch: number
  variantDiagnosticsPending: boolean
}>()

const currentProgress = computed(() => {
  const job = props.generationState?.jobs.find(
    (job) => job.id === props.generationState?.runningJobId,
  )
  return job && props.generationState?.documentId === props.tab.documentId
    ? progressForJob(props.generationProgress, {
        ...job,
        cancelRequested: props.generationCanceling,
        documentId: props.tab.documentId,
        projectKey: props.tab.id,
      })
    : null
})

const emit = defineEmits<{
  acceptCandidates: [selection: { candidateIds: string[]; focusedCandidateId: string | null }]
  acceptedHistoryFocusHandled: [requestId: number]
  acceptSmartPatch: [
    selection: {
      candidateIds: string[]
      documentId: string
      focusedCandidateId: string | null
      layerId: string
    },
  ]
  acceptSmartPatchRaster: [
    selection: {
      candidateIds: string[]
      documentId: string
      focusedCandidateId: string | null
      layerId: string
    },
  ]
  addLora: [identity: ProjectLoraIdentity]
  addPatch: []
  addRegionalGuidance: [tabId: string]
  applyBbox: [rect: IgsRectV1]
  cancelGeneration: []
  choosePreset: [id: string]
  clearExportFeedback: []
  clearHistory: []
  deleteRegionalGuidance: [tabId: string, owner: ProjectRegionalGuidanceOwner]
  discardRegionalPrompts: [tabId: string]
  discardSmartPatch: [scope: { documentId: string; layerId: string }]
  duplicateRegionalGuidance: [tabId: string, owner: ProjectRegionalGuidanceOwner]
  editMask: [layerId: string, request: ProjectSmartPatchMaskEditRequest]
  editRegionalMask: [
    tabId: string,
    regionId: string,
    request: ProjectRegionalGuidanceMaskEditRequest,
  ]
  exportSmartPatch: [request: ProjectSmartPatchCandidateExportRequest]
  focusAcceptedResult: [reference: AcceptedResultHistoryReference]
  generate: [iterations: number]
  importImage: []
  importRegionalReferenceImage: [tabId: string, owner: ProjectRegionalGuidanceOwner]
  inspectPatch: [request: SmartPatchFreshnessRequest | null]
  manageModels: [focus: ModelManagerFocus | null]
  managePresets: []
  moveLayer: [layerId: string, targetIndex: number]
  redo: []
  refreshGenerationResults: []
  refreshGenerationState: []
  refreshModels: []
  refreshPresets: []
  refreshSmartPatch: []
  relinkEmbedding: [identity: ProjectEmbeddingIdentity]
  relinkLora: [identity: ProjectLoraIdentity]
  relinkModel: []
  relinkVae: []
  removeLora: [identity: ProjectLoraIdentity]
  resultFocusHandled: [revision: number]
  retryRegionalPrompts: [tabId: string]
  save: []
  saveCandidateImage: [candidateId: string]
  savePreset: [target: ProjectGenerationTargetState | null]
  saveResultPreset: [layerId: string]
  saveSmartResultPreset: [
    owner: ProjectAcceptedResultTarget,
    origin: SmartResultPresetOrigin,
    presentation: SmartResultPresetPresentation,
  ]
  sealPromptHistory: [historyGroupId: string]
  sealRegionalGuidancePromptHistory: [
    tabId: string,
    owner: ProjectRegionalGuidanceOwner,
    historyGroupId: string,
  ]
  selectModel: [selection: { resourceId: string; versionId: string } | null]
  selectVae: [selection: { resourceId: string; versionId: string } | null]
  undo: []
  updateDraft: [change: ProjectGenerationDraftChange, historyGroupId?: string]
  updateLayer: [layerId: string, change: Parameters<ProjectApi['updateRasterLayer']>[2]]
  updatePatch: [layerId: string, change: Parameters<ProjectApi['updateSmartPatchLayer']>[2]]
  updatePatchVariant: [layerId: string, change: ProjectSmartPatchVariantChange]
  updateRegionalGuidance: [
    tabId: string,
    owner: ProjectRegionalGuidanceOwner,
    change: ProjectRegionalGuidanceChange,
  ]
  updateRegionalGuidancePrompt: [
    tabId: string,
    owner: ProjectRegionalGuidanceOwner,
    change: ProjectRegionalGuidancePromptChange,
  ]
  updateRegionalReferenceImage: [
    tabId: string,
    owner: ProjectRegionalGuidanceOwner,
    change: ProjectRegionalGuidanceReferenceImageChange,
  ]
  validateDraft: [tabId: string, valid: boolean]
}>()

const selectedLayerId = defineModel<string | null>('selectedLayerId', { required: true })
const presetLauncher = ref<InstanceType<typeof ProjectPresetCard> | null>(null)
function focusPresetApply() {
  const root = presetLauncher.value?.$el
  const button =
    root instanceof HTMLElement
      ? root.querySelector<HTMLButtonElement>('button[aria-label="Apply preset"]')
      : null
  if (button && !button.disabled) {
    button.focus({ preventScroll: true })
  }
}
function focusPresetSave() {
  if (props.busy || props.reloadRequired) {
    return
  }
  const root = presetLauncher.value?.$el
  const button =
    root instanceof HTMLElement
      ? root.querySelector<HTMLButtonElement>('button[aria-label="Save Current as Preset"]')
      : null
  if (button && !button.disabled) {
    button.focus({ preventScroll: true })
  }
}
function focusRegionalReferenceImport(owner: ProjectRegionalGuidanceOwner) {
  if (props.tab.documentId === owner.documentId) {
    layersPanel.value?.focusRegionalReferenceImport(owner)
  }
}
defineExpose({ focusPresetApply, focusPresetSave, focusRegionalReferenceImport })
const rasterLayers = computed(() => rasterLayerViews(props.tab.layers))
const ordinaryAcceptedLayerIds = computed(() => {
  const rasterIds = new Set(
    props.tab.layers
      .filter(
        (layer) =>
          layer.kind !== 'smart-patch' &&
          layer.resultComparisonSourceKind !== 'smart-patch' &&
          !layer.generationSettingsUnavailableReason,
      )
      .map((layer) => layer.id),
  )
  return props.tab.acceptedResults
    .filter((result) => rasterIds.has(result.layerId))
    .map((result) => result.layerId)
})
const presetLayerIds = computed(() => {
  const ids = new Set(ordinaryAcceptedLayerIds.value)
  for (const layer of props.tab.layers) {
    if (
      layer.kind !== 'smart-patch' &&
      layer.resultPresetSourceKind === 'smart-patch' &&
      props.tab.acceptedResults.some((result) => result.layerId === layer.id)
    ) {
      ids.add(layer.id)
    }
  }
  return [...ids]
})
const selectedEntity = computed(() =>
  resolveSelectedProjectEntity(props.tab, selectedLayerId.value),
)
const activeRegional = computed(() =>
  selectedEntity.value?.kind === 'regional-guidance' ? selectedEntity.value.region : null,
)
// Optimistic regional text belongs only to its row, never to capture, comparison or generation.
const regionalRows = computed(() =>
  props.tab.regionalGuidance?.map((region) => {
    const overlay = props.regionalPromptOverlays?.[region.id]
    if (overlay?.id !== region.id) {
      return region
    }
    const row = { ...region }
    if (overlay.prompts) {
      row.prompts = overlay.prompts
    } else {
      delete row.prompts
    }
    return row
  }),
)
const selectedCompositingLayerId = computed(() =>
  selectedEntity.value?.kind === 'compositing-layer' ? selectedEntity.value.layer.id : null,
)
const activePatch = computed(() =>
  selectedSmartPatchLayer(props.tab.layers, selectedCompositingLayerId.value),
)
const activeMaskTarget = computed(() => activeRegional.value ?? activePatch.value)
const generationDraftOwnerKey = computed(() =>
  JSON.stringify([props.tab.id, props.tab.documentId, activePatch.value?.id ?? null]),
)
const activeBbox = computed(() => activePatch.value?.boundingBox ?? props.tab.primaryBbox)
const activeBboxLabel = computed(() =>
  activePatch.value ? 'Smart Patch bounds' : 'Generation area',
)
const activeGeometryDisabled = computed(
  () => props.busy || props.reloadRequired || Boolean(activePatch.value?.locked),
)
const draftEditingDisabled = computed(
  () => activeGeometryDisabled.value || Boolean(props.regionalPromptPending),
)
const maskDiameterInput = ref<number | null>(PROJECT_MASK_DEFAULT_DIAMETER)
const maskControlsId = useId()
const maskDiameterInvalid = computed(
  () =>
    maskDiameterInput.value === null ||
    !Number.isFinite(maskDiameterInput.value) ||
    maskDiameterInput.value < 1 ||
    maskDiameterInput.value > 512,
)
const maskDiameter = computed({
  get: () => (maskDiameterInvalid.value ? PROJECT_MASK_DEFAULT_DIAMETER : maskDiameterInput.value!),
  set: (value: number) => {
    maskDiameterInput.value = value
  },
})
const maskOperation = ref<MaskOperation>('add')
const maskOverlayVisible = ref(true)
const maskOperationOptions = [
  { label: 'Add to mask', value: 'add' },
  { label: 'Subtract from mask', value: 'subtract' },
]
const maskGeometryEditingReason = computed(() => {
  if (props.busy || props.reloadRequired) {
    return 'Wait for the Project to finish updating.'
  }
  if (props.maskDraftPending || props.draftPending || props.regionalPromptPending) {
    return 'Wait for generation settings to finish updating before editing the mask.'
  }
  if (activeRegional.value?.locked) {
    return 'Unlock this Regional Guidance layer before editing its mask.'
  }
  if (activeRegional.value) {
    return null
  }
  if (activePatch.value?.locked) {
    return 'Unlock this Smart Patch before editing its mask.'
  }
  if (!activePatch.value?.visible) {
    return 'Show this Smart Patch before editing its mask.'
  }
  return null
})
const maskEditingReason = computed(
  () =>
    maskGeometryEditingReason.value ??
    (maskDiameterInvalid.value ? 'Choose a mask brush size from 1 to 512 pixels.' : null),
)
function clearMask() {
  const region = activeRegional.value
  if (region) {
    if (!maskGeometryEditingReason.value && region.mask.asset !== null) {
      editRegionalCanvasMask(region.id, {
        documentId: props.tab.documentId,
        documentRevision: props.tab.documentRevision,
        edit: { kind: 'clear' },
        maskId: region.mask.id,
        maskRevision: region.mask.revision,
      })
    }
    return
  }
  const patch = activePatch.value
  if (!patch || maskEditingReason.value || patch.mask.asset === null) {
    return
  }
  emit('editMask', patch.id, {
    documentId: props.tab.documentId,
    documentRevision: props.tab.documentRevision,
    edit: { kind: 'clear' },
    maskId: patch.mask.id,
    maskRevision: patch.mask.revision,
  })
}

const maskSettingsControlId = useId()
const maskSettingFields = [
  {
    ariaLabel: 'Smart Patch mask blur',
    field: 'blur',
    label: 'Mask blur',
    tooltip:
      'Soft edge width in project pixels. Fit adds this width to bbox padding. The painted mask stays unchanged.',
  },
  {
    ariaLabel: 'Smart Patch bbox padding',
    field: 'padding',
    label: 'BBox padding',
    tooltip:
      'Extra project pixels around the mask when fitting patch bounds, in addition to mask blur.',
  },
] as const
const maskSettings = computed(() => resolveProjectMaskSettings(activePatch.value?.maskSettings))
const maskSettingsRaw = reactive<Record<ProjectMaskSettingField, string>>({
  blur: String(maskSettings.value.blur),
  padding: String(maskSettings.value.padding),
})
const maskSettingsEditors: Record<ProjectMaskSettingField, ProjectMaskSettingsEditor | null> = {
  blur: null,
  padding: null,
}
const maskSettingsTransitions = ref<Record<string, unknown>[]>([])
const pendingMaskSettingsFit = shallowRef<ProjectMaskSettingsFit | null>(null)
let maskSettingsFitErrorBaseline: string | null = null
const maskSettingsFocusIntent = shallowRef<{
  field: ProjectMaskSettingField
  owner: ProjectMaskSettingsOwner
} | null>(null)
const maskSettingsOwner = computed<ProjectMaskSettingsOwner | null>(() =>
  activePatch.value
    ? {
        documentId: props.tab.documentId,
        documentRevision: props.tab.documentRevision,
        layerId: activePatch.value.id,
        projectKey: props.tab.id,
      }
    : null,
)
const maskSettingsDiagnosticState = computed(() =>
  JSON.stringify({
    disabled: activeGeometryDisabled.value,
    focusIntent: maskSettingsFocusIntent.value?.field ?? null,
    owner: maskSettingsOwner.value,
    raw: { ...maskSettingsRaw },
    transitions: maskSettingsTransitions.value,
  }),
)

function recordMaskSettingsTransition(
  kind: string,
  field: ProjectMaskSettingField | null = null,
  event?: Event,
) {
  maskSettingsTransitions.value = [
    ...maskSettingsTransitions.value.slice(-7),
    {
      disabled: activeGeometryDisabled.value,
      editors: {
        blur: maskSettingsEditors.blur?.owner ?? null,
        padding: maskSettingsEditors.padding?.owner ?? null,
      },
      field,
      kind,
      owner: maskSettingsOwner.value,
      raw: { ...maskSettingsRaw },
      target:
        event?.target instanceof HTMLInputElement
          ? { id: event.target.id, value: event.target.value }
          : null,
    },
  ]
}

function cancelMaskSettingsFocusRestore(event: Event) {
  const intent = maskSettingsFocusIntent.value
  if (!intent) {
    return
  }
  const expectedId = `${maskSettingsControlId}-${intent.field}`
  if (
    event.type !== 'focusin' ||
    !(event.target instanceof HTMLInputElement) ||
    event.target.id !== expectedId
  ) {
    maskSettingsFocusIntent.value = null
  }
}

function restoreMaskSettingsFocus() {
  const intent = maskSettingsFocusIntent.value
  if (!intent || activeGeometryDisabled.value) {
    return
  }
  void nextTick(() => {
    const owner = maskSettingsOwner.value
    if (
      maskSettingsFocusIntent.value !== intent ||
      !owner ||
      owner.projectKey !== intent.owner.projectKey ||
      owner.documentId !== intent.owner.documentId ||
      owner.layerId !== intent.owner.layerId ||
      activeGeometryDisabled.value
    ) {
      return
    }
    const input = document.getElementById(`${maskSettingsControlId}-${intent.field}`)
    maskSettingsFocusIntent.value = null
    if (
      input instanceof HTMLInputElement &&
      !input.disabled &&
      document.hasFocus() &&
      (document.activeElement === document.body || document.activeElement === input)
    ) {
      input.focus({ preventScroll: true })
      recordMaskSettingsTransition('restore-settings-focus', intent.field)
    }
  })
}

onMounted(() => {
  document.addEventListener('pointerdown', cancelMaskSettingsFocusRestore, true)
  document.addEventListener('keydown', cancelMaskSettingsFocusRestore, true)
  document.addEventListener('focusin', cancelMaskSettingsFocusRestore, true)
})
onBeforeUnmount(() => {
  maskSettingsFocusIntent.value = null
  document.removeEventListener('pointerdown', cancelMaskSettingsFocusRestore, true)
  document.removeEventListener('keydown', cancelMaskSettingsFocusRestore, true)
  document.removeEventListener('focusin', cancelMaskSettingsFocusRestore, true)
})

function cancelMaskSettingEdit(field: ProjectMaskSettingField) {
  maskSettingsEditors[field]?.cancel()
  maskSettingsEditors[field] = null
  maskSettingsRaw[field] = String(maskSettings.value[field])
  recordMaskSettingsTransition('cancel', field)
}

function cancelMaskSettingsEdits() {
  cancelMaskSettingEdit('blur')
  cancelMaskSettingEdit('padding')
}

function cancelMaskSettingsBeforeSelection(event: PointerEvent) {
  const row =
    event.target instanceof Element ? event.target.closest<HTMLElement>('[data-layer-id]') : null
  if (row && row.dataset.layerId !== activePatch.value?.id) {
    // Pointer focus blurs the input before the row's click selects its owner.
    cancelMaskSettingsEdits()
    cancelPendingMaskSettingsFit()
  }
}

watch(
  [
    () => props.tab.id,
    () => props.tab.documentId,
    () => props.tab.documentRevision,
    () => activePatch.value?.id,
    () => maskSettings.value.blur,
    () => maskSettings.value.padding,
    () => activeGeometryDisabled.value,
  ],
  () => {
    recordMaskSettingsTransition('owner-or-state-reset')
    cancelMaskSettingsEdits()
    restoreMaskSettingsFocus()
  },
  { flush: 'sync' },
)
onBeforeUnmount(cancelMaskSettingsEdits)
onBeforeUnmount(cancelPendingMaskSettingsFit)

function currentMaskSettingsFitOwner(): MaskGestureOwner | null {
  const owner = maskSettingsOwner.value
  const patch = activePatch.value
  return owner && patch
    ? { ...owner, kind: 'smart-patch', maskId: patch.mask.id, maskRevision: patch.mask.revision }
    : null
}

function cancelPendingMaskSettingsFit() {
  pendingMaskSettingsFit.value?.cancel()
  pendingMaskSettingsFit.value = null
}

function settlePendingMaskSettingsFit() {
  const continuation = pendingMaskSettingsFit.value
  const patch = activePatch.value
  if (!continuation) {
    return
  }
  if (!patch) {
    cancelPendingMaskSettingsFit()
    return
  }
  const decision = continuation.advance({
    available:
      !props.reloadRequired &&
      !props.draftPending &&
      !patch.locked &&
      patch.visible &&
      patch.mask.asset !== null,
    busy: props.busy,
    failed: props.error !== null && props.error !== maskSettingsFitErrorBaseline,
    geometry: patch,
    owner: currentMaskSettingsFitOwner(),
    settings: maskSettings.value,
  })
  if (decision.kind === 'waiting') {
    return
  }
  pendingMaskSettingsFit.value = null
  recordMaskSettingsTransition(`fit-${decision.kind}`)
  if (decision.kind === 'ready') {
    emit('editMask', decision.layerId, decision.request)
  }
}

watch(
  [
    () => props.busy,
    () => props.reloadRequired,
    () => props.draftPending,
    () => props.error,
    () => props.tab.documentRevision,
    () => currentMaskSettingsFitOwner(),
    () => activePatch.value,
  ],
  () => void nextTick(settlePendingMaskSettingsFit),
  { flush: 'sync' },
)

function editRegionalCanvasMask(regionId: string, request: ProjectRegionalGuidanceMaskEditRequest) {
  const region = activeRegional.value
  const tab = props.tab
  if (
    !region ||
    region.id !== regionId ||
    region.locked ||
    maskGeometryEditingReason.value ||
    !isProjectRegionalGuidanceMaskEditRequest(request) ||
    request.documentId !== tab.documentId ||
    request.documentRevision !== tab.documentRevision ||
    request.maskId !== region.mask.id ||
    request.maskRevision !== region.mask.revision
  ) {
    return
  }
  emit('editRegionalMask', tab.id, region.id, structuredClone(request))
}

function editCanvasMask(layerId: string, request: ProjectSmartPatchMaskEditRequest) {
  if (request.edit.kind !== 'fit-bbox') {
    emit('editMask', layerId, request)
    return
  }
  const owner = currentMaskSettingsFitOwner()
  const patch = activePatch.value
  if (
    !owner ||
    !patch ||
    maskGeometryEditingReason.value ||
    pendingMaskSettingsFit.value ||
    layerId !== owner.layerId ||
    request.documentId !== owner.documentId ||
    request.documentRevision !== owner.documentRevision ||
    request.maskId !== owner.maskId ||
    request.maskRevision !== owner.maskRevision
  ) {
    return
  }
  const blur = parseProjectMaskSettingInput(maskSettingsRaw.blur)
  const padding = parseProjectMaskSettingInput(maskSettingsRaw.padding)
  if (blur === null || padding === null) {
    recordMaskSettingsTransition('fit-invalid-draft')
    return
  }
  const changed = (['blur', 'padding'] as const).filter(
    (field) => (field === 'blur' ? blur : padding) !== maskSettings.value[field],
  )
  if (changed.length === 0) {
    emit('editMask', layerId, request)
    return
  }
  if (changed.length !== 1) {
    return
  }
  const field = changed[0]!
  beginMaskSettingEdit(field)
  pendingMaskSettingsFit.value = new ProjectMaskSettingsFit(owner, { blur, padding }, patch)
  maskSettingsFitErrorBaseline = props.error
  if (!finishMaskSettingEdit(field)) {
    cancelPendingMaskSettingsFit()
    return
  }
  void nextTick(settlePendingMaskSettingsFit)
}

function beginMaskSettingEdit(field: ProjectMaskSettingField) {
  const owner = maskSettingsOwner.value
  if (!owner || activeGeometryDisabled.value || maskSettingsEditors[field]) {
    return
  }
  const editor = new ProjectMaskSettingsEditor(owner, field, maskSettings.value[field])
  editor.update(maskSettingsRaw[field])
  maskSettingsEditors[field] = editor
  recordMaskSettingsTransition('begin', field)
}

function captureMaskSettingInput(field: ProjectMaskSettingField, event: Event) {
  if (!(event.target instanceof HTMLInputElement) || activeGeometryDisabled.value) {
    return
  }
  beginMaskSettingEdit(field)
  maskSettingsRaw[field] = event.target.value
  maskSettingsEditors[field]?.update(event.target.value)
  recordMaskSettingsTransition('input', field, event)
}

function finishMaskSettingEdit(
  field: ProjectMaskSettingField,
  focusTarget: ProjectMaskSettingField | null = null,
): boolean {
  const editor = maskSettingsEditors[field]
  if (!editor) {
    recordMaskSettingsTransition('finish-without-editor', field)
    return false
  }
  maskSettingsEditors[field] = null
  const command = editor.finish(maskSettingsOwner.value)
  if (command && !activeGeometryDisabled.value) {
    if (focusTarget) {
      maskSettingsFocusIntent.value = { field: focusTarget, owner: { ...editor.owner } }
    }
    maskSettingsRaw[field] = String(command.change.value)
    recordMaskSettingsTransition('publish', field)
    emit('updatePatch', command.layerId, command.change)
    return true
  } else if (parseProjectMaskSettingInput(maskSettingsRaw[field]) !== null) {
    maskSettingsRaw[field] = String(maskSettings.value[field])
    recordMaskSettingsTransition('finish-valid-no-command', field)
  } else {
    recordMaskSettingsTransition('finish-invalid', field)
  }
  return false
}

function captureMaskSettingBlur(field: ProjectMaskSettingField, event: FocusEvent) {
  recordMaskSettingsTransition('blur', field, event)
  const target = event.relatedTarget instanceof Element ? event.relatedTarget : null
  const tab = target?.closest('[role="tab"]')
  if (
    tab?.getAttribute('aria-selected') === 'false' &&
    tab.closest('[role="tablist"][aria-label="Open documents"]')
  ) {
    maskSettingsFocusIntent.value = null
    cancelPendingMaskSettingsFit()
    cancelMaskSettingsEdits()
    recordMaskSettingsTransition('document-navigation-cancel', field)
    return
  }
  if (event.target instanceof HTMLInputElement) {
    const focusTarget =
      target instanceof HTMLInputElement
        ? (maskSettingFields.find(
            (setting) => target.id === `${maskSettingsControlId}-${setting.field}`,
          )?.field ?? null)
        : null
    finishMaskSettingEdit(field, focusTarget)
  }
}

function captureMaskSettingKey(field: ProjectMaskSettingField, event: KeyboardEvent) {
  if (event.isComposing || !(event.target instanceof HTMLInputElement)) {
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancelMaskSettingEdit(field)
  } else if (event.key === 'Enter') {
    recordMaskSettingsTransition('enter', field, event)
    captureMaskSettingInput(field, event)
    finishMaskSettingEdit(field, field)
  }
}

const imagesPerClick = defineModel<number | null>('imagesPerClick', { default: 4 })
const countInputTheme = { peers: { Input: { paddingMedium: '0 4px' } } }
const rawCountInvalid = ref(false)
const queueOpen = ref(false)
const queueTrigger = ref<{ $el: HTMLButtonElement } | null>(null)
const queuePanel = ref<InstanceType<typeof ProjectQueuePanel> | null>(null)
const activeQueueCount = computed(() => props.generationState?.jobs.length ?? 0)

type PromptPolarity = 'negative' | 'positive'

function normalizeCount(value: number | null) {
  imagesPerClick.value =
    value === null || !Number.isFinite(value) ? null : Math.min(100, Math.max(1, Math.round(value)))
}

function captureCountInput(event: Event) {
  if (event.target instanceof HTMLInputElement) {
    const raw = event.target.value.trim()
    const value = Number(raw)
    rawCountInvalid.value =
      !/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > 100
  }
}

function reviewCountOnEnter(event: KeyboardEvent) {
  if (!event.isComposing && event.target instanceof HTMLInputElement) {
    captureCountInput(event)
  }
}

async function toggleQueue() {
  queueOpen.value = !queueOpen.value
  if (queueOpen.value) {
    emit('refreshGenerationState')
    await nextTick()
    queuePanel.value?.focusClose()
  }
}

function closeQueue() {
  queueOpen.value = false
  void nextTick(() => queueTrigger.value?.$el.focus({ preventScroll: true }))
}
const promptGroups = new Map<PromptPolarity, string>()
const dynamicPreviewOpen = ref(false)
watch([() => props.tab.id, () => props.tab.documentId, () => activePatch.value?.id], () => {
  dynamicPreviewOpen.value = false
})
const dynamicSettings = computed({
  get: () => getEffectiveDynamicPromptSettings(props.generationDraft.dynamicPrompt),
  set: (value) => {
    if (!draftEditingDisabled.value) {
      emit('updateDraft', { kind: 'dynamic-prompt', value })
    }
  },
})

function beginPromptEdit(polarity: PromptPolarity): string {
  let groupId = promptGroups.get(polarity)
  if (!groupId) {
    groupId = crypto.randomUUID()
    promptGroups.set(polarity, groupId)
  }
  return groupId
}

function updatePrompt(
  polarity: PromptPolarity,
  text: string,
  embeddingSelection?: PromptEmbeddingSelection,
) {
  if (draftEditingDisabled.value) {
    return
  }
  emit(
    'updateDraft',
    { kind: `${polarity}-prompt`, text, ...(embeddingSelection ? { embeddingSelection } : {}) },
    beginPromptEdit(polarity),
  )
}

function openEmbeddingManager(reference: PromptEmbeddingRef | undefined) {
  emit('manageModels', modelManagerFocusFor('embedding', reference?.resource ?? null))
}

function relinkEmbedding(polarity: PromptPolarity, reference: PromptEmbeddingRef) {
  emit('relinkEmbedding', {
    polarity,
    resourceId: reference.resource.localModelId,
    token: reference.token,
    versionId: reference.resource.localVersionId,
  })
}

function endPromptEdit(polarity: PromptPolarity) {
  const groupId = promptGroups.get(polarity)
  if (groupId) {
    promptGroups.delete(polarity)
    emit('sealPromptHistory', groupId)
  }
}

watch(
  () => props.promptHistoryEpoch,
  () => promptGroups.clear(),
)

const models = computed(() => checkpointCatalog(props.modelCatalog))
const promptLoraSources = computed(() =>
  projectPromptLoraSources(
    props.generationDraft.loras,
    props.modelCatalog,
    props.modelCatalogLoaded && !props.modelCatalogLoading && !props.modelCatalogError,
  ),
)
const selectedModel = computed(() => props.generationDraft.model)
const embeddingCatalogReady = computed(
  () => props.modelCatalogLoaded && !props.modelCatalogLoading && !props.modelCatalogError,
)
const embeddingSources = computed(() => embeddingSourcesFromCatalog(props.modelCatalog))
const positiveEmbeddingMatches = computed(() =>
  getPromptEmbeddingMatches(
    props.generationDraft.positivePrompt,
    embeddingSources.value,
    embeddingCatalogReady.value,
    selectedModel.value?.baseModelFamily ?? null,
    true,
  ),
)
const negativeEmbeddingMatches = computed(() =>
  getPromptEmbeddingMatches(
    props.generationDraft.negativePrompt,
    embeddingSources.value,
    embeddingCatalogReady.value,
    selectedModel.value?.baseModelFamily ?? null,
    true,
  ),
)
const selectedModelVersion = computed(() =>
  props.modelCatalog
    .find((resource) => resource.id === selectedModel.value?.localModelId)
    ?.versions.find((version) => version.id === selectedModel.value?.localVersionId),
)
function openModelManager() {
  emit('manageModels', modelManagerFocusFor('checkpoint', selectedModel.value))
}
const stagedResourceId = ref<string | null>(null)
const pickerResourceId = computed(
  () => stagedResourceId.value ?? selectedModel.value?.localModelId ?? null,
)
const selectedResource = computed(() =>
  models.value.find((resource) => resource.id === pickerResourceId.value),
)
const versionValue = computed(() =>
  stagedResourceId.value && stagedResourceId.value !== selectedModel.value?.localModelId
    ? null
    : (selectedModel.value?.localVersionId ?? null),
)
watch(
  [
    () => props.tab.id,
    () => props.tab.documentId,
    () => activePatch.value?.id,
    () => props.generationDraft.model?.localModelId,
    () => props.generationDraft.model?.localVersionId,
    () => props.generationDraft.model?.fileSha256,
  ],
  () => {
    stagedResourceId.value = null
  },
)
watch(models, (catalog) => {
  if (
    stagedResourceId.value &&
    !catalog.some(
      (resource) =>
        resource.id === stagedResourceId.value && resource.versions.some(selectableVersion),
    )
  ) {
    stagedResourceId.value = null
  }
})
const modelStatus = computed(() => savedModelAvailability(selectedModel.value, props.modelCatalog))
const relinkCandidate = computed(() =>
  props.modelCatalogLoaded && props.modelCatalogError === null
    ? portableModelRelinkCandidate(selectedModel.value, props.modelCatalog)
    : null,
)
const modelPickerDisabled = computed(
  () =>
    draftEditingDisabled.value ||
    props.modelCatalogLoading ||
    !props.modelCatalogLoaded ||
    props.modelCatalogError !== null,
)
const modelOptions = computed(() => {
  const options = models.value.map((resource) => ({
    disabled: planModelResourceSelection(resource).kind === 'unavailable',
    label: resource.name,
    value: resource.id,
  }))
  const saved = selectedModel.value
  if (saved && !options.some((option) => option.value === saved.localModelId)) {
    options.unshift({ disabled: true, label: saved.displayName, value: saved.localModelId })
  }
  return options
})
const versionOptions = computed(() => {
  const saved =
    selectedResource.value?.id === selectedModel.value?.localModelId ? selectedModel.value : null
  const options = (selectedResource.value?.versions ?? []).map((version) => ({
    disabled:
      !selectableVersion(version) ||
      (saved?.localVersionId === version.id && modelStatus.value !== 'ready'),
    label:
      saved?.localVersionId === version.id && modelStatus.value !== 'ready'
        ? `${saved.versionName} · unavailable`
        : `${version.name}${version.fileStatus === 'ready' ? '' : ` · ${version.fileStatus}`}`,
    value: version.id,
  }))
  if (saved && !options.some((option) => option.value === saved.localVersionId)) {
    options.unshift({
      disabled: true,
      label: `${saved.versionName} · unavailable`,
      value: saved.localVersionId,
    })
  }
  return options
})
const modelDiagnostic = computed(() => {
  if (!selectedModel.value || !props.modelCatalogLoaded || props.modelCatalogError) {
    return null
  }
  if (modelStatus.value === 'missing') {
    if (relinkCandidate.value) {
      return "This Project's model needs linking on this computer."
    }
    return 'The exact selected model version is no longer installed. Its saved reference is kept in this Project.'
  }
  if (modelStatus.value === 'corrupt') {
    return 'The exact selected model file failed verification. Repair it in Model Manager before generating.'
  }
  if (modelStatus.value === 'unknown-family') {
    return 'The selected model has no supported base model family. Choose a compatible version.'
  }
  return null
})

function selectModelResource(resourceId: string | null) {
  if (modelPickerDisabled.value) {
    return
  }
  if (resourceId === null) {
    if (stagedResourceId.value) {
      stagedResourceId.value = null
    } else if (selectedModel.value) {
      emit('selectModel', null)
    }
    return
  }
  const resource = models.value.find((item) => item.id === resourceId)
  if (!resource) {
    return
  }
  const plan = planModelResourceSelection(resource)
  if (plan.kind === 'choose-version') {
    stagedResourceId.value = resourceId
  } else if (plan.kind === 'select-default') {
    stagedResourceId.value = null
    emit('selectModel', { resourceId, versionId: plan.versionId })
  }
}

function selectModelVersion(versionId: string) {
  if (modelPickerDisabled.value || !selectedResource.value) {
    return
  }
  const version = selectedResource.value.versions.find((item) => item.id === versionId)
  if (version && selectableVersion(version)) {
    emit('selectModel', { resourceId: selectedResource.value.id, versionId })
  }
}

function renderModelLabel(option: SelectOption) {
  const resource = models.value.find((item) => item.id === option.value)
  return resource
    ? h(ProjectModelOption, {
        defaultSelectable: planModelResourceSelection(resource).kind === 'select-default',
        hasReadyVersion: resource.versions.some(selectableVersion),
        resource,
        version:
          resource.versions.find((version) => version.id === resource.defaultVersionId) ?? null,
      })
    : String(option.label)
}

function filterModelOption(pattern: string, option: SelectOption) {
  const resource = models.value.find((item) => item.id === option.value)
  if (!resource) {
    return String(option.label).toLocaleLowerCase().includes(pattern.toLocaleLowerCase())
  }
  const query = pattern.trim().toLocaleLowerCase()
  return [
    resource.name,
    ...resource.versions.flatMap((version) => [version.name, version.baseModelFamily ?? '']),
  ].some((value) => value.toLocaleLowerCase().includes(query))
}

function renderModelTag({ option }: { option: SelectOption }) {
  const saved = selectedModel.value
  return saved && option.value === saved.localModelId ? saved.displayName : String(option.label)
}

function renderVersionTag({ option }: { option: SelectOption }) {
  const saved = selectedModel.value
  return saved && option.value === saved.localVersionId ? saved.versionName : String(option.label)
}

const illustriousSamplingUnavailable = computed(
  () => selectedModel.value !== null && selectedModel.value.baseModelFamily !== 'illustrious',
)
const samplingFamilyNotice = computed(() => {
  if (selectedModel.value?.baseModelFamily === 'anima') {
    return animaEngineReason(
      props.generationState === null ? null : props.generationState.animaSupported,
    )
  }
  return illustriousSamplingUnavailable.value
    ? 'These sampler/scheduler options require a model verified as Illustrious.'
    : null
})
const denoisingRuntimeSupported = computed(() =>
  activePatch.value
    ? (props.generationState?.smartPatchSupported ?? false)
    : denoisingRuntimeSupport(
        selectedModel.value?.baseModelFamily ?? null,
        props.generationState,
        targetState.value?.mode ?? null,
      ),
)
const samplerOptions = computed(() => {
  const options = [...new Set(ILLUSTRIOUS_SCHEDULER_PAIRS.map((pair) => pair.sampler))].map(
    (value) => ({ label: value, value }),
  )
  const saved = props.generationDraft.sampling.sampler
  return saved && !options.some((option) => option.value === saved)
    ? [{ disabled: true, label: `${saved} · unavailable`, value: saved }, ...options]
    : options
})
const schedulerOptions = computed(() => {
  const sampler = props.generationDraft.sampling.sampler
  const options = ILLUSTRIOUS_SCHEDULER_PAIRS.filter((pair) => pair.sampler === sampler).map(
    (pair) => ({ label: pair.scheduler, value: pair.scheduler }),
  )
  const saved = props.generationDraft.sampling.scheduler
  return saved && !options.some((option) => option.value === saved)
    ? [{ disabled: true, label: `${saved} · unavailable`, value: saved }, ...options]
    : options
})
const samplingPairDiagnostic = computed(() => {
  if (selectedModel.value?.baseModelFamily === 'anima') {
    return null
  }
  const { sampler, scheduler } = props.generationDraft.sampling
  if (sampler === null && scheduler === null) {
    return null
  }
  if (!isIllustriousSamplingDraftPair(sampler, scheduler)) {
    return 'This saved pair is outside the first Illustrious options. Choose a supported pair.'
  }
  return scheduler === null ? 'Choose a scheduler to complete this sampling pair.' : null
})

function updateAnimaMethod(value: string | null) {
  if (
    draftEditingDisabled.value ||
    selectedModel.value?.baseModelFamily !== 'anima' ||
    (value !== null && !isAnimaSamplingMethod(value)) ||
    (props.generationDraft.sampling.animaMethod ?? null) === value
  ) {
    return
  }
  emit('updateDraft', { kind: 'anima-method', value })
}

function updateSampler(sampler: string | null) {
  if (draftEditingDisabled.value || illustriousSamplingUnavailable.value) {
    return
  }
  const scheduler =
    sampler !== null &&
    isIllustriousSamplingDraftPair(sampler, props.generationDraft.sampling.scheduler)
      ? props.generationDraft.sampling.scheduler
      : null
  if (
    !isIllustriousSamplingDraftPair(sampler, scheduler) ||
    (sampler === props.generationDraft.sampling.sampler &&
      scheduler === props.generationDraft.sampling.scheduler)
  ) {
    return
  }
  emit('updateDraft', { kind: 'sampling-pair', sampler, scheduler })
}

function updateScheduler(scheduler: string | null) {
  const sampler = props.generationDraft.sampling.sampler
  if (
    draftEditingDisabled.value ||
    illustriousSamplingUnavailable.value ||
    !isIllustriousSamplingDraftPair(sampler, scheduler) ||
    scheduler === props.generationDraft.sampling.scheduler
  ) {
    return
  }
  emit('updateDraft', { kind: 'sampling-pair', sampler, scheduler })
}

const fixedSeedInput = ref<number | null>(0)
const lastValidFixedSeed = ref(0)
const rawFixedSeedInvalid = ref(false)
const lastActualSeed = computed(
  () => props.generationResults?.lastActualSeed ?? props.tab.lastActualSeedSnapshot,
)
const displayedSeed = computed(() =>
  props.generationDraft.seed.policy === 'reuse' ? lastActualSeed.value : fixedSeedInput.value,
)
const fixedSeedInvalid = computed(
  () =>
    rawFixedSeedInvalid.value ||
    (props.generationDraft.seed.policy === 'fixed' &&
      (fixedSeedInput.value === null ||
        !Number.isSafeInteger(fixedSeedInput.value) ||
        fixedSeedInput.value < 0 ||
        fixedSeedInput.value > 0xff_ff_ff_ff)),
)
const samplingStepsInput = ref<number | null>(null)
const samplingCfgScaleText = ref('')
const samplingCfgScaleFocused = ref(false)
const rawSamplingStepsInvalid = ref(false)
const samplingStepsInvalid = computed(
  () =>
    rawSamplingStepsInvalid.value ||
    (samplingStepsInput.value !== null &&
      (!Number.isSafeInteger(samplingStepsInput.value) || samplingStepsInput.value < 1)),
)
const samplingCfgScaleInvalid = computed(
  () => parseCfgScale(samplingCfgScaleText.value).kind === 'invalid',
)
const lorasValid = ref(true)
const advancedOptionsValid = ref(true)
const denoisingValid = ref(true)
const targetState = ref<ProjectGenerationTargetState | null>(null)
const targetError = ref<string | null>(null)
const smartTargetState = ref<ProjectSmartPatchGenerationTargetState | null>(null)
const smartTargetError = ref<string | null>(null)
let smartTargetRequest = 0
watch(
  [
    () => props.tab.id,
    () => props.tab.documentId,
    () => props.tab.documentRevision,
    () => activePatch.value?.id,
    () => props.draftPending,
    () => props.runtimeUnavailableReason,
    () => props.generationState?.smartPatchSupported,
  ],
  async () => {
    const request = ++smartTargetRequest
    smartTargetState.value = null
    smartTargetError.value = null
    const layerId = activePatch.value?.id
    if (!layerId) {
      return
    }
    if (props.draftPending) {
      smartTargetError.value = 'Waiting for draft changes…'
      return
    }
    const { documentId, documentRevision, id: tabId } = props.tab
    const current = () =>
      request === smartTargetRequest &&
      props.tab.id === tabId &&
      props.tab.documentId === documentId &&
      props.tab.documentRevision === documentRevision &&
      activePatch.value?.id === layerId &&
      !props.draftPending
    try {
      const api = globalThis.window.api?.projects
      if (!api) {
        throw new Error('The application connection is unavailable.')
      }
      const result = await api.getSmartPatchGenerationTargetState(
        tabId,
        documentId,
        documentRevision,
        layerId,
      )
      if (!current()) {
        return
      }
      if (!result.ok) {
        throw new Error(result.error.message)
      }
      if (
        result.value.documentId !== documentId ||
        result.value.documentRevision !== documentRevision ||
        result.value.layerId !== layerId
      ) {
        throw new Error('Smart Patch inputs changed. Review the target again.')
      }
      smartTargetState.value = result.value
    } catch (cause) {
      if (current()) {
        smartTargetError.value =
          cause instanceof Error ? cause.message : 'Smart Patch inputs could not be inspected.'
      }
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  smartTargetRequest += 1
})
const denoisingTarget = computed(() =>
  activePatch.value ? smartTargetState.value : targetState.value,
)
const denoisingTargetError = computed(() =>
  activePatch.value ? smartTargetError.value : targetError.value,
)
const targetReader = new GenerationTargetReader({
  onState: (state, error) => {
    targetState.value = state
    targetError.value = error
  },
  read: async (projectKey, documentId, targetKey) => {
    const api = globalThis.window.api?.projects
    if (!api) {
      throw new Error('The application connection is unavailable.')
    }
    const result = await api.getGenerationTargetState(projectKey, documentId, targetKey)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return result.value
  },
})
const targetSignature = computed(() =>
  activePatch.value
    ? null
    : generationTargetSignature({ ...props.tab, layers: rasterLayers.value }),
)
watch(
  [() => props.tab.id, () => props.tab.documentId, targetSignature],
  () => {
    targetReader.change(
      targetSignature.value
        ? {
            documentId: props.tab.documentId,
            projectKey: props.tab.id,
            signature: targetSignature.value,
          }
        : null,
    )
  },
  { immediate: true },
)
onBeforeUnmount(() => targetReader.dispose())
const draftInvalid = computed(
  () =>
    !lorasValid.value ||
    !advancedOptionsValid.value ||
    !denoisingValid.value ||
    fixedSeedInvalid.value ||
    samplingStepsInvalid.value ||
    samplingCfgScaleInvalid.value,
)
watch(draftInvalid, (invalid) => emit('validateDraft', props.tab.id, !invalid), {
  immediate: true,
})
onBeforeUnmount(() => emit('validateDraft', props.tab.id, true))
watch(
  () => props.generationDraft.seed,
  (seed) => {
    if (seed.policy === 'fixed') {
      if (seed.value !== null) {
        lastValidFixedSeed.value = seed.value
      }
      if (!rawFixedSeedInvalid.value) {
        fixedSeedInput.value = seed.value
      }
    }
  },
  { immediate: true },
)
watch(
  generationDraftOwnerKey,
  () => {
    const { cfgScale, steps } = props.generationDraft.sampling
    rawSamplingStepsInvalid.value = false
    samplingStepsInput.value = steps
    samplingCfgScaleFocused.value = false
    samplingCfgScaleText.value = cfgScale === null ? '' : String(cfgScale)
  },
  { immediate: true },
)
watch(
  () => props.generationDraft.sampling.steps,
  (steps) => {
    if (!rawSamplingStepsInvalid.value) {
      samplingStepsInput.value = steps
    }
  },
  { immediate: true },
)
watch(
  () => props.generationDraft.sampling.cfgScale,
  (cfgScale) => {
    if (!samplingCfgScaleFocused.value) {
      samplingCfgScaleText.value = cfgScale === null ? '' : String(cfgScale)
    }
  },
  { immediate: true },
)

function captureSamplingStepsInput(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) {
    return
  }
  const raw = event.target.value.trim()
  const value = Number(raw)
  rawSamplingStepsInvalid.value =
    raw !== '' && (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1)
}

function updateSamplingSteps(value: number | null) {
  if (rawSamplingStepsInvalid.value) {
    return
  }
  if (value !== null && (!Number.isSafeInteger(value) || value < 1)) {
    rawSamplingStepsInvalid.value = true
    return
  }
  samplingStepsInput.value = value
  if (draftEditingDisabled.value || props.generationDraft.sampling.steps === value) {
    return
  }
  emit('updateDraft', { kind: 'sampling-steps', value })
}

function restoreInvalidSamplingSteps() {
  if (samplingStepsInvalid.value) {
    const ownerKey = generationDraftOwnerKey.value
    const restored = props.generationDraft.sampling.steps
    rawSamplingStepsInvalid.value = false
    samplingStepsInput.value = restored
    void nextTick(() => {
      if (generationDraftOwnerKey.value === ownerKey) {
        samplingStepsInput.value = restored
      }
    })
  }
}

function parseCfgScale(raw: string): { kind: 'invalid' } | { kind: 'valid'; value: number | null } {
  const text = raw.trim()
  if (text === '') {
    return { kind: 'valid', value: null }
  }
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    return { kind: 'invalid' }
  }
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 ? { kind: 'valid', value } : { kind: 'invalid' }
}

function updateSamplingCfgScaleText(text: string) {
  samplingCfgScaleText.value = text
  const parsed = parseCfgScale(text)
  if (parsed.kind === 'invalid' || draftEditingDisabled.value) {
    return
  }
  emit('updateDraft', { kind: 'sampling-cfg-scale', value: parsed.value })
}

function normalizeSamplingCfgScaleOnBlur() {
  const parsed = parseCfgScale(samplingCfgScaleText.value)
  samplingCfgScaleFocused.value = false
  samplingCfgScaleText.value =
    parsed.kind === 'invalid'
      ? (props.generationDraft.sampling.cfgScale?.toString() ?? '')
      : (parsed.value?.toString() ?? '')
}

function updateSeedPolicy(policy: ProjectTab['generationDraft']['seed']['policy']) {
  if (draftEditingDisabled.value || policy === props.generationDraft.seed.policy) {
    return
  }
  rawFixedSeedInvalid.value = false
  if (policy === 'fixed') {
    const value = lastValidFixedSeed.value
    fixedSeedInput.value = value
    emit('updateDraft', { kind: 'seed', policy: 'fixed', value })
  } else {
    emit('updateDraft', { kind: 'seed', policy, value: null })
  }
}

function shuffleSeed() {
  if (draftEditingDisabled.value || props.generationDraft.seed.policy === 'random') {
    return
  }
  const random = crypto.getRandomValues(new Uint32Array(1))[0]!
  const value = random === displayedSeed.value ? (random + 1) >>> 0 : random
  rawFixedSeedInvalid.value = false
  fixedSeedInput.value = value
  lastValidFixedSeed.value = value
  emit('updateDraft', { kind: 'seed', policy: 'fixed', value })
}

function reuseLastSeed() {
  const last = lastActualSeed.value
  if (props.generationDraft.seed.policy === 'reuse') {
    if (last === null) {
      updateSeedPolicy('fixed')
    } else {
      updateFixedSeed(last)
    }
  } else if (last !== null) {
    updateSeedPolicy('reuse')
  }
}

function updateFixedSeed(value: number | null) {
  fixedSeedInput.value = value
  if (
    draftEditingDisabled.value ||
    value === null ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 0xff_ff_ff_ff ||
    (props.generationDraft.seed.policy === 'fixed' && props.generationDraft.seed.value === value)
  ) {
    return
  }
  rawFixedSeedInvalid.value = false
  lastValidFixedSeed.value = value
  emit('updateDraft', { kind: 'seed', policy: 'fixed', value })
}

function captureFixedSeedInput(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) {
    return
  }
  const raw = event.target.value.trim()
  const value = /^\d+$/.test(raw) ? Number(raw) : null
  rawFixedSeedInvalid.value =
    value === null || !Number.isSafeInteger(value) || value > 0xff_ff_ff_ff
  if (rawFixedSeedInvalid.value) {
    fixedSeedInput.value = null
    if (props.generationDraft.seed.policy === 'reuse' && !props.busy && !props.reloadRequired) {
      emit('updateDraft', { kind: 'seed', policy: 'fixed', value: lastValidFixedSeed.value })
    }
    return
  }
  updateFixedSeed(value)
}

function restoreInvalidFixedSeed() {
  if (fixedSeedInvalid.value) {
    const restored = props.generationDraft.seed.value ?? lastValidFixedSeed.value
    rawFixedSeedInvalid.value = false
    fixedSeedInput.value = restored
    void nextTick(() => {
      fixedSeedInput.value = restored
    })
  }
}

const layersPanel = ref<InstanceType<typeof ProjectLayerStack> | null>(null)
const patchVariantsBrowser = ref<InstanceType<typeof SmartPatchVariantsBrowser> | null>(null)
let presetFocusDisposed = false
onBeforeUnmount(() => {
  presetFocusDisposed = true
})
const patchVariantsOpen = ref(false)
let patchVariantsEpoch = 0
const patchVariantFocus = ref<SmartPatchVariantFocusRequest | null>(null)
const patchVariantsLayerId = ref<string | null>(null)
const patchVariantsLayer = computed<ProjectSmartPatchLayerView | null>(() => {
  const layer = props.tab.layers.find((candidate) => candidate.id === patchVariantsLayerId.value)
  return layer?.kind === 'smart-patch' ? layer : null
})
const currentPatchFreshness = computed<SmartPatchFreshnessState>(() => {
  const state = props.patchFreshness
  const target = patchVariantsOpen.value ? patchVariantsLayer.value : activePatch.value
  return !props.busy &&
    !props.draftPending &&
    !props.reloadRequired &&
    !props.variantDiagnosticsPending &&
    state.owner?.tabId === props.tab.id &&
    state.owner.documentId === props.tab.documentId &&
    state.owner.documentRevision === props.tab.documentRevision &&
    state.owner.layerId === target?.id
    ? state
    : { error: null, inspection: null, loading: false, owner: null }
})
function refreshPatchFreshness() {
  const patch = patchVariantsOpen.value ? patchVariantsLayer.value : activePatch.value
  emit(
    'inspectPatch',
    patch &&
      (patchVariantsOpen.value || patch.rasterSubLayers.length > 0) &&
      !props.busy &&
      !props.draftPending &&
      !props.reloadRequired &&
      !props.variantDiagnosticsPending
      ? {
          documentId: props.tab.documentId,
          documentRevision: props.tab.documentRevision,
          layerId: patch.id,
          tabId: props.tab.id,
          variantIds: patch.rasterSubLayers.map(({ id }) => id),
        }
      : null,
  )
}
watch(
  [
    () => props.tab.id,
    () => props.tab.documentId,
    () => props.tab.documentRevision,
    () => activePatch.value?.id,
    patchVariantsOpen,
    () => patchVariantsLayer.value?.id,
    () => props.busy,
    () => props.draftPending,
    () => props.reloadRequired,
    () => props.variantDiagnosticsEpoch,
    () => props.variantDiagnosticsPending,
  ],
  refreshPatchFreshness,
  { flush: 'sync', immediate: true },
)
onBeforeUnmount(() => emit('inspectPatch', null))
const patchFreshnessLabels = computed<Record<string, string>>(() => {
  const { inspection, loading, owner } = currentPatchFreshness.value
  if (
    !owner ||
    owner.tabId !== props.tab.id ||
    owner.documentId !== props.tab.documentId ||
    owner.documentRevision !== props.tab.documentRevision
  ) {
    return {}
  }
  const patch = props.tab.layers.find((layer) => layer.id === owner.layerId)
  if (patch?.kind !== 'smart-patch' || !patch.activeRasterSubLayerId) {
    return {}
  }
  const active = inspection?.variants.find(({ id }) => id === patch.activeRasterSubLayerId)
  const label = loading
    ? 'Checking freshness…'
    : active?.status === 'ready'
      ? 'Inputs match'
      : active?.status === 'outdated'
        ? 'Outdated'
        : 'Unverified'
  return { [patch.id]: label }
})
function openPatchVariants(layerId: string) {
  if (!props.tab.layers.some((layer) => layer.id === layerId && layer.kind === 'smart-patch')) {
    return
  }
  patchVariantsEpoch += 1
  comparisonLayerId.value = null
  patchVariantsLayerId.value = layerId
  patchVariantsOpen.value = true
}
function patchVariantsClosed() {
  // A close notification may still be queued when history has opened a different Patch.
  if (patchVariantsOpen.value) {
    return
  }
  const closeEpoch = ++patchVariantsEpoch
  const tabId = props.tab.id
  const documentId = props.tab.documentId
  const documentRevision = props.tab.documentRevision
  const selectedId = selectedLayerId.value
  patchVariantFocus.value = null
  const layerId = patchVariantsLayerId.value
  patchVariantsLayerId.value = null
  if (layerId) {
    void nextTick(() => {
      if (
        patchVariantsOpen.value ||
        patchVariantsLayerId.value !== null ||
        patchVariantsEpoch !== closeEpoch ||
        props.tab.id !== tabId ||
        props.tab.documentId !== documentId ||
        props.tab.documentRevision !== documentRevision ||
        selectedLayerId.value !== selectedId ||
        props.busy ||
        props.reloadRequired ||
        !props.tab.layers.some((layer) => layer.id === layerId && layer.kind === 'smart-patch')
      ) {
        return
      }
      const row = layersPanel.value?.$el.querySelector(
        `[data-layer-id="${CSS.escape(layerId)}"]`,
      ) as HTMLElement | null
      row
        ?.querySelector<HTMLElement>('[data-patch-variants-trigger]')
        ?.focus({ preventScroll: true })
    })
  }
}
function patchVariantFocusHandled(requestId: number) {
  if (patchVariantFocus.value?.requestId === requestId) {
    patchVariantFocus.value = null
  }
  emit('acceptedHistoryFocusHandled', requestId)
}
watch([() => props.tab.id, () => props.tab.documentId, selectedLayerId], () => {
  patchVariantFocus.value = null
  patchVariantsOpen.value = false
  patchVariantsLayerId.value = null
})
watch(patchVariantsLayer, (layer) => {
  if (!layer) {
    patchVariantsOpen.value = false
  }
})
const comparisonLayerId = ref<string | null>(null)
const comparisonData = shallowRef<GenerationComparisonData | null>(null)
const comparisonLoading = ref(false)
const comparisonError = ref<string | null>(null)
const comparisonSource = computed(() =>
  comparisonLayerId.value
    ? captureGenerationComparisonSource(props.tab, comparisonLayerId.value)
    : null,
)
const comparisonLayerIds = computed(() =>
  props.tab.layers
    .filter((layer) => captureGenerationComparisonSource(props.tab, layer.id))
    .map(({ id }) => id),
)
const comparisonSections = computed(() => {
  const result = comparisonData.value
  if (!result) {
    return []
  }
  const current = {
    bbox: props.tab.primaryBbox,
    generationDraft: props.projectGenerationDraft,
    modelCatalog:
      props.modelCatalogLoaded && !props.modelCatalogLoading ? props.modelCatalog : null,
    modelCatalogError: props.modelCatalogError,
    reuseSeed: lastActualSeed.value,
  }
  return result.kind === 'smart-patch'
    ? compareSmartResultGenerationSettings(result.data, current)
    : compareRasterGenerationSettings(result.data, current)
})
let comparisonContextEpoch = 0
let comparisonDisposed = false
const comparisonReader = new GenerationComparisonReader({
  onState: (data, error, loading) => {
    comparisonData.value = data
    comparisonError.value = error
    comparisonLoading.value = loading
  },
  read: async (source) => {
    const api = globalThis.window.api?.projects
    if (!api) {
      throw new Error('The application connection is unavailable.')
    }
    const result =
      source.kind === 'smart-patch'
        ? await api.getSmartResultComparisonData(source.tabId, source.request)
        : await api.getRasterGenerationData(
            source.tabId,
            source.request.documentId,
            source.request.owner.layerId,
          )
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return result.value
  },
})
watch(
  [
    comparisonLayerId,
    () => props.tab.id,
    () => props.tab.documentId,
    () => props.tab.documentRevision,
    () => JSON.stringify(comparisonSource.value),
    // Canvas composition includes active Patch rasters; identical pixels alone do not own a read.
    () => generationTargetSignature(props.tab),
    () => props.draftPending,
    // App tracks ALL Project/patch overlays here, beyond the selected draft owner.
    () => props.historyDraftPending,
    () => props.reloadRequired,
    selectedLayerId,
    () => props.busy,
  ],
  (values, previous) => {
    comparisonContextEpoch += 1
    if (
      comparisonLayerId.value &&
      (props.reloadRequired ||
        !comparisonSource.value ||
        (previous &&
          (values[1] !== previous[1] || values[2] !== previous[2] || values[9] !== previous[9])))
    ) {
      comparisonLayerId.value = null
      return
    }
    comparisonReader.change(
      comparisonSource.value,
      Boolean(props.busy || props.draftPending || props.historyDraftPending),
    )
  },
  // Invalidate even an edit/Undo ABA before queued asynchronous work can settle.
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  comparisonDisposed = true
  comparisonContextEpoch += 1
  comparisonReader.dispose()
})
function closeComparison() {
  const source = comparisonSource.value
  const selectedId = selectedLayerId.value
  comparisonLayerId.value = null
  const epoch = comparisonContextEpoch
  if (source) {
    void nextTick(() => {
      if (
        comparisonDisposed ||
        comparisonLayerId.value ||
        epoch !== comparisonContextEpoch ||
        selectedId !== selectedLayerId.value ||
        props.busy ||
        props.reloadRequired ||
        props.draftPending ||
        props.historyDraftPending ||
        !generationComparisonSourceCurrent(source, props.tab)
      ) {
        return
      }
      const row = layersPanel.value?.$el.querySelector(
        `[data-layer-id="${CSS.escape(source.request.owner.layerId)}"]`,
      ) as HTMLElement | null
      row?.querySelector<HTMLElement>('[data-entity-menu-trigger]')?.focus({ preventScroll: true })
    })
  }
}
const acceptedResultsOpen = ref(false)
const acceptedResultsContext = ref<{
  documentId: string
  projectId: string
  selectedLayerId: string | null
} | null>(null)
const acceptedResultReveal = ref<AcceptedResultHistoryReference | null>(null)
watch(
  () =>
    [
      props.acceptedHistoryFocus,
      props.busy,
      props.reloadRequired,
      props.tab.documentRevision,
      selectedLayerId.value,
      props.historyDraftPending,
    ] as const,
  async ([request, busy, reloadRequired, revision], previous, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    if (!request) {
      return
    }
    const target = resolveAcceptedHistoryTarget(props.tab, request)
    if (
      busy ||
      reloadRequired ||
      props.historyDraftPending ||
      !target ||
      selectedLayerId.value !== target.layerId ||
      (previous?.[0]?.requestId === request.requestId && previous[3] !== revision)
    ) {
      patchVariantFocus.value = null
      emit('acceptedHistoryFocusHandled', request.requestId)
      return
    }
    await nextTick()
    if (
      cancelled ||
      props.acceptedHistoryFocus?.requestId !== request.requestId ||
      props.busy ||
      props.reloadRequired ||
      props.tab.documentRevision !== revision ||
      props.historyDraftPending ||
      selectedLayerId.value !== target.layerId ||
      !resolveAcceptedHistoryTarget(props.tab, request)
    ) {
      return
    }
    layersPanel.value?.revealLayer(target.layerId)
    if (target.kind === 'smart-patch-variant') {
      openPatchVariants(target.layerId)
      patchVariantFocus.value = {
        assetSha256: request.assetSha256,
        documentId: props.tab.documentId,
        documentRevision: revision,
        layerId: target.layerId,
        requestId: request.requestId,
        tabId: props.tab.id,
        variantId: target.variantId,
      }
    } else {
      emit('acceptedHistoryFocusHandled', request.requestId)
    }
  },
  { immediate: true },
)
watch(
  () => [props.tab.id, props.tab.documentId] as const,
  () => {
    acceptedResultsOpen.value = false
    acceptedResultsContext.value = null
    acceptedResultReveal.value = null
  },
)

function openAcceptedResults() {
  if (props.busy || props.reloadRequired || props.draftPending || props.historyDraftPending) {
    return
  }
  acceptedResultsContext.value = {
    documentId: props.tab.documentId,
    projectId: props.tab.id,
    selectedLayerId: selectedLayerId.value,
  }
  acceptedResultReveal.value = null
  acceptedResultsOpen.value = true
}

function selectAcceptedResultLayer(layerId: string) {
  const context = acceptedResultsContext.value
  const result = props.tab.acceptedResults.find((candidate) => candidate.layerId === layerId)
  const image = result && projectAcceptedResultImageIdentity(result.imageUrl)
  const reference = image && {
    assetSha256: image.assetSha256,
    documentId: props.tab.documentId,
    documentRevision: props.tab.documentRevision,
    layerId,
    projectKey: props.tab.id,
  }
  if (
    !acceptedResultsOpen.value ||
    !context ||
    context.projectId !== props.tab.id ||
    context.documentId !== props.tab.documentId ||
    props.busy ||
    props.reloadRequired ||
    props.draftPending ||
    props.historyDraftPending ||
    !reference ||
    !resolveAcceptedHistoryTarget(props.tab, reference)
  ) {
    return
  }
  acceptedResultReveal.value = reference
  acceptedResultsOpen.value = false
}

function revealAcceptedResultLayer() {
  const context = acceptedResultsContext.value
  const reference = acceptedResultReveal.value
  acceptedResultReveal.value = null
  if (!context || !reference) {
    return
  }
  // Modal focus restoration finishes before revealing a row in the Layers viewport.
  void nextTick(() => {
    if (
      !acceptedResultsOpen.value &&
      context.projectId === props.tab.id &&
      context.documentId === props.tab.documentId &&
      props.tab.documentRevision === reference.documentRevision &&
      selectedLayerId.value === context.selectedLayerId &&
      !props.busy &&
      !props.reloadRequired &&
      !props.draftPending &&
      !props.historyDraftPending &&
      resolveAcceptedHistoryTarget(props.tab, reference)
    ) {
      emit('focusAcceptedResult', reference)
    }
  })
}
watch(
  () => [props.tab.id, props.tab.documentId, props.tab.layers, props.tab.regionalGuidance] as const,
  ([tabId, documentId, layers], previous) => {
    if (previous && (previous[0] !== tabId || previous[1] !== documentId)) {
      selectedLayerId.value = null
      return
    }
    const previousLayers = previous?.[2] ?? []
    const previousIds = new Set(previousLayers.map((layer) => layer.id))
    const added = layers.filter((layer) => !previousIds.has(layer.id))
    if (previous && added.length > 0 && layers.length === previousLayers.length + added.length) {
      selectedLayerId.value = (added.find((layer) => layer.visible) ?? added[0])?.id ?? null
      return
    }
    if (selectedLayerId.value && !resolveSelectedProjectEntity(props.tab, selectedLayerId.value)) {
      selectedLayerId.value = null
    }
  },
)

const draft = reactive<{
  height: number | null
  width: number | null
  x: number | null
  y: number | null
}>({
  height: null,
  width: null,
  x: null,
  y: null,
})

const draftSize = computed<ResolutionSize>({
  get: () => ({ height: draft.height, width: draft.width }),
  set: (size) => Object.assign(draft, size),
})

const rawBboxInvalid = reactive({ height: false, width: false })

function captureBboxInput(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) {
    return
  }
  const label = event.target.getAttribute('aria-label')
  const key =
    label === 'Generation area width' || label === 'Smart Patch width'
      ? 'width'
      : label === 'Generation area height' || label === 'Smart Patch height'
        ? 'height'
        : null
  if (key) {
    const raw = event.target.value.trim()
    const value = Number(raw)
    rawBboxInvalid[key] =
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > IGS_SAFETY_CEILINGS.rasterDimension
  }
}

watch(
  [
    () => props.tab.id,
    () => props.tab.documentId,
    () => activePatch.value?.id,
    () => activeBbox.value.height,
    () => activeBbox.value.width,
    () => activeBbox.value.x,
    () => activeBbox.value.y,
  ],
  () => {
    Object.assign(draft, activeBbox.value)
    rawBboxInvalid.height = false
    rawBboxInvalid.width = false
  },
  { immediate: true },
)

const validBbox = computed(
  () =>
    draft.x !== null &&
    draft.y !== null &&
    draft.width !== null &&
    draft.height !== null &&
    Number.isSafeInteger(draft.x) &&
    Number.isSafeInteger(draft.y) &&
    Number.isSafeInteger(draft.width) &&
    Number.isSafeInteger(draft.height) &&
    Math.abs(draft.x) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    Math.abs(draft.y) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    draft.width >= 1 &&
    draft.height >= 1 &&
    draft.width <= IGS_SAFETY_CEILINGS.rasterDimension &&
    draft.height <= IGS_SAFETY_CEILINGS.rasterDimension,
)

const bboxChanged = computed(() =>
  (['x', 'y', 'width', 'height'] as const).some((key) => draft[key] !== activeBbox.value[key]),
)
const savePresetDisabledReason = computed(() => {
  if (props.draftPending || (activePatch.value && props.historyDraftPending)) {
    return 'Wait for the current settings to finish updating before saving them as a preset.'
  }
  // Seed and batch controls are excluded from a project-derived preset.
  if (
    !lorasValid.value ||
    !advancedOptionsValid.value ||
    !denoisingValid.value ||
    samplingStepsInvalid.value ||
    samplingCfgScaleInvalid.value
  ) {
    return 'Correct invalid generation settings before saving them as a preset.'
  }
  if (
    !activePatch.value &&
    (rawBboxInvalid.height || rawBboxInvalid.width || !validBbox.value || bboxChanged.value)
  ) {
    return 'Enter a valid generation area size and press Enter before saving it as a preset.'
  }
  return null
})
function saveCurrentPreset() {
  if (!props.busy && !props.reloadRequired && !savePresetDisabledReason.value) {
    emit('savePreset', targetState.value)
  }
}

function saveResultPreset(layerId: string) {
  const layer = props.tab.layers.find((candidate) => candidate.id === layerId)
  if (layer?.kind !== 'smart-patch' && layer?.resultPresetSourceKind === 'smart-patch') {
    saveSmartResultPreset({ kind: 'raster', layerId }, 'layer-menu')
    return
  }
  if (
    !props.busy &&
    !props.reloadRequired &&
    props.tab.layers.some((layer) => layer.id === layerId) &&
    ordinaryAcceptedLayerIds.value.includes(layerId)
  ) {
    emit('saveResultPreset', layerId)
  }
}

function saveSmartResultPreset(
  owner: ProjectAcceptedResultTarget,
  origin: SmartResultPresetOrigin,
) {
  if (props.busy || props.reloadRequired) {
    return
  }
  const tabId = props.tab.id
  const documentId = props.tab.documentId
  const documentRevision = props.tab.documentRevision
  const selectedId = selectedLayerId.value
  const browserEpoch = patchVariantsEpoch
  const capturedOwner = { ...owner }
  const current = () =>
    !presetFocusDisposed &&
    !props.busy &&
    !props.reloadRequired &&
    props.tab.id === tabId &&
    props.tab.documentId === documentId &&
    props.tab.documentRevision === documentRevision &&
    selectedLayerId.value === selectedId &&
    patchVariantsEpoch === browserEpoch &&
    (origin === 'variant-action'
      ? patchVariantsOpen.value && patchVariantsLayerId.value === capturedOwner.layerId
      : !patchVariantsOpen.value)
  const restoreFocus = () => {
    void nextTick(() => {
      if (!current()) {
        return
      }
      if (origin === 'variant-action' && capturedOwner.kind === 'smart-patch-variant') {
        if (!patchVariantsOpen.value || patchVariantsLayerId.value !== capturedOwner.layerId) {
          return
        }
        const panel = patchVariantsBrowser.value?.$el as HTMLElement | undefined
        const action = panel?.querySelector<HTMLElement>(
          `[data-smart-patch-variant-id="${CSS.escape(capturedOwner.variantId)}"] [data-variant-preset] button`,
        )
        const target =
          action ?? panel?.querySelector<HTMLElement>('[aria-label="Close Smart Patch variants"]')
        target?.focus({ preventScroll: true })
      } else if (!patchVariantsOpen.value) {
        const panel = layersPanel.value?.$el as HTMLElement | undefined
        panel
          ?.querySelector(`[data-layer-id="${CSS.escape(capturedOwner.layerId)}"]`)
          ?.querySelector<HTMLElement>('[data-entity-menu-trigger]')
          ?.focus({ preventScroll: true })
      }
    })
  }
  emit('saveSmartResultPreset', capturedOwner, origin, { current, restoreFocus })
}

function applyBbox() {
  if (!validBbox.value || !bboxChanged.value || activeGeometryDisabled.value) {
    return
  }
  const { height, width, x, y } = draft
  if (x === null || y === null || width === null || height === null) {
    return
  }
  changeActiveBbox({ height, width, x, y })
}

function changeActiveBbox(rect: IgsRectV1) {
  if (activeGeometryDisabled.value || activeRegional.value) {
    return
  }
  if (activePatch.value) {
    emit('updatePatch', activePatch.value.id, { kind: 'bounding-box', rect })
  } else {
    emit('applyBbox', rect)
  }
}

function applyBboxOnEnter(event: KeyboardEvent) {
  if (
    event.isComposing ||
    !(event.target instanceof HTMLInputElement) ||
    !event.target.closest('.n-input-number')
  ) {
    return
  }
  // NInputNumber parses its displayed text on Enter before this bubbling handler runs.
  captureBboxInput(event)
  commitBboxAfterUpdate()
}

function commitBboxAfterUpdate() {
  void nextTick(applyBbox)
}

const internalSize = ref<ResolutionSize>({ height: null, width: null })
const rawInternalInvalid = reactive({ height: false, width: false })
watch(
  [
    () => activePatch.value?.id,
    () => activePatch.value?.internalResolution.width,
    () => activePatch.value?.internalResolution.height,
  ],
  () => {
    internalSize.value = activePatch.value
      ? { ...activePatch.value.internalResolution }
      : { height: null, width: null }
    rawInternalInvalid.height = false
    rawInternalInvalid.width = false
  },
  { immediate: true },
)
function captureInternalInput(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) {
    return
  }
  const label = event.target.getAttribute('aria-label')
  const dimension =
    label === 'Smart Patch internal width'
      ? 'width'
      : label === 'Smart Patch internal height'
        ? 'height'
        : null
  if (!dimension) {
    return
  }
  const raw = event.target.value.trim()
  const value = Number(raw)
  rawInternalInvalid[dimension] =
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > IGS_SAFETY_CEILINGS.rasterDimension
}
function commitInternalSize() {
  const patch = activePatch.value
  const { height, width } = internalSize.value
  if (
    !patch ||
    activeGeometryDisabled.value ||
    rawInternalInvalid.width ||
    rawInternalInvalid.height ||
    width === null ||
    height === null ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > IGS_SAFETY_CEILINGS.rasterDimension ||
    height > IGS_SAFETY_CEILINGS.rasterDimension
  ) {
    return
  }
  if (width !== patch.internalResolution.width || height !== patch.internalResolution.height) {
    emit('updatePatch', patch.id, { kind: 'internal-resolution', size: { height, width } })
  }
}
function commitInternalAfterUpdate() {
  void nextTick(commitInternalSize)
}

const generationBlockingReason = computed(() => {
  const regionalReason = activePatch.value
    ? getRegionalGuidanceGenerationUnavailableReason(props.tab)
    : getInvokeRegionalGenerationUnavailableReason({
        document: { ...props.tab, generationDraft: props.generationDraft },
        iterations: imagesPerClick.value ?? 0,
        runtimeSupported: props.generationState?.regionalSupported,
      })
  if (regionalReason) {
    return regionalReason
  }
  if (activePatch.value?.locked || (activePatch.value && !activePatch.value.visible)) {
    return 'Unlock and show this Smart Patch before generating.'
  }
  if (rawBboxInvalid.height || rawBboxInvalid.width || !validBbox.value) {
    return 'Enter a valid generation area size and press Enter before generating.'
  }
  if (bboxChanged.value) {
    return 'Press Enter to apply the generation area size before generating.'
  }
  if (
    rawCountInvalid.value ||
    imagesPerClick.value === null ||
    !Number.isSafeInteger(imagesPerClick.value) ||
    imagesPerClick.value < 1 ||
    imagesPerClick.value > 100
  ) {
    return 'Choose an integer from 1 to 100 for Images per click.'
  }
  if (draftInvalid.value) {
    return 'Correct invalid generation settings before generating.'
  }
  const rescaleReason = cfgRescaleGenerationRangeReason(props.generationDraft.cfgRescale)
  if (rescaleReason) {
    return rescaleReason
  }
  if (!selectedModel.value || modelStatus.value !== 'ready') {
    return 'Choose an installed model before generating.'
  }
  const externalVaeReason = props.generationDraft.vae
    ? projectVaeDiagnostic(
        props.generationDraft.vae,
        props.modelCatalog,
        props.modelCatalogLoaded && !props.modelCatalogError,
        selectedModel.value.baseModelFamily,
      )
    : null
  if (externalVaeReason) {
    return externalVaeReason
  }
  const embeddingIssue = [
    ...positiveEmbeddingMatches.value,
    ...negativeEmbeddingMatches.value,
  ].find((match) => match.status !== 'ready')
  if (embeddingIssue && embeddingIssue.status !== 'ready') {
    return `Embedding ${embeddingIssue.token}: ${promptEmbeddingDiagnosticReason(embeddingIssue.status)}`
  }
  if (props.generationDraft.seed.policy === 'reuse' && lastActualSeed.value === null) {
    return 'Complete a generation before using Reuse.'
  }
  if (props.runtimeUnavailableReason) {
    return props.runtimeUnavailableReason
  }
  if (!props.generationState) {
    return props.generationError ?? 'Checking generation availability…'
  }
  if (props.generationState.phase === 'blocked') {
    return `${props.generationState.error?.message ?? 'Generation recovery needs attention.'} Restart the app to retry generation recovery.`
  }
  if (props.generationState.phase === 'closed') {
    return 'Generation has stopped for this app session. Save your work and restart the app.'
  }
  if (props.generationState.phase === 'preparing') {
    return 'Wait for the current batch to finish preparing.'
  }
  if (!activePatch.value && hasEnabledRegionalGuidance(props.tab)) {
    if (!targetState.value) {
      return targetError.value ?? 'Checking Current Canvas pixels for Regional Guidance…'
    }
    if (targetState.value.unavailableReason) {
      return targetState.value.unavailableReason
    }
    if (targetState.value.mode !== 'txt2img') {
      return 'Regional Guidance requires an empty Current Canvas generation area. Hide or move raster input before generating.'
    }
  }
  if (activePatch.value) {
    if (
      rawInternalInvalid.width ||
      rawInternalInvalid.height ||
      internalSize.value.width !== activePatch.value.internalResolution.width ||
      internalSize.value.height !== activePatch.value.internalResolution.height
    ) {
      return 'Enter a valid Smart Patch internal size and press Enter before generating.'
    }
    if (!props.generationState.smartPatchSupported) {
      return 'The current image engine does not support Smart Patch generation. Repair or update the runtime.'
    }
    if (!smartTargetState.value) {
      return smartTargetError.value ?? 'Checking Smart Patch input pixels…'
    }
    if (smartTargetState.value.unavailableReason) {
      return smartTargetState.value.unavailableReason
    }
    if (selectedModel.value.baseModelFamily === 'anima') {
      const reason =
        animaEngineReason(props.generationState.animaSupported) ??
        animaDraftGenerationReason(props.generationDraft)
      if (reason) {
        return reason
      }
    }
    if (
      (props.generationDraft.positivePrompt.embeddingRefs.length ||
        props.generationDraft.negativePrompt.embeddingRefs.length) &&
      !props.generationState.embeddingsSupported
    ) {
      return 'This image engine does not support embeddings yet. Remove their activation tokens to generate.'
    }
    const capabilityReason =
      externalVaeGenerationReason(
        props.generationDraft.vae,
        props.generationState.externalVaeSupported,
      ) ??
      cfgRescaleGenerationCapabilityReason(
        props.generationDraft.cfgRescale,
        props.generationState.cfgRescaleSupported,
      ) ??
      vaePrecisionGenerationReason(
        props.generationDraft.vaePrecision,
        props.generationState.vaePrecisionSupported,
      )
    if (capabilityReason) {
      return capabilityReason
    }
    return denoisingGenerationReason(
      smartTargetState.value.mode,
      props.generationDraft.sampling.denoisingStrength,
      true,
      selectedModel.value.baseModelFamily,
    )
  }
  if (selectedModel.value.baseModelFamily === 'anima') {
    return (
      animaEngineReason(props.generationState.animaSupported) ??
      animaDraftGenerationReason(props.generationDraft) ??
      denoisingGenerationReason(
        targetState.value?.mode ?? null,
        props.generationDraft.sampling.denoisingStrength,
        denoisingRuntimeSupported.value === true,
        'anima',
      )
    )
  }
  if (
    !hasEnabledRegionalGuidance(props.tab) &&
    (props.generationDraft.positivePrompt.embeddingRefs.length ||
      props.generationDraft.negativePrompt.embeddingRefs.length) &&
    !props.generationState.embeddingsSupported
  ) {
    return 'This image engine does not support embeddings yet. Remove their activation tokens to generate.'
  }
  const denoisingReason = denoisingGenerationReason(
    targetState.value?.mode ?? null,
    props.generationDraft.sampling.denoisingStrength,
    denoisingRuntimeSupported.value === true,
  )
  if (denoisingReason) {
    return denoisingReason
  }
  return (
    externalVaeGenerationReason(
      props.generationDraft.vae,
      props.generationState.externalVaeSupported,
    ) ??
    cfgRescaleGenerationCapabilityReason(
      props.generationDraft.cfgRescale,
      props.generationState.cfgRescaleSupported,
    ) ??
    vaePrecisionGenerationReason(
      props.generationDraft.vaePrecision,
      props.generationState.vaePrecisionSupported,
    )
  )
})

function generate() {
  if (
    !props.busy &&
    !props.reloadRequired &&
    !generationBlockingReason.value &&
    imagesPerClick.value !== null
  ) {
    emit('generate', imagesPerClick.value)
  }
}

const activeFitLayer = computed(
  () =>
    rasterLayers.value.find(
      (layer) => layer.id === selectedLayerId.value && layer.visible && layer.opacity > 0,
    ) ?? null,
)
const fitBbox = computed<IgsRectV1 | null>(() => {
  if (activePatch.value) {
    return props.tab.primaryBbox
  }
  if (!activeFitLayer.value) {
    return null
  }
  const bounds = fitTargetBounds([activeFitLayer.value], props.tab.primaryBbox)
  const x = Math.floor(bounds.left)
  const y = Math.floor(bounds.top)
  const rect = {
    height: Math.ceil(bounds.bottom) - y,
    width: Math.ceil(bounds.right) - x,
    x,
    y,
  }
  return Number.isSafeInteger(x) &&
    Number.isSafeInteger(y) &&
    Math.abs(x) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    Math.abs(y) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    rect.width >= 1 &&
    rect.height >= 1 &&
    rect.width <= IGS_SAFETY_CEILINGS.rasterDimension &&
    rect.height <= IGS_SAFETY_CEILINGS.rasterDimension
    ? rect
    : null
})

const canFitBbox = computed(
  () =>
    fitBbox.value !== null &&
    (['x', 'y', 'width', 'height'] as const).some(
      (key) => fitBbox.value?.[key] !== activeBbox.value[key],
    ),
)

function applyFitBbox() {
  if (fitBbox.value && canFitBbox.value && !activeGeometryDisabled.value) {
    changeActiveBbox(fitBbox.value)
  }
}
</script>

<template>
  <section
    :aria-label="`Project ${tab.title}`"
    class="project-view"
    @pointerdown.capture="cancelMaskSettingsBeforeSelection"
  >
    <NAlert
      v-if="exportFeedback"
      key="export-feedback"
      class="export-feedback"
      closable
      :showIcon="false"
      :title="exportFeedback.kind === 'success' ? 'Image exported' : 'Image export failed'"
      :type="exportFeedback.kind"
      @close="emit('clearExportFeedback')"
    >
      {{ exportFeedback.message }}
    </NAlert>
    <div class="project-notices">
      <NAlert
        v-if="smartPatchResultsError || smartPatchResults?.recoveryUnavailable"
        key="n-alert-2"
        title="Smart Patch results unavailable"
        type="warning"
      >
        {{
          smartPatchResultsError ??
          'Temporary Smart Patch results could not be recovered. Their files were kept for another recovery attempt.'
        }}
        <NButton
          :loading="smartPatchResultsLoading"
          size="tiny"
          tertiary
          @click="emit('refreshSmartPatch')"
        >
          Retry
        </NButton>
      </NAlert>
      <NAlert v-if="generationNotice" key="n-alert-2" title="Generation batch" type="warning">
        {{ generationNotice }}
      </NAlert>
      <NAlert v-if="error" key="n-alert-2" title="Project action failed" type="error">
        {{ error }}
      </NAlert>
      <NAlert v-if="saveNotice" key="n-alert-2" title="Project saved with a warning" type="warning">
        {{ saveNotice }}
      </NAlert>
      <NAlert v-if="reloadRequired" key="n-alert-3" title="Reopen this project" type="warning">
        The saved file changed during verification. Close this tab and reopen it before editing.
      </NAlert>
      <NAlert
        v-if="tab.autosaveError"
        key="n-alert-4"
        title="Recovery copy could not be updated"
        type="warning"
      >
        Your changes are still open here. Save the project to keep them in the .igs file.
        {{ tab.autosaveError }}
      </NAlert>
      <NAlert
        v-if="generationResultsError || generationResults?.recoveryUnavailable"
        key="n-alert-5"
        title="Generation results unavailable"
        type="warning"
      >
        {{
          generationResultsError ??
          'Temporary results could not be recovered. They remain on this computer for a later recovery attempt.'
        }}
        <NButton
          :disabled="generationResultsLoading"
          :loading="generationResultsLoading"
          size="tiny"
          tertiary
          @click="emit('refreshGenerationResults')"
        >
          Retry
        </NButton>
      </NAlert>
    </div>

    <div class="project-layout">
      <aside aria-label="Project settings" class="project-settings">
        <footer aria-label="Generation actions" class="generation-footer">
          <div class="generation-primary-actions">
            <NButton
              :disabled="busy || reloadRequired || Boolean(generationBlockingReason)"
              :loading="generationSubmitting"
              type="primary"
              @click="generate"
            >
              <template v-slot:icon><NIcon :component="GenerateIcon" /></template>
              <strong>Generate</strong>
            </NButton>
            <div @input.capture="captureCountInput" @keydown.enter="reviewCountOnEnter">
              <NInputNumber
                class="count-input"
                :disabled="busy || reloadRequired"
                :inputProps="{ 'aria-label': 'Images per click' }"
                :max="100"
                :min="1"
                :step="1"
                :themeOverrides="countInputTheme"
                :value="imagesPerClick"
                @update:value="normalizeCount"
              />
            </div>
          </div>
          <div class="generation-secondary-actions">
            <NBadge
              :max="99"
              :offset="[-3, 3]"
              :show="activeQueueCount > 0"
              type="success"
              :value="activeQueueCount"
            >
              <NButton
                ref="queueTrigger"
                :aria-expanded="queueOpen"
                :aria-label="`Generation queue${activeQueueCount ? `, ${activeQueueCount} active jobs` : ''}`"
                circle
                secondary
                @click="toggleQueue"
              >
                <template v-slot:icon><NIcon :component="QueueIcon" /></template>
              </NButton>
            </NBadge>
            <NButton
              aria-label="Cancel current generation"
              circle
              :disabled="
                busy || reloadRequired || !generationState?.runningJobId || generationCanceling
              "
              :loading="generationCanceling"
              secondary
              @click="emit('cancelGeneration')"
            >
              <template v-slot:icon><NIcon :component="CancelIcon" /></template>
            </NButton>
          </div>
          <GenerationProgressIndicator
            v-if="currentProgress"
            class="generation-footer-progress"
            :progress="currentProgress"
          />
          <p
            :aria-hidden="!generationBlockingReason || undefined"
            class="generation-blocking-reason"
            role="status"
          >
            {{ generationBlockingReason }}
          </p>
        </footer>
        <div class="settings-scroll">
          <ProjectPresetCard
            ref="presetLauncher"
            :applyDisabledReason="
              activePatch?.locked
                ? 'Unlock this Smart Patch before editing it.'
                : activePatch && historyDraftPending
                  ? 'Wait for Project draft changes to finish syncing before applying a preset.'
                  : null
            "
            :catalog="modelCatalog"
            :catalogReady="modelCatalogLoaded && !modelCatalogLoading && modelCatalogError === null"
            :disabled="busy || reloadRequired"
            :error="presetsError"
            :loading="presetsLoading"
            :presets
            :saveDisabledReason="savePresetDisabledReason"
            @choose="emit('choosePreset', $event)"
            @manage="emit('managePresets')"
            @refresh="emit('refreshPresets')"
            @save="saveCurrentPreset"
          />
          <div class="document-actions">
            <span
              class="document-state"
              :class="{ 'document-state--dirty': tab.dirty || draftPending }"
            >
              {{ tab.dirty || draftPending ? 'Unsaved changes' : 'Saved' }}
            </span>
            <div class="document-action-buttons">
              <NPopconfirm
                negativeText="Cancel"
                positiveText="Clear history"
                @positiveClick="emit('clearHistory')"
              >
                <template v-slot:trigger>
                  <NButton
                    aria-label="Clear Project History"
                    :disabled="reloadRequired || busy || (!tab.canUndo && !tab.canRedo)"
                    quaternary
                    size="tiny"
                    title="Clear Undo and Redo history"
                  >
                    <template v-slot:icon>
                      <NIcon :component="ClearHistoryIcon" :size="16" />
                    </template>
                  </NButton>
                </template>
                Clear Undo and Redo history for this open Project? The document will not change.
              </NPopconfirm>
              <NButton
                aria-label="Save Project"
                :disabled="reloadRequired || busy || draftInvalid"
                :loading="pending === 'save'"
                size="small"
                @click="emit('save')"
              >
                <template v-slot:icon><NIcon :component="SaveIcon" /></template>
                Save
              </NButton>
            </div>
          </div>
          <section aria-label="Generation settings" class="settings-section">
            <div class="generation-heading">
              <h2>{{ activePatch ? 'Generation' : 'Current Canvas' }}</h2>
              <NTooltip v-if="!generationResults?.candidates.length">
                <template v-slot:trigger>
                  <NButton
                    aria-label="Refresh results"
                    circle
                    :loading="generationResultsLoading"
                    quaternary
                    size="tiny"
                    @click="emit('refreshGenerationResults')"
                  >
                    <template v-slot:icon><NIcon :component="RefreshIcon" :size="16" /></template>
                  </NButton>
                </template>
                Check for temporary generation results on this computer
              </NTooltip>
            </div>
            <div class="model-fields">
              <div class="model-heading">
                <span class="field-label">Model</span>
                <div class="model-actions">
                  <NButton
                    aria-label="Refresh models"
                    :disabled="modelCatalogLoading"
                    size="tiny"
                    text
                    @click="emit('refreshModels')"
                  >
                    Refresh
                  </NButton>
                  <NButton aria-label="Manage Models" size="tiny" text @click="openModelManager">
                    Manage Models
                  </NButton>
                </div>
              </div>
              <NSelect
                aria-label="Generation model"
                clearable
                :disabled="modelPickerDisabled"
                :filter="filterModelOption"
                :filterable="models.length > 0"
                :loading="modelCatalogLoading || pending === 'model'"
                :options="modelOptions"
                placeholder="Choose an installed model"
                :renderLabel="renderModelLabel"
                :renderTag="renderModelTag"
                showOnFocus
                size="small"
                :value="pickerResourceId"
                :virtualScroll="false"
                @update:value="selectModelResource"
              />
              <NFormItem label="Version" :showFeedback="false">
                <NSelect
                  aria-label="Model version"
                  :disabled="modelPickerDisabled || !selectedResource"
                  :loading="pending === 'model'"
                  :options="versionOptions"
                  :placeholder="
                    selectedResource ? 'Choose an available version' : 'Choose a model first'
                  "
                  :renderTag="renderVersionTag"
                  size="small"
                  :value="versionValue"
                  @update:value="selectModelVersion"
                />
              </NFormItem>
              <p v-if="stagedResourceId" class="model-message" role="status">
                Choose a version. Current:
                {{
                  selectedModel
                    ? `${selectedModel.displayName} · ${selectedModel.versionName}`
                    : 'None'
                }}.
                <NButton
                  aria-label="Cancel model choice"
                  size="tiny"
                  text
                  @click="stagedResourceId = null"
                >
                  Cancel
                </NButton>
              </p>
              <div v-if="selectedModel && !stagedResourceId" class="model-summary">
                <NTag :bordered="false" size="tiny">
                  {{
                    selectedModel.baseModelFamily === 'anima'
                      ? 'Anima'
                      : selectedModel.baseModelFamily === 'illustrious'
                        ? 'Illustrious'
                        : 'Unknown family'
                  }}
                </NTag>
                <span
                  v-if="selectedModel.baseModelFamily === 'illustrious' && selectedModelVersion"
                  class="model-prediction"
                >
                  Prediction: {{ selectedModelVersion.predictionType
                  }}{{
                    selectedModelVersion.predictionTypeSource === 'default' ? ' (assumed)' : ''
                  }}
                </span>
                <span v-if="selectedModelVersion?.noiseProfile" class="model-prediction">
                  ZTSNR:
                  {{
                    selectedModelVersion.noiseProfile.effective.rescaleBetasZeroSnr ? 'on' : 'off'
                  }}
                  {{
                    selectedModelVersion.noiseProfile.rescaleBetasZeroSnrSource === 'assumed'
                      ? '(assumed)'
                      : ''
                  }}
                  · Spacing: {{ selectedModelVersion.noiseProfile.effective.timestepSpacing }}
                  {{
                    selectedModelVersion.noiseProfile.timestepSpacingSource === 'assumed'
                      ? '(assumed)'
                      : ''
                  }}
                </span>
              </div>
              <p v-if="modelCatalogError" class="model-message" role="alert">
                Could not check installed models. {{ modelCatalogError }}
              </p>
              <p v-else-if="modelDiagnostic" class="model-message" role="status">
                {{ modelDiagnostic }}
              </p>
              <p v-else-if="modelCatalogLoaded && models.length === 0" class="model-message">
                No checkpoints installed yet.
              </p>
              <div v-if="relinkCandidate && !stagedResourceId" class="model-relink">
                <p class="model-message">
                  Matching version: {{ relinkCandidate.resource.name }} ·
                  {{ relinkCandidate.version.name }}.
                </p>
                <NButton
                  aria-label="Link installed version"
                  :disabled="modelPickerDisabled"
                  :loading="pending === 'model'"
                  secondary
                  size="small"
                  @click="emit('relinkModel')"
                >
                  Link installed version
                </NButton>
              </div>
            </div>
            <div class="prompt-field">
              <PlainPromptEditor
                ariaLabel="Positive prompt"
                :disabled="draftEditingDisabled"
                dynamicPreviewAvailable
                :embeddingCatalogReady
                :embeddingRefs="generationDraft.positivePrompt.embeddingRefs"
                :embeddingSources="embeddingCatalogReady ? embeddingSources : []"
                :embeddingTokens="
                  generationDraft.positivePrompt.embeddingRefs.map((ref) => ref.token)
                "
                :loraSources="promptLoraSources"
                :modelFamily="selectedModel?.baseModelFamily ?? null"
                :modelValue="generationDraft.positivePrompt.text"
                polarity="positive"
                @blur="endPromptEdit('positive')"
                @dynamicPreview="dynamicPreviewOpen = true"
                @focus="beginPromptEdit('positive')"
                @selectEmbedding="(selection, text) => updatePrompt('positive', text, selection)"
                @update:modelValue="updatePrompt('positive', $event)"
              />
              <PromptEmbeddingDiagnostics
                :disabled="draftEditingDisabled"
                :matches="positiveEmbeddingMatches"
                title="Positive prompt"
                @manage="openEmbeddingManager"
                @relink="relinkEmbedding('positive', $event)"
              />
            </div>
            <div class="prompt-field">
              <PlainPromptEditor
                ariaLabel="Negative prompt"
                :disabled="draftEditingDisabled"
                dynamicPreviewAvailable
                :embeddingCatalogReady
                :embeddingRefs="generationDraft.negativePrompt.embeddingRefs"
                :embeddingSources="embeddingCatalogReady ? embeddingSources : []"
                :embeddingTokens="
                  generationDraft.negativePrompt.embeddingRefs.map((ref) => ref.token)
                "
                :loraSources="promptLoraSources"
                :modelFamily="selectedModel?.baseModelFamily ?? null"
                :modelValue="generationDraft.negativePrompt.text"
                polarity="negative"
                @blur="endPromptEdit('negative')"
                @dynamicPreview="dynamicPreviewOpen = true"
                @focus="beginPromptEdit('negative')"
                @selectEmbedding="(selection, text) => updatePrompt('negative', text, selection)"
                @update:modelValue="updatePrompt('negative', $event)"
              />
              <PromptEmbeddingDiagnostics
                :disabled="draftEditingDisabled"
                :matches="negativeEmbeddingMatches"
                title="Negative prompt"
                @manage="openEmbeddingManager"
                @relink="relinkEmbedding('negative', $event)"
              />
            </div>
            <ProjectLoraStack
              :key="`${generationDraftOwnerKey}:loras`"
              :catalog="modelCatalog"
              :catalogReady="modelCatalogLoaded && !modelCatalogError"
              :disabled="draftEditingDisabled"
              :draft="generationDraft"
              :loading="modelCatalogLoading"
              @add="emit('addLora', $event)"
              @change="emit('updateDraft', $event)"
              @manageModels="emit('manageModels', $event)"
              @relink="emit('relinkLora', $event)"
              @remove="emit('removeLora', $event)"
              @validity="lorasValid = $event"
            />
            <NFormItem
              v-if="selectedModel?.baseModelFamily === 'anima'"
              label="Sampler"
              :showFeedback="false"
            >
              <NSelect
                aria-label="Anima method"
                clearable
                :disabled="draftEditingDisabled"
                :options="ANIMA_SAMPLING_METHOD_OPTIONS"
                placeholder="Choose method"
                size="small"
                :value="generationDraft.sampling.animaMethod ?? null"
                @update:value="updateAnimaMethod"
              />
            </NFormItem>
            <div v-else class="sampling-fields">
              <NFormItem label="Sampler" :showFeedback="false">
                <NSelect
                  aria-label="Sampler"
                  clearable
                  :disabled="draftEditingDisabled || illustriousSamplingUnavailable"
                  :options="samplerOptions"
                  placeholder="Choose sampler"
                  size="small"
                  :value="generationDraft.sampling.sampler"
                  @update:value="updateSampler"
                />
              </NFormItem>
              <NFormItem label="Scheduler" :showFeedback="false">
                <NSelect
                  aria-label="Scheduler"
                  clearable
                  :disabled="
                    draftEditingDisabled ||
                    illustriousSamplingUnavailable ||
                    generationDraft.sampling.sampler === null
                  "
                  :options="schedulerOptions"
                  placeholder="Choose scheduler"
                  size="small"
                  :value="generationDraft.sampling.scheduler"
                  @update:value="updateScheduler"
                />
              </NFormItem>
            </div>
            <p v-if="samplingPairDiagnostic" class="sampling-validation" role="status">
              {{ samplingPairDiagnostic }}
            </p>
            <p v-if="samplingFamilyNotice" class="sampling-validation" role="status">
              {{ samplingFamilyNotice }}
            </p>
            <div class="sampling-fields">
              <NFormItem label="Steps" :showFeedback="false">
                <div class="sampling-input" @input.capture="captureSamplingStepsInput">
                  <NInputNumber
                    :key="`${generationDraftOwnerKey}:steps`"
                    :disabled="draftEditingDisabled"
                    :inputProps="{ 'aria-label': 'Steps' }"
                    :min="1"
                    :showButton="false"
                    size="small"
                    :value="samplingStepsInput"
                    @blur="restoreInvalidSamplingSteps"
                    @update:value="updateSamplingSteps"
                  />
                </div>
              </NFormItem>
              <NFormItem label="CFG scale" :showFeedback="false">
                <NInput
                  :disabled="draftEditingDisabled"
                  :inputProps="{ 'aria-label': 'CFG scale', inputmode: 'decimal' }"
                  size="small"
                  :value="samplingCfgScaleText"
                  @blur="normalizeSamplingCfgScaleOnBlur"
                  @focus="samplingCfgScaleFocused = true"
                  @update:value="updateSamplingCfgScaleText"
                />
              </NFormItem>
            </div>
            <p v-if="samplingStepsInvalid" class="sampling-validation" role="alert">
              Enter a positive whole number of steps, or leave it unset.
            </p>
            <p v-if="samplingCfgScaleInvalid" class="sampling-validation" role="alert">
              Enter a CFG scale of zero or greater, or leave it unset.
            </p>
            <ProjectDenoisingStrength
              :key="`${generationDraftOwnerKey}:denoising`"
              :editingDisabled="draftEditingDisabled"
              :modelFamily="selectedModel?.baseModelFamily ?? null"
              :modelValue="generationDraft.sampling.denoisingStrength"
              :runtimeUnavailableReason
              :supported="denoisingRuntimeSupported"
              :target="denoisingTarget"
              :targetError="denoisingTargetError"
              @update:modelValue="
                emit('updateDraft', { kind: 'denoising-strength', value: $event })
              "
              @validity="denoisingValid = $event"
            />
            <div class="seed-fields">
              <NFormItem label="Seed" :showFeedback="false">
                <div class="fixed-seed-input" @input.capture="captureFixedSeedInput">
                  <NInputNumber
                    :disabled="draftEditingDisabled || generationDraft.seed.policy === 'random'"
                    :inputProps="{ 'aria-label': 'Generation seed' }"
                    :max="0xff_ff_ff_ff"
                    :min="0"
                    :showButton="false"
                    size="small"
                    :value="displayedSeed"
                    @blur="restoreInvalidFixedSeed"
                    @update:value="updateFixedSeed"
                  />
                </div>
              </NFormItem>
              <NFormItem label="Random" :showFeedback="false">
                <NSwitch
                  aria-label="Random seed switch"
                  :disabled="draftEditingDisabled"
                  size="small"
                  :value="generationDraft.seed.policy === 'random'"
                  @update:value="updateSeedPolicy($event ? 'random' : 'fixed')"
                />
              </NFormItem>
              <div class="seed-actions">
                <NButton
                  :disabled="draftEditingDisabled || generationDraft.seed.policy === 'random'"
                  secondary
                  size="small"
                  @click="shuffleSeed"
                >
                  <template v-slot:icon><NIcon :component="ShuffleIcon" :size="16" /></template>
                  Shuffle Seed
                </NButton>
                <NButton
                  :aria-pressed="generationDraft.seed.policy === 'reuse'"
                  :disabled="
                    draftEditingDisabled ||
                    (lastActualSeed === null && generationDraft.seed.policy !== 'reuse')
                  "
                  secondary
                  size="small"
                  :type="generationDraft.seed.policy === 'reuse' ? 'primary' : 'default'"
                  @click="reuseLastSeed"
                >
                  Reuse last seed
                </NButton>
              </div>
            </div>
            <p v-if="fixedSeedInvalid" class="seed-validation" role="alert">
              Enter a fixed seed from 0 to 4294967295 before saving.
            </p>
            <p
              v-if="generationDraft.seed.policy === 'reuse' && lastActualSeed === null"
              class="seed-diagnostic"
              role="status"
            >
              No completed generation has a seed to reuse. Generate will be unavailable until one
              completes.
            </p>
            <p v-else-if="generationDraft.seed.policy === 'reuse'" class="seed-diagnostic">
              Last completed seed: {{ lastActualSeed }}
            </p>
            <ProjectGenerationAdvancedOptions
              :key="`${generationDraftOwnerKey}:advanced`"
              :editingDisabled="draftEditingDisabled"
              :modelFamily="selectedModel?.baseModelFamily ?? null"
              :modelValue="generationDraft.cfgRescale ?? null"
              :runtimeSupported="generationState?.cfgRescaleSupported ?? null"
              :runtimeUnavailableReason
              :vaePrecision="generationDraft.vaePrecision ?? null"
              :vaePrecisionRuntimeSupported="generationState?.vaePrecisionSupported ?? null"
              @update:modelValue="emit('updateDraft', { kind: 'cfg-rescale', value: $event })"
              @update:vaePrecision="emit('updateDraft', { kind: 'vae-precision', value: $event })"
              @validity="advancedOptionsValid = $event"
            >
              <template v-slot:vae>
                <ProjectVaePicker
                  :catalog="modelCatalog"
                  :catalogReady="modelCatalogLoaded && !modelCatalogError"
                  :disabled="draftEditingDisabled"
                  :loading="modelCatalogLoading"
                  :modelFamily="selectedModel?.baseModelFamily ?? null"
                  :runtimeSupported="generationState?.externalVaeSupported ?? null"
                  :saved="generationDraft.vae"
                  @manageModels="emit('manageModels', $event)"
                  @relink="emit('relinkVae')"
                  @select="emit('selectVae', $event)"
                />
              </template>
            </ProjectGenerationAdvancedOptions>
          </section>
          <section
            v-if="!activeRegional"
            :aria-label="activeBboxLabel"
            class="settings-section"
            @input.capture="captureBboxInput"
            @keydown.enter="applyBboxOnEnter"
          >
            <div class="generation-area-heading">
              <h2>{{ activeBboxLabel }}</h2>
              <NTooltip>
                <template v-slot:trigger>
                  <span class="fit-bbox-trigger">
                    <NButton
                      :aria-label="
                        activePatch ? 'Fit patch to generation area' : 'Fit to active layer'
                      "
                      circle
                      :disabled="!canFitBbox || activeGeometryDisabled"
                      :loading="pending === 'bbox'"
                      quaternary
                      size="tiny"
                      @click="applyFitBbox"
                    >
                      <template v-slot:icon><NIcon :component="FitIcon" :size="16" /></template>
                    </NButton>
                  </span>
                </template>
                {{
                  activePatch
                    ? canFitBbox
                      ? 'Fit patch to generation area'
                      : 'Patch bounds already match the generation area'
                    : !activeFitLayer
                      ? 'Select a visible layer to fit'
                      : canFitBbox
                        ? 'Fit to active layer'
                        : 'Generation area already fits the active layer'
                }}
              </NTooltip>
            </div>
            <ResolutionControl
              v-model="draftSize"
              class="bbox-size"
              :disabled="activeGeometryDisabled"
              :heightLabel="activePatch ? 'Smart Patch height' : 'Generation area height'"
              layout="expanded-preview"
              :max="IGS_SAFETY_CEILINGS.rasterDimension"
              :widthLabel="activePatch ? 'Smart Patch width' : 'Generation area width'"
              @commit="commitBboxAfterUpdate"
            />
          </section>
          <section
            v-if="activeMaskTarget"
            :aria-label="activeRegional ? 'Regional Guidance mask' : 'Smart Patch mask'"
            class="settings-section mask-settings"
            :data-mask-settings-state="activePatch ? maskSettingsDiagnosticState : undefined"
          >
            <h2>Mask</h2>
            <div class="mask-size-row">
              <label :for="`${maskControlsId}-diameter`">Brush size</label>
              <NInputNumber
                v-model:value="maskDiameterInput"
                class="mask-size-input"
                :disabled="busy || reloadRequired"
                :inputProps="{ 'aria-label': 'Mask brush size', id: `${maskControlsId}-diameter` }"
                :max="512"
                :min="1"
                :precision="0"
                :showButton="false"
                size="small"
              >
                <template v-slot:suffix>px</template>
              </NInputNumber>
            </div>
            <label class="field-label" :for="`${maskControlsId}-lasso`">Lasso operation</label>
            <NSelect
              v-model:value="maskOperation"
              aria-label="Mask lasso operation"
              :disabled="busy || reloadRequired"
              :inputProps="{ 'aria-label': 'Mask lasso operation', id: `${maskControlsId}-lasso` }"
              :options="maskOperationOptions"
              size="small"
            />
            <div class="mask-view-actions">
              <NButton
                :aria-label="maskOverlayVisible ? 'Hide mask overlay' : 'Show mask overlay'"
                :aria-pressed="maskOverlayVisible"
                secondary
                size="small"
                @click="maskOverlayVisible = !maskOverlayVisible"
              >
                <template v-slot:icon>
                  <NIcon :component="maskOverlayVisible ? Eye : EyeOff" :size="18" />
                </template>
                {{ maskOverlayVisible ? 'Hide overlay' : 'Show overlay' }}
              </NButton>
              <NButton
                aria-label="Clear mask"
                :disabled="
                  Boolean(activeRegional ? maskGeometryEditingReason : maskEditingReason) ||
                  activeMaskTarget.mask.asset === null
                "
                secondary
                size="small"
                @click="clearMask"
              >
                <template v-slot:icon><NIcon :component="ClearHistoryIcon" :size="18" /></template>
                Clear mask
              </NButton>
            </div>
            <div
              v-for="setting of activePatch ? maskSettingFields : []"
              :key="setting.field"
              class="mask-size-row"
              @blur.capture="captureMaskSettingBlur(setting.field, $event)"
              @input.capture="captureMaskSettingInput(setting.field, $event)"
              @keydown.capture="captureMaskSettingKey(setting.field, $event)"
            >
              <NTooltip>
                <template v-slot:trigger>
                  <label :for="`${maskSettingsControlId}-${setting.field}`">
                    {{ setting.label }}
                  </label>
                </template>
                {{ setting.tooltip }}
                Use whole pixels from 0 to {{ PROJECT_MASK_SETTINGS_MAX }}.
              </NTooltip>
              <NInput
                v-model:value="maskSettingsRaw[setting.field]"
                class="mask-size-input"
                :disabled="activeGeometryDisabled"
                :inputProps="{
                  'aria-label': setting.ariaLabel,
                  id: `${maskSettingsControlId}-${setting.field}`,
                  inputmode: 'numeric',
                }"
                size="small"
                :status="
                  parseProjectMaskSettingInput(maskSettingsRaw[setting.field]) === null
                    ? 'error'
                    : undefined
                "
                @focus="beginMaskSettingEdit(setting.field)"
              >
                <template v-slot:suffix>px</template>
              </NInput>
            </div>
            <ProjectCoherenceSettings
              v-if="activePatch"
              :disabled="activeGeometryDisabled"
              :owner="maskSettingsOwner"
              :settings="activePatch.coherenceSettings"
              @change="emit('updatePatch', $event.layerId, $event.change)"
            />
            <p v-if="maskEditingReason" class="model-message" role="status">
              {{ maskEditingReason }}
            </p>
          </section>
          <section
            v-if="activePatch"
            aria-label="Smart Patch internal resolution"
            class="settings-section"
            @input.capture="captureInternalInput"
            @keydown.enter="commitInternalAfterUpdate"
          >
            <h2>Internal resolution</h2>
            <ResolutionControl
              v-model="internalSize"
              :disabled="activeGeometryDisabled"
              heightLabel="Smart Patch internal height"
              layout="expanded-preview"
              :max="IGS_SAFETY_CEILINGS.rasterDimension"
              widthLabel="Smart Patch internal width"
              @commit="commitInternalAfterUpdate"
            />
            <p
              v-if="rawInternalInvalid.width || rawInternalInvalid.height"
              class="sampling-validation"
              role="alert"
            >
              Enter a valid internal resolution and press Enter.
            </p>
          </section>
        </div>
      </aside>

      <ProjectCanvas
        :key="tab.id"
        v-model:maskDiameter="maskDiameter"
        v-model:maskOperation="maskOperation"
        v-model:maskOverlayVisible="maskOverlayVisible"
        :bbox="activeBbox"
        :bboxEditingDisabled="activeGeometryDisabled || Boolean(activeRegional)"
        :bboxLabel="activeBboxLabel"
        :canRedo="tab.canRedo"
        :canUndo="tab.canUndo"
        :candidateActionsDisabled="busy"
        :disabled="busy || reloadRequired"
        :documentId="tab.documentId"
        :documentRevision="tab.documentRevision"
        :entityLayers="tab.layers"
        :generationResults="generationResults?.candidates ?? []"
        :generationResultsLoading
        :historyPending="pending === 'undo' || pending === 'redo' ? pending : null"
        :layers="rasterLayers"
        :maskEditingDisabled="Boolean(maskEditingReason)"
        :maskEditingReason
        :maskGeometryEditingDisabled="Boolean(maskGeometryEditingReason)"
        :maskTarget="activePatch"
        :projectKey="tab.id"
        :regionalContext="activeRegional"
        :resultFocus="generationResultFocus"
        :selectedLayerId="selectedCompositingLayerId"
        :smartPatchResults
        :smartPatchResultsLoading
        @acceptCandidates="emit('acceptCandidates', $event)"
        @acceptSmartPatch="emit('acceptSmartPatch', $event)"
        @acceptSmartPatchRaster="emit('acceptSmartPatchRaster', $event)"
        @changeBbox="changeActiveBbox"
        @discardSmartPatch="emit('discardSmartPatch', $event)"
        @editMask="editCanvasMask"
        @editRegionalMask="editRegionalCanvasMask"
        @exportSmartPatch="emit('exportSmartPatch', $event)"
        @redo="emit('redo')"
        @refreshGenerationResults="emit('refreshGenerationResults')"
        @refreshSmartPatch="emit('refreshSmartPatch')"
        @resultFocusHandled="emit('resultFocusHandled', $event)"
        @saveCandidateImage="emit('saveCandidateImage', $event)"
        @selectLayer="selectedLayerId = $event"
        @undo="emit('undo')"
      >
        <template v-slot:queue>
          <ProjectQueuePanel
            v-if="queueOpen"
            ref="queuePanel"
            :canceling="generationCanceling"
            :disabled="busy || reloadRequired"
            :error="generationError"
            :jobs="generationState?.jobs ?? []"
            :loading="generationStateLoading"
            :progress="currentProgress"
            :runningJobId="generationState?.runningJobId ?? null"
            @cancelCurrent="emit('cancelGeneration')"
            @close="closeQueue"
            @refresh="emit('refreshGenerationState')"
          />
        </template>
      </ProjectCanvas>

      <div class="layer-workspace">
        <DnDProvider :autoScrollViewport="false">
          <ProjectLayerStack
            v-show="!patchVariantsOpen"
            ref="layersPanel"
            v-model:comparisonLayerId="comparisonLayerId"
            v-model:selectedLayerId="selectedLayerId"
            :currentCanvasDraft="projectGenerationDraft"
            :disabled="busy || reloadRequired"
            :documentId="tab.documentId"
            :documentRevision="tab.documentRevision"
            :generatedLayerIds="comparisonLayerIds"
            :importing="pending === 'import-image'"
            :layers="tab.layers"
            :modelCatalog
            :modelCatalogReady="embeddingCatalogReady"
            :patchFreshnessLabels
            :presetLayerIds
            :promptHistoryEpoch
            :regionalPromptInputBlocked
            :regionalPromptPending
            :regions="regionalRows"
            @addPatch="emit('addPatch')"
            @addRegionalGuidance="emit('addRegionalGuidance', tab.id)"
            @browseVariants="openPatchVariants"
            @deleteRegionalGuidance="emit('deleteRegionalGuidance', tab.id, $event)"
            @duplicateRegionalGuidance="emit('duplicateRegionalGuidance', tab.id, $event)"
            @importImage="emit('importImage')"
            @importRegionalReferenceImage="emit('importRegionalReferenceImage', tab.id, $event)"
            @move="(layerId, targetIndex) => emit('moveLayer', layerId, targetIndex)"
            @saveResultPreset="saveResultPreset"
            @saveSmartResultPreset="saveSmartResultPreset($event, 'layer-menu')"
            @sealRegionalGuidancePromptHistory="
              (owner, historyGroupId) =>
                emit('sealRegionalGuidancePromptHistory', tab.id, owner, historyGroupId)
            "
            @update="(layerId, change) => emit('updateLayer', layerId, change)"
            @updatePatch="(layerId, change) => emit('updatePatch', layerId, change)"
            @updateRegionalGuidance="
              (owner, change) => emit('updateRegionalGuidance', tab.id, owner, change)
            "
            @updateRegionalGuidancePrompt="
              (owner, change) => emit('updateRegionalGuidancePrompt', tab.id, owner, change)
            "
            @updateRegionalReferenceImage="
              (owner, change) => emit('updateRegionalReferenceImage', tab.id, owner, change)
            "
          >
            <template v-slot:regional-notice>
              <NAlert
                v-if="regionalPromptError"
                class="regional-prompt-error"
                :showIcon="false"
                title="Regional edits not synced"
                type="error"
              >
                <p>{{ regionalPromptError }}</p>
                <p>
                  Pending regional edits are kept in this window. Discard removes only pending
                  edits; changes already applied to the Project stay.
                </p>
                <div class="regional-prompt-error-actions">
                  <NButton
                    :disabled="busy"
                    size="small"
                    @click="emit('retryRegionalPrompts', tab.id)"
                  >
                    Retry regional edits
                  </NButton>
                  <NButton
                    :disabled="busy"
                    size="small"
                    @click="emit('discardRegionalPrompts', tab.id)"
                  >
                    Discard pending regional edits
                  </NButton>
                </div>
              </NAlert>
            </template>
            <template v-slot:comparison="{ layer }">
              <GenerationSettingsComparison
                :key="`${tab.id}:${tab.documentId}:${layer.id}`"
                :error="comparisonError"
                :layerName="comparisonSource?.layerName ?? layer.name"
                :loading="comparisonLoading"
                :sections="comparisonSections"
                @close="closeComparison"
              />
            </template>
            <template v-slot:header-actions>
              <NButton
                aria-label="Accepted results"
                :disabled="busy || reloadRequired || draftPending || historyDraftPending"
                quaternary
                size="tiny"
                @click="openAcceptedResults"
              >
                Accepted results
              </NButton>
            </template>
          </ProjectLayerStack>
        </DnDProvider>
        <SmartPatchVariantsBrowser
          ref="patchVariantsBrowser"
          v-model:show="patchVariantsOpen"
          :busy
          :draftPending
          :error
          :focusRequest="patchVariantFocus"
          :inspection="currentPatchFreshness.inspection"
          :layer="patchVariantsLayer"
          :loading="currentPatchFreshness.loading || draftPending || variantDiagnosticsPending"
          :readError="currentPatchFreshness.error"
          :reloadRequired
          :tab
          @change="(layerId, change) => emit('updatePatchVariant', layerId, change)"
          @closed="patchVariantsClosed"
          @focusHandled="patchVariantFocusHandled"
          @refresh="refreshPatchFreshness"
          @saveSmartResultPreset="saveSmartResultPreset($event, 'variant-action')"
        />
      </div>
    </div>
    <ProjectAcceptedResults
      :key="`${tab.id}:${tab.documentId}`"
      v-model:show="acceptedResultsOpen"
      :disabled="busy || reloadRequired || draftPending || historyDraftPending"
      :layers="tab.layers"
      :results="tab.acceptedResults"
      @closed="revealAcceptedResultLayer"
      @selectLayer="selectAcceptedResultLayer"
    />
    <DynamicPromptPreview
      v-model:settings="dynamicSettings"
      v-model:show="dynamicPreviewOpen"
      :disabled="draftEditingDisabled"
      :negativePrompt="generationDraft.negativePrompt.text"
      :positivePrompt="generationDraft.positivePrompt.text"
    />
  </section>
</template>

<style scoped>
.regional-prompt-error {
  margin-bottom: 8px;
}

.regional-prompt-error p {
  margin: 0 0 6px;
  overflow-wrap: anywhere;
}

.regional-prompt-error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mask-settings {
  display: grid;
  gap: 8px;
}
.mask-size-row,
.mask-view-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.mask-size-input {
  width: 92px;
}
.mask-view-actions {
  flex-wrap: wrap;
  justify-content: start;
}
.project-view {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.export-feedback {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 4;
  width: 256px;
  max-width: calc(100% - 24px);
}

.document-state {
  flex: 0 0 auto;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.document-state--dirty {
  color: var(--app-tab-active-text);
}

.project-notices {
  display: grid;
  gap: 8px;
  padding: 0 12px;
}

.project-notices:has(.n-alert) {
  padding-top: 8px;
  padding-bottom: 8px;
}

.project-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) minmax(280px, 22vw);
  flex: 1 1 auto;
  min-height: 0;
}

.layer-workspace {
  display: grid;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.project-settings {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--app-border);
  background: var(--app-surface);
}

.settings-scroll {
  min-height: 0;
  overflow: auto;
  scrollbar-color: var(--app-border) transparent;
  scrollbar-width: thin;
  padding: 14px 12px;
}

.generation-footer {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  background: var(--app-elevated);
  border-bottom: 1px solid var(--app-border);
}

.generation-primary-actions,
.generation-secondary-actions {
  display: grid;
  align-items: center;
  gap: 5px;
}

.generation-primary-actions {
  grid-template-columns: auto 70px;
  grid-column: 1;
}

.generation-secondary-actions {
  grid-template-columns: repeat(2, auto);
  grid-column: 3;
}

.count-input {
  width: 70px;
}

.generation-footer-progress {
  grid-column: 1 / -1;
}

.project-settings .generation-blocking-reason {
  grid-column: 1 / -1;
  /* Keep nearby actions still when blur replaces a two-line validation message. */
  min-block-size: 2lh;
  margin: 0;
  font-size: 11px;
}

.document-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 20px;
}

.document-action-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.project-settings h2 {
  margin: 0;
  font-size: 13px;
}

.generation-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.settings-section + .settings-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--app-border);
}

.prompt-field {
  display: grid;
  gap: 5px;
  margin-top: 13px;
}

.field-label {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.model-fields {
  display: grid;
  gap: 8px;
  margin-top: 13px;
}

.model-heading,
.model-actions,
.model-summary {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-heading {
  justify-content: space-between;
}

.model-actions {
  gap: 6px;
}

.model-fields :deep(.n-form-item),
.model-fields :deep(.n-select) {
  width: 100%;
}

.model-prediction {
  margin: 0;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.model-summary {
  flex-wrap: wrap;
}

.project-settings .model-message {
  margin: 0;
}

.model-relink {
  display: grid;
  gap: 8px;
  justify-items: start;
}

.seed-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
  margin-top: 13px;
}

.seed-fields :deep(.n-form-item) {
  min-width: 0;
}

.sampling-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 13px;
}

.sampling-input,
.sampling-fields :deep(.n-input),
.sampling-fields :deep(.n-input-number),
.sampling-fields :deep(.n-select) {
  width: 100%;
}

.seed-fields :deep(.n-input-number) {
  width: 100%;
}

.fixed-seed-input {
  width: 100%;
}

.seed-actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.project-settings .seed-diagnostic {
  margin: 8px 0 0;
}

.project-settings .seed-validation,
.project-settings .sampling-validation {
  margin: 8px 0 0;
}

.project-settings p {
  margin: 6px 0 18px;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.generation-area-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bbox-size {
  margin-top: 12px;
}

.fit-bbox-trigger {
  display: inline-flex;
}
</style>
