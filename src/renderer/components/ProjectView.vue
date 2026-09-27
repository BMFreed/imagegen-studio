<script setup lang="ts">
import type {
  ModelCatalogItem,
  ProjectApi,
  ProjectGenerationDraftChange,
  ProjectLoraIdentity,
  ProjectTab,
} from '../../shared/api.js'
import type { IgsRectV1 } from '../../shared/projects/project-schema.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'

import { DeviceFloppy as SaveIcon } from '@vicons/tabler'
import { DnDProvider } from '@vue-dnd-kit/core'
import {
  NAlert,
  NButton,
  NFormItem,
  NIcon,
  NInput,
  NInputNumber,
  NSelect,
  NTag,
  type SelectOption,
} from 'naive-ui'
import { computed, h, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'

import type { ResolutionSize } from './resolution-control'

import PlainPromptEditor from './PlainPromptEditor.vue'
import { fitTargetBounds } from './project-canvas-geometry.js'
import {
  checkpointCatalog,
  planModelResourceSelection,
  portableModelRelinkCandidate,
  savedModelAvailability,
  selectableVersion,
} from './project-model-picker.js'
import ProjectCanvas from './ProjectCanvas.vue'
import ProjectLayerStack from './ProjectLayerStack.vue'
import ProjectLoraStack from './ProjectLoraStack.vue'
import ProjectModelOption from './ProjectModelOption.vue'
import ResolutionControl from './ResolutionControl.vue'

const props = defineProps<{
  busy: boolean
  draftPending: boolean
  error: string | null
  generationDraft: ProjectTab['generationDraft']
  modelCatalog: ModelCatalogItem[]
  modelCatalogError: string | null
  modelCatalogLoaded: boolean
  modelCatalogLoading: boolean
  pending: 'bbox' | 'import-image' | 'model' | 'save' | null
  reloadRequired: boolean
  saveNotice: string | null
  tab: ProjectTab
}>()

const emit = defineEmits<{
  addLora: [identity: ProjectLoraIdentity]
  applyBbox: [rect: IgsRectV1]
  importImage: []
  manageModels: []
  moveLayer: [layerId: string, targetIndex: number]
  refreshModels: []
  relinkLora: [identity: ProjectLoraIdentity]
  relinkModel: []
  removeLora: [identity: ProjectLoraIdentity]
  save: []
  selectModel: [selection: { resourceId: string; versionId: string } | null]
  updateDraft: [change: ProjectGenerationDraftChange]
  updateLayer: [layerId: string, change: Parameters<ProjectApi['updateRasterLayer']>[2]]
  validateDraft: [tabId: string, valid: boolean]
}>()

const models = computed(() => checkpointCatalog(props.modelCatalog))
const selectedModel = computed(() => props.generationDraft.model)
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

const seedOptions = [
  { label: 'Random', value: 'random' },
  { label: 'Fixed', value: 'fixed' },
  { label: 'Reuse last', value: 'reuse' },
]
const fixedSeedInput = ref<number | null>(null)
const rawFixedSeedInvalid = ref(false)
const fixedSeedInvalid = computed(
  () =>
    props.generationDraft.seed.policy === 'fixed' &&
    (rawFixedSeedInvalid.value ||
      fixedSeedInput.value === null ||
      !Number.isSafeInteger(fixedSeedInput.value) ||
      fixedSeedInput.value < 0 ||
      fixedSeedInput.value > 0xff_ff_ff_ff),
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
const draftInvalid = computed(
  () =>
    !lorasValid.value ||
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
      fixedSeedInput.value = seed.value
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

function updateSeedPolicy(policy: string) {
  if (props.busy || props.reloadRequired || policy === props.generationDraft.seed.policy) {
    return
  }
  if (policy === 'fixed') {
    const value = fixedSeedInput.value ?? props.tab.lastActualSeedSnapshot ?? 0
    fixedSeedInput.value = value
    emit('updateDraft', { kind: 'seed', policy: 'fixed', value })
  } else if (policy === 'random' || policy === 'reuse') {
    emit('updateDraft', { kind: 'seed', policy, value: null })
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
    return
  }
  updateFixedSeed(value)
}

function restoreInvalidFixedSeed() {
  if (fixedSeedInvalid.value) {
    const restored = props.generationDraft.seed.value ?? 0
    rawFixedSeedInvalid.value = false
    fixedSeedInput.value = restored
    void nextTick(() => {
      fixedSeedInput.value = restored
    })
  }
}

const selectedLayerId = ref<string | null>(null)
watch(
  () => [props.tab.id, props.tab.layers] as const,
  ([tabId, layers], previous) => {
    if (previous && previous[0] !== tabId) {
      selectedLayerId.value = null
      return
    }
    const previousLayers = previous?.[1] ?? []
    const previousIds = new Set(previousLayers.map((layer) => layer.id))
    const added = layers.filter((layer) => !previousIds.has(layer.id))
    if (previous && layers.length === previousLayers.length + 1 && added.length === 1) {
      selectedLayerId.value = added[0]?.id ?? null
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

watch(
  () => props.tab.primaryBbox,
  (bbox) => Object.assign(draft, bbox),
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

const fitBbox = computed<IgsRectV1 | null>(() => {
  const selected = props.tab.layers.find(
    (layer) => layer.id === selectedLayerId.value && layer.visible && layer.opacity > 0,
  )
  const visible = selected
    ? [selected]
    : props.tab.layers.filter((layer) => layer.visible && layer.opacity > 0)
  if (visible.length === 0) {
    return null
  }
  const bounds = fitTargetBounds(visible, props.tab.primaryBbox)
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
    <div class="project-notices">
      <NAlert v-if="error" title="Project action failed" type="error">{{ error }}</NAlert>
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
    </div>

    <div class="project-layout">
      <aside aria-label="Project settings" class="project-settings">
        <div class="document-actions">
          <span
            class="document-state"
            :class="{ 'document-state--dirty': tab.dirty || draftPending }"
          >
            {{ tab.dirty || draftPending ? 'Unsaved changes' : 'Saved' }}
          </span>
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
        <section aria-label="Generation settings" class="settings-section">
          <h2>Generation</h2>
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
                <NButton aria-label="Manage Models" size="tiny" text @click="emit('manageModels')">
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
              <span v-if="selectedModel.predictionType" class="model-prediction">
                Prediction: {{ selectedModel.predictionType }}
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
            <span class="field-label">Positive prompt</span>
            <PlainPromptEditor
              ariaLabel="Positive prompt"
              :disabled="busy || reloadRequired"
              :modelValue="generationDraft.positivePrompt.text"
              @update:modelValue="emit('updateDraft', { kind: 'positive-prompt', text: $event })"
            />
          </div>
          <div class="prompt-field">
            <span class="field-label">Negative prompt</span>
            <PlainPromptEditor
              ariaLabel="Negative prompt"
              :disabled="busy || reloadRequired"
              :modelValue="generationDraft.negativePrompt.text"
              @update:modelValue="emit('updateDraft', { kind: 'negative-prompt', text: $event })"
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
          <div class="seed-fields">
            <NFormItem label="Seed policy" :showFeedback="false">
              <NSelect
                aria-label="Seed policy"
                :disabled="busy || reloadRequired"
                :options="seedOptions"
                size="small"
                :value="generationDraft.seed.policy"
                @update:value="updateSeedPolicy"
              />
            </NFormItem>
            <NFormItem
              v-if="generationDraft.seed.policy === 'fixed'"
              label="Fixed seed"
              :showFeedback="false"
            >
              <div class="fixed-seed-input" @input.capture="captureFixedSeedInput">
                <NInputNumber
                  :disabled="busy || reloadRequired"
                  :inputProps="{ 'aria-label': 'Fixed seed' }"
                  :max="0xff_ff_ff_ff"
                  :min="0"
                  :showButton="false"
                  size="small"
                  :value="fixedSeedInput"
                  @blur="restoreInvalidFixedSeed"
                  @update:value="updateFixedSeed"
                />
              </div>
            </NFormItem>
          </div>
          <p v-if="fixedSeedInvalid" class="seed-validation" role="alert">
            Enter a fixed seed from 0 to 4294967295 before saving.
          </p>
          <p
            v-if="generationDraft.seed.policy === 'reuse' && tab.lastActualSeedSnapshot === null"
            class="seed-diagnostic"
            role="status"
          >
            No completed generation has a seed to reuse. Generate will be unavailable until one
            completes.
          </p>
          <p v-else-if="generationDraft.seed.policy === 'reuse'" class="seed-diagnostic">
            Last saved seed: {{ tab.lastActualSeedSnapshot }}
          </p>
        </section>
        <section aria-label="Generation area" class="settings-section">
          <h2>Generation area</h2>
          <p>Set the position and size of the area used for the next image.</p>
          <div class="bbox-fields">
            <NFormItem label="X" :showFeedback="false">
              <NInputNumber
                v-model:value="draft.x"
                :inputProps="{ 'aria-label': 'Generation area X' }"
                :max="IGS_SAFETY_CEILINGS.coordinateMagnitude"
                :min="-IGS_SAFETY_CEILINGS.coordinateMagnitude"
                :showButton="false"
              />
            </NFormItem>
            <NFormItem label="Y" :showFeedback="false">
              <NInputNumber
                v-model:value="draft.y"
                :inputProps="{ 'aria-label': 'Generation area Y' }"
                :max="IGS_SAFETY_CEILINGS.coordinateMagnitude"
                :min="-IGS_SAFETY_CEILINGS.coordinateMagnitude"
                :showButton="false"
              />
            </NFormItem>
          </div>
          <ResolutionControl
            v-model="draftSize"
            class="bbox-size"
            :disabled="busy || reloadRequired"
            heightLabel="Generation area height"
            :max="IGS_SAFETY_CEILINGS.rasterDimension"
            widthLabel="Generation area width"
          />
          <NButton
            aria-label="Apply generation area"
            class="apply-bbox"
            :disabled="!validBbox || !bboxChanged || busy || reloadRequired"
            :loading="pending === 'bbox'"
            @click="applyBbox"
          >
            Apply
          </NButton>
          <NButton
            aria-label="Fit generation area to visible layers"
            class="fit-bbox"
            :disabled="!canFitBbox || busy || reloadRequired"
            secondary
            @click="applyFitBbox"
          >
            Fit to visible layers
          </NButton>
        </section>
      </aside>

      <ProjectCanvas
        :key="tab.id"
        :bbox="tab.primaryBbox"
        :disabled="busy || reloadRequired"
        :layers="tab.layers"
        :selectedLayerId
        @changeBbox="emit('applyBbox', $event)"
        @selectLayer="selectedLayerId = $event"
      />

      <DnDProvider :autoScrollViewport="false">
        <ProjectLayerStack
          v-model:selectedLayerId="selectedLayerId"
          :disabled="busy || reloadRequired"
          :importing="pending === 'import-image'"
          :layers="tab.layers"
          @importImage="emit('importImage')"
          @move="(layerId, targetIndex) => emit('moveLayer', layerId, targetIndex)"
          @update="(layerId, change) => emit('updateLayer', layerId, change)"
        />
      </DnDProvider>
    </div>
  </section>
</template>

<style scoped>
.project-view {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
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
  min-width: 0;
  overflow: auto;
  scrollbar-color: var(--app-border) transparent;
  scrollbar-width: thin;
  padding: 14px 12px;
  border-right: 1px solid var(--app-border);
  background: var(--app-surface);
}

.document-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 20px;
}

.project-settings h2 {
  margin: 0;
  font-size: 13px;
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
  gap: 9px;
  margin-top: 13px;
}

.sampling-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 13px;
}

.sampling-input,
.sampling-fields :deep(.n-input),
.sampling-fields :deep(.n-input-number) {
  width: 100%;
}

.seed-fields :deep(.n-select),
.seed-fields :deep(.n-input-number) {
  width: 100%;
}

.fixed-seed-input {
  width: 100%;
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

.bbox-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 8px;
}

.bbox-fields :deep(.n-input-number) {
  width: 100%;
}

.bbox-size {
  margin-top: 14px;
}

.apply-bbox {
  width: 100%;
  margin-top: 18px;
}

.fit-bbox {
  width: 100%;
  margin-top: 8px;
}
</style>
