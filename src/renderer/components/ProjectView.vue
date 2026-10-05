<script setup lang="ts">
import type {
  ModelCatalogItem,
  ProjectApi,
  ProjectEmbeddingIdentity,
  ProjectGenerationActionState,
  ProjectGenerationDraftChange,
  ProjectGenerationResultsSnapshot,
  ProjectLoraIdentity,
  ProjectTab,
} from '../../shared/api.js'
import {
  ANIMA_SAMPLING_METHOD_OPTIONS,
  isAnimaSamplingMethod,
} from '../../shared/projects/anima-sampling-method.js'
import { getEffectiveDynamicPromptSettings } from '../../shared/projects/generation-dynamic-settings.js'
import type { GenerationProgressSnapshot } from '../../shared/projects/generation-progress.js'
import { progressForJob } from '../../shared/projects/generation-progress.js'
import {
  compareRasterGenerationSettings,
  type RasterGenerationData,
} from '../../shared/projects/generation-settings-comparison.js'
import {
  ILLUSTRIOUS_SCHEDULER_PAIRS,
  isIllustriousSamplingDraftPair,
} from '../../shared/projects/illustrious-scheduler.js'
import {
  generationTargetSignature,
  type ProjectGenerationTargetState,
} from '../../shared/projects/project-generation-target-state.js'
import type { IgsRectV1 } from '../../shared/projects/project-schema.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'
import {
  embeddingSourcesFromCatalog,
  getPromptEmbeddingMatches,
  type PromptEmbeddingRef,
  type PromptEmbeddingSelection,
} from '../../shared/projects/prompt-embeddings.js'

import {
  X as CancelIcon,
  Trash as ClearHistoryIcon,
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
import { computed, h, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'

import type { CandidateExportFeedback } from './candidate-export-feedback.js'
import type { GenerationResultFocusRequest } from './generation-queue-result.js'
import type { ModelManagerFocus } from './model-manager-focus.js'
import type { ResolutionSize } from './resolution-control'

import {
  type AcceptedHistoryFocusRequest,
  acceptedHistoryLayerAvailable,
} from './accepted-history-navigation.js'
import { animaDraftGenerationReason, animaEngineReason } from './anima-generation-control.js'
import {
  cfgRescaleGenerationCapabilityReason,
  cfgRescaleGenerationRangeReason,
} from './cfg-rescale-control.js'
import { denoisingGenerationReason, denoisingRuntimeSupport } from './denoising-strength-control.js'
import DynamicPromptPreview from './DynamicPromptPreview.vue'
import { GenerationTargetReader } from './generation-target-reader.js'
import GenerationProgressIndicator from './GenerationProgressIndicator.vue'
import GenerationSettingsComparison from './GenerationSettingsComparison.vue'
import PlainPromptEditor from './PlainPromptEditor.vue'
import { fitTargetBounds } from './project-canvas-geometry.js'
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
import ProjectDenoisingStrength from './ProjectDenoisingStrength.vue'
import ProjectGenerationAdvancedOptions from './ProjectGenerationAdvancedOptions.vue'
import ProjectLayerStack from './ProjectLayerStack.vue'
import ProjectLoraStack from './ProjectLoraStack.vue'
import ProjectModelOption from './ProjectModelOption.vue'
import ProjectQueuePanel from './ProjectQueuePanel.vue'
import ProjectVaePicker from './ProjectVaePicker.vue'
import { promptEmbeddingDiagnosticReason } from './prompt-embeddings-codemirror.js'
import PromptEmbeddingDiagnostics from './PromptEmbeddingDiagnostics.vue'
import ResolutionControl from './ResolutionControl.vue'
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
  modelCatalog: ModelCatalogItem[]
  modelCatalogError: string | null
  modelCatalogLoaded: boolean
  modelCatalogLoading: boolean
  pending: 'bbox' | 'clear-history' | 'import-image' | 'model' | 'redo' | 'save' | 'undo' | null
  promptHistoryEpoch: number
  reloadRequired: boolean
  runtimeUnavailableReason: string | null
  saveNotice: string | null
  tab: ProjectTab
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
  addLora: [identity: ProjectLoraIdentity]
  applyBbox: [rect: IgsRectV1]
  cancelGeneration: []
  clearExportFeedback: []
  clearHistory: []
  generate: [iterations: number]
  importImage: []
  manageModels: [focus: ModelManagerFocus | null]
  moveLayer: [layerId: string, targetIndex: number]
  redo: []
  refreshGenerationResults: []
  refreshGenerationState: []
  refreshModels: []
  relinkEmbedding: [identity: ProjectEmbeddingIdentity]
  relinkLora: [identity: ProjectLoraIdentity]
  relinkModel: []
  relinkVae: []
  removeLora: [identity: ProjectLoraIdentity]
  resultFocusHandled: [revision: number]
  save: []
  saveCandidateImage: [candidateId: string]
  sealPromptHistory: [historyGroupId: string]
  selectModel: [selection: { resourceId: string; versionId: string } | null]
  selectVae: [selection: { resourceId: string; versionId: string } | null]
  undo: []
  updateDraft: [change: ProjectGenerationDraftChange, historyGroupId?: string]
  updateLayer: [layerId: string, change: Parameters<ProjectApi['updateRasterLayer']>[2]]
  validateDraft: [tabId: string, valid: boolean]
}>()

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
const dynamicSettings = computed({
  get: () => getEffectiveDynamicPromptSettings(props.generationDraft.dynamicPrompt),
  set: (value) => {
    if (!props.busy && !props.reloadRequired) {
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
  emit(
    'updateDraft',
    { kind: `${polarity}-prompt`, text, ...(embeddingSelection ? { embeddingSelection } : {}) },
    beginPromptEdit(polarity),
  )
}

function openEmbeddingManager(reference: PromptEmbeddingRef | undefined) {
  emit(
    'manageModels',
    reference
      ? {
          resourceId: reference.resource.localModelId,
          resourceName: reference.resource.displayName,
          versionId: reference.resource.localVersionId,
          versionName: reference.resource.versionName,
        }
      : null,
  )
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
  const model = selectedModel.value
  emit(
    'manageModels',
    model
      ? {
          resourceId: model.localModelId,
          resourceName: model.displayName,
          versionId: model.localVersionId,
          versionName: model.versionName,
        }
      : null,
  )
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
    props.busy ||
    props.reloadRequired ||
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
  denoisingRuntimeSupport(selectedModel.value?.baseModelFamily ?? null, props.generationState),
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
    props.busy ||
    props.reloadRequired ||
    selectedModel.value?.baseModelFamily !== 'anima' ||
    (value !== null && !isAnimaSamplingMethod(value)) ||
    (props.generationDraft.sampling.animaMethod ?? null) === value
  ) {
    return
  }
  emit('updateDraft', { kind: 'anima-method', value })
}

function updateSampler(sampler: string | null) {
  if (props.busy || props.reloadRequired || illustriousSamplingUnavailable.value) {
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
    props.busy ||
    props.reloadRequired ||
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
const targetSignature = computed(() => generationTargetSignature(props.tab))
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
  if (props.busy || props.reloadRequired || props.generationDraft.sampling.steps === value) {
    return
  }
  emit('updateDraft', { kind: 'sampling-steps', value })
}

function restoreInvalidSamplingSteps() {
  if (samplingStepsInvalid.value) {
    const restored = props.generationDraft.sampling.steps
    rawSamplingStepsInvalid.value = false
    samplingStepsInput.value = restored
    void nextTick(() => {
      samplingStepsInput.value = restored
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
  if (parsed.kind === 'invalid' || props.busy || props.reloadRequired) {
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
  if (props.busy || props.reloadRequired || policy === props.generationDraft.seed.policy) {
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
  if (props.busy || props.reloadRequired || props.generationDraft.seed.policy === 'random') {
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
    props.busy ||
    props.reloadRequired ||
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

const selectedLayerId = ref<string | null>(null)
const layersPanel = ref<InstanceType<typeof ProjectLayerStack> | null>(null)
const comparisonLayerId = ref<string | null>(null)
const comparisonData = ref<RasterGenerationData | null>(null)
const comparisonLoading = ref(false)
const comparisonError = ref<string | null>(null)
let comparisonRequest = 0
const comparisonSections = computed(() =>
  comparisonData.value
    ? compareRasterGenerationSettings(comparisonData.value, {
        bbox: props.tab.primaryBbox,
        generationDraft: props.generationDraft,
        modelCatalog:
          props.modelCatalogLoaded && !props.modelCatalogLoading ? props.modelCatalog : null,
        modelCatalogError: props.modelCatalogError,
        reuseSeed: lastActualSeed.value,
      })
    : [],
)
// Resource capabilities include the document revision; the source pixels only depend on asset SHA.
const comparisonSourceKey = computed(() =>
  JSON.stringify({
    bbox: props.tab.primaryBbox,
    layers: props.tab.layers.map(({ imageUrl, locked: _locked, name: _name, ...layer }) => ({
      ...layer,
      asset: /\/([a-f0-9]{64})\/[a-f0-9]{64}\.img$/.exec(imageUrl)?.[1] ?? imageUrl,
    })),
  }),
)
watch(
  [
    comparisonLayerId,
    () => props.tab.id,
    () => props.tab.documentId,
    comparisonSourceKey,
    () => props.draftPending,
    () => props.reloadRequired,
  ],
  async (values, previous) => {
    const request = ++comparisonRequest
    const layerId = comparisonLayerId.value
    comparisonError.value = null
    comparisonData.value = null
    comparisonLoading.value = false
    if (!layerId) {
      return
    }
    if (previous && (values[1] !== previous[1] || values[2] !== previous[2])) {
      comparisonLayerId.value = null
      return
    }
    if (
      props.reloadRequired ||
      !props.tab.acceptedResults.some((result) => result.layerId === layerId)
    ) {
      comparisonLayerId.value = null
      return
    }
    comparisonLoading.value = true
    if (props.draftPending) {
      return
    }
    const documentId = props.tab.documentId
    const tabId = props.tab.id
    try {
      const api = globalThis.window.api?.projects
      if (!api) {
        throw new Error('The application connection is unavailable.')
      }
      const result = await api.getRasterGenerationData(tabId, documentId, layerId)
      if (request !== comparisonRequest || comparisonLayerId.value !== layerId) {
        return
      }
      if (!result.ok) {
        throw new Error(result.error.message)
      }
      comparisonData.value = result.value
    } catch (cause) {
      if (request === comparisonRequest) {
        comparisonError.value =
          cause instanceof Error ? cause.message : 'Generation data could not be read.'
      }
    } finally {
      if (request === comparisonRequest) {
        comparisonLoading.value = false
      }
    }
  },
)
onBeforeUnmount(() => {
  comparisonRequest += 1
})
function closeComparison() {
  const layerId = comparisonLayerId.value
  comparisonLayerId.value = null
  if (layerId) {
    void nextTick(() => {
      const row = layersPanel.value?.$el.querySelector(
        `[data-layer-id="${CSS.escape(layerId)}"]`,
      ) as HTMLElement | null
      row?.querySelector<HTMLElement>('[data-entity-menu-trigger]')?.focus({ preventScroll: true })
    })
  }
}
const acceptedResultsOpen = ref(false)
const acceptedResultsContext = ref<{ documentId: string; projectId: string } | null>(null)
const acceptedResultRevealLayerId = ref<string | null>(null)
watch(
  () => [props.acceptedHistoryFocus, props.busy, props.reloadRequired] as const,
  async ([request, busy, reloadRequired]) => {
    if (!request || busy || reloadRequired || !acceptedHistoryLayerAvailable(props.tab, request)) {
      return
    }
    selectedLayerId.value = request.layerId
    await nextTick()
    if (
      props.acceptedHistoryFocus?.requestId !== request.requestId ||
      props.busy ||
      props.reloadRequired ||
      !acceptedHistoryLayerAvailable(props.tab, request)
    ) {
      return
    }
    layersPanel.value?.revealLayer(request.layerId)
    emit('acceptedHistoryFocusHandled', request.requestId)
  },
  { immediate: true },
)
watch(
  () => [props.tab.id, props.tab.documentId] as const,
  () => {
    acceptedResultsOpen.value = false
    acceptedResultsContext.value = null
    acceptedResultRevealLayerId.value = null
  },
)

function openAcceptedResults() {
  if (props.busy || props.reloadRequired) {
    return
  }
  acceptedResultsContext.value = { documentId: props.tab.documentId, projectId: props.tab.id }
  acceptedResultRevealLayerId.value = null
  acceptedResultsOpen.value = true
}

function selectAcceptedResultLayer(layerId: string) {
  const context = acceptedResultsContext.value
  if (
    !acceptedResultsOpen.value ||
    !context ||
    context.projectId !== props.tab.id ||
    context.documentId !== props.tab.documentId ||
    props.busy ||
    props.reloadRequired ||
    !props.tab.acceptedResults.some((result) => result.layerId === layerId) ||
    !props.tab.layers.some((layer) => layer.id === layerId)
  ) {
    return
  }
  selectedLayerId.value = layerId
  acceptedResultRevealLayerId.value = layerId
  acceptedResultsOpen.value = false
}

function revealAcceptedResultLayer() {
  const context = acceptedResultsContext.value
  const layerId = acceptedResultRevealLayerId.value
  acceptedResultRevealLayerId.value = null
  if (!context || !layerId) {
    return
  }
  // Modal focus restoration finishes before revealing a row in the Layers viewport.
  void nextTick(() => {
    if (
      !acceptedResultsOpen.value &&
      context.projectId === props.tab.id &&
      context.documentId === props.tab.documentId &&
      selectedLayerId.value === layerId &&
      props.tab.acceptedResults.some((result) => result.layerId === layerId) &&
      props.tab.layers.some((layer) => layer.id === layerId)
    ) {
      layersPanel.value?.revealLayer(layerId)
    }
  })
}
watch(
  () => [props.tab.id, props.tab.documentId, props.tab.layers] as const,
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
    if (selectedLayerId.value && !layers.some((layer) => layer.id === selectedLayerId.value)) {
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
    label === 'Generation area width'
      ? 'width'
      : label === 'Generation area height'
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
    () => props.tab.primaryBbox.height,
    () => props.tab.primaryBbox.width,
    () => props.tab.primaryBbox.x,
    () => props.tab.primaryBbox.y,
  ],
  () => {
    Object.assign(draft, props.tab.primaryBbox)
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
  (['x', 'y', 'width', 'height'] as const).some((key) => draft[key] !== props.tab.primaryBbox[key]),
)

function applyBbox() {
  if (!validBbox.value || !bboxChanged.value || props.busy || props.reloadRequired) {
    return
  }
  const { height, width, x, y } = draft
  if (x === null || y === null || width === null || height === null) {
    return
  }
  emit('applyBbox', { height, width, x, y })
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

const generationBlockingReason = computed(() => {
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
    (props.generationDraft.positivePrompt.embeddingRefs.length ||
      props.generationDraft.negativePrompt.embeddingRefs.length) &&
    !props.generationState.embeddingsSupported
  ) {
    return 'This image engine does not support embeddings yet. Remove their activation tokens to generate.'
  }
  const denoisingReason = denoisingGenerationReason(
    targetState.value?.mode ?? null,
    props.generationDraft.sampling.denoisingStrength,
    props.generationState.img2imgSupported,
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
    props.tab.layers.find(
      (layer) => layer.id === selectedLayerId.value && layer.visible && layer.opacity > 0,
    ) ?? null,
)
const fitBbox = computed<IgsRectV1 | null>(() => {
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
      (key) => fitBbox.value?.[key] !== props.tab.primaryBbox[key],
    ),
)

function applyFitBbox() {
  if (fitBbox.value && canFitBbox.value && !props.busy && !props.reloadRequired) {
    emit('applyBbox', fitBbox.value)
  }
}
</script>

<template>
  <section :aria-label="`Project ${tab.title}`" class="project-view">
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
          <p v-if="generationBlockingReason" class="generation-blocking-reason" role="status">
            {{ generationBlockingReason }}
          </p>
        </footer>
        <div class="settings-scroll">
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
              <h2>Generation</h2>
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
                :disabled="busy || reloadRequired"
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
                :disabled="busy || reloadRequired"
                :matches="positiveEmbeddingMatches"
                title="Positive prompt"
                @manage="openEmbeddingManager"
                @relink="relinkEmbedding('positive', $event)"
              />
            </div>
            <div class="prompt-field">
              <PlainPromptEditor
                ariaLabel="Negative prompt"
                :disabled="busy || reloadRequired"
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
                :disabled="busy || reloadRequired"
                :matches="negativeEmbeddingMatches"
                title="Negative prompt"
                @manage="openEmbeddingManager"
                @relink="relinkEmbedding('negative', $event)"
              />
            </div>
            <ProjectLoraStack
              :catalog="modelCatalog"
              :catalogReady="modelCatalogLoaded && !modelCatalogError"
              :disabled="busy || reloadRequired"
              :draft="generationDraft"
              :loading="modelCatalogLoading"
              @add="emit('addLora', $event)"
              @change="emit('updateDraft', $event)"
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
                :disabled="busy || reloadRequired"
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
                  :disabled="busy || reloadRequired || illustriousSamplingUnavailable"
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
                    busy ||
                    reloadRequired ||
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
                    :disabled="busy || reloadRequired"
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
                  :disabled="busy || reloadRequired"
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
              :editingDisabled="busy || reloadRequired"
              :modelFamily="selectedModel?.baseModelFamily ?? null"
              :modelValue="generationDraft.sampling.denoisingStrength"
              :runtimeUnavailableReason
              :supported="denoisingRuntimeSupported"
              :target="targetState"
              :targetError
              @update:modelValue="
                emit('updateDraft', { kind: 'denoising-strength', value: $event })
              "
              @validity="denoisingValid = $event"
            />
            <div class="seed-fields">
              <NFormItem label="Seed" :showFeedback="false">
                <div class="fixed-seed-input" @input.capture="captureFixedSeedInput">
                  <NInputNumber
                    :disabled="busy || reloadRequired || generationDraft.seed.policy === 'random'"
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
                  :disabled="busy || reloadRequired"
                  size="small"
                  :value="generationDraft.seed.policy === 'random'"
                  @update:value="updateSeedPolicy($event ? 'random' : 'fixed')"
                />
              </NFormItem>
              <div class="seed-actions">
                <NButton
                  :disabled="busy || reloadRequired || generationDraft.seed.policy === 'random'"
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
                    busy ||
                    reloadRequired ||
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
              :editingDisabled="busy || reloadRequired"
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
                  :disabled="busy || reloadRequired"
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
            aria-label="Generation area"
            class="settings-section"
            @input.capture="captureBboxInput"
            @keydown.enter="applyBboxOnEnter"
          >
            <div class="generation-area-heading">
              <h2>Generation area</h2>
              <NTooltip>
                <template v-slot:trigger>
                  <span class="fit-bbox-trigger">
                    <NButton
                      aria-label="Fit to active layer"
                      circle
                      :disabled="!canFitBbox || busy || reloadRequired"
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
                  !activeFitLayer
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
              :disabled="busy || reloadRequired"
              heightLabel="Generation area height"
              layout="expanded-preview"
              :max="IGS_SAFETY_CEILINGS.rasterDimension"
              widthLabel="Generation area width"
              @commit="commitBboxAfterUpdate"
            />
          </section>
        </div>
      </aside>

      <ProjectCanvas
        :key="tab.id"
        :bbox="tab.primaryBbox"
        :canRedo="tab.canRedo"
        :canUndo="tab.canUndo"
        :candidateActionsDisabled="busy"
        :disabled="busy || reloadRequired"
        :documentId="tab.documentId"
        :generationResults="generationResults?.candidates ?? []"
        :generationResultsLoading
        :historyPending="pending === 'undo' || pending === 'redo' ? pending : null"
        :layers="tab.layers"
        :projectKey="tab.id"
        :resultFocus="generationResultFocus"
        :selectedLayerId
        @acceptCandidates="emit('acceptCandidates', $event)"
        @changeBbox="emit('applyBbox', $event)"
        @redo="emit('redo')"
        @refreshGenerationResults="emit('refreshGenerationResults')"
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

      <DnDProvider :autoScrollViewport="false">
        <ProjectLayerStack
          ref="layersPanel"
          v-model:comparisonLayerId="comparisonLayerId"
          v-model:selectedLayerId="selectedLayerId"
          :disabled="busy || reloadRequired"
          :generatedLayerIds="tab.acceptedResults.map((result) => result.layerId)"
          :importing="pending === 'import-image'"
          :layers="tab.layers"
          @importImage="emit('importImage')"
          @move="(layerId, targetIndex) => emit('moveLayer', layerId, targetIndex)"
          @update="(layerId, change) => emit('updateLayer', layerId, change)"
        >
          <template v-slot:comparison="{ layer }">
            <GenerationSettingsComparison
              :key="`${tab.id}:${tab.documentId}:${layer.id}`"
              :error="comparisonError"
              :layerName="layer.name"
              :loading="comparisonLoading"
              :sections="comparisonSections"
              @close="closeComparison"
            />
          </template>
          <template v-slot:header-actions>
            <NButton
              aria-label="Accepted results"
              :disabled="busy || reloadRequired"
              quaternary
              size="tiny"
              @click="openAcceptedResults"
            >
              Accepted results
            </NButton>
          </template>
        </ProjectLayerStack>
      </DnDProvider>
    </div>
    <ProjectAcceptedResults
      :key="`${tab.id}:${tab.documentId}`"
      v-model:show="acceptedResultsOpen"
      :disabled="busy || reloadRequired"
      :layers="tab.layers"
      :results="tab.acceptedResults"
      @closed="revealAcceptedResultLayer"
      @selectLayer="selectAcceptedResultLayer"
    />
    <DynamicPromptPreview
      v-model:settings="dynamicSettings"
      v-model:show="dynamicPreviewOpen"
      :disabled="busy || reloadRequired"
      :negativePrompt="generationDraft.negativePrompt.text"
      :positivePrompt="generationDraft.positivePrompt.text"
    />
  </section>
</template>

<style scoped>
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
