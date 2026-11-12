<script setup lang="ts">
import type { ModelCatalogItem, ProjectCreateInput } from '../../shared/api.js'
import type { PresetRecord, PresetSectionKey } from '../../shared/presets/preset-schema.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'
import type { ProjectWorkspaceSummary } from '../../shared/projects/project-workspaces.js'

import {
  NAlert,
  NButton,
  NCheckbox,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NScrollbar,
  NSelect,
  NText,
} from 'naive-ui'
import { computed, nextTick, ref, useId, watch } from 'vue'

import type { ModelManagerFocus } from './model-manager-focus.js'
import type { AspectRatioState } from './resolution-control.js'

import { AppLayer } from '../../../docs/prototype-app/src/theme/app-layers.js'
import {
  emptyNewProjectPresetState,
  newProjectCreateRequest,
  newProjectPresetSections,
  resetNewProjectPreset,
  resetNewProjectPresetSection,
  selectNewProjectPreset,
  setNewProjectPresetSection,
} from './new-project-preset-draft.js'
import { presetNumericInputValid, sectionLabels } from './preset-editor.js'
import { newProjectPresetModelRows } from './preset-model-handoff.js'
import PresetPayloadEditor from './PresetPayloadEditor.vue'
import {
  projectWorkspaceDestinationOptions,
  projectWorkspaceDestinationProblem,
} from './project-workspace-destinations.js'
import { resizeDimension } from './resolution-control.js'
import ResolutionControl from './ResolutionControl.vue'

const props = defineProps<{
  busy: boolean
  catalog: ModelCatalogItem[]
  catalogReady: boolean
  createError: string | null
  initialWorkspaceId: string
  presets: PresetRecord[]
  presetsError: string | null
  presetsLoading: boolean
  suspended: boolean
  workspaces: ProjectWorkspaceSummary[]
  workspacesError: string | null
  workspacesLoading: boolean
}>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{
  create: [input: ProjectCreateInput]
  manageModels: [focus: ModelManagerFocus]
  refreshPresets: []
  refreshWorkspaces: []
  suspended: []
}>()
const formId = useId()
const modalRoot = ref<HTMLElement | null>(null)
let handoffTrigger: HTMLElement | null = null
let handoffActionKey: string | null = null
const title = ref('')
const workspaceId = ref(props.initialWorkspaceId)
const workspaceOptions = computed(() =>
  projectWorkspaceDestinationOptions(props.workspaces, workspaceId.value),
)
const workspaceProblem = computed(() =>
  props.workspacesLoading
    ? null
    : (props.workspacesError ??
      projectWorkspaceDestinationProblem(props.workspaces, workspaceId.value)),
)
const state = ref(emptyNewProjectPresetState())
const expandedSections = ref<PresetSectionKey[]>([])
const editorValid = ref(true)
const rawSections = ref<PresetSectionKey[]>([])
const dialogRevision = ref(0)
const aspect = ref<AspectRatioState>({ id: 'free', locked: false, value: 1 })
const plainRaw = ref<Partial<Record<'height' | 'width', string>>>({})
const plainValidity = ref({ height: true, width: true })
const plainFocused = ref<'height' | 'width' | null>(null)
const customization = computed(() => state.value.customization)
const sections = computed(() => newProjectPresetSections(state.value))
const activePresets = computed(() =>
  props.presets.filter((preset) => preset.deletedAt === null && preset.workflow === 'textToImage'),
)
const presetOptions = computed(() => [
  { label: 'No preset', value: 'none' },
  ...activePresets.value.map((preset) => ({ label: preset.name, value: preset.id })),
])
const request = computed(() => {
  if (
    props.workspacesLoading ||
    props.workspacesError ||
    projectWorkspaceDestinationProblem(props.workspaces, workspaceId.value)
  ) {
    return null
  }
  try {
    const input = newProjectCreateRequest(
      state.value,
      title.value,
      customization.value
        ? editorValid.value
        : plainValidity.value.width && plainValidity.value.height,
    )
    return input ? { ...input, workspaceId: workspaceId.value } : null
  } catch {
    return null
  }
})
const nameProblem = computed(() =>
  title.value.length > 0 && !title.value.trim()
    ? 'Enter a project name.'
    : new TextEncoder().encode(title.value.trim()).length > IGS_SAFETY_CEILINGS.titleBytes
      ? 'Project name is too long.'
      : undefined,
)
const resourceModelRows = computed(() =>
  newProjectPresetModelRows(state.value, props.catalog, props.catalogReady),
)
const changedSections = computed(() =>
  sections.value.filter(
    (section) =>
      JSON.stringify(customization.value?.payload[section]) !==
      JSON.stringify(customization.value?.initialPayload[section]),
  ),
)
const allExpanded = computed(
  () =>
    sections.value.length > 0 &&
    sections.value.every((section) => expandedSections.value.includes(section)),
)

watch(show, (visible) => {
  handoffTrigger = null
  handoffActionKey = null
  if (!visible) {
    return
  }
  title.value = ''
  workspaceId.value = props.initialWorkspaceId
  state.value = emptyNewProjectPresetState()
  expandedSections.value = []
  editorValid.value = true
  rawSections.value = []
  clearPlainRaw()
  aspect.value = { id: 'free', locked: false, value: 1 }
  dialogRevision.value += 1
})
function selectPreset(id: string) {
  if (props.busy || props.suspended) {
    return
  }
  const preset = id === 'none' ? null : activePresets.value.find((candidate) => candidate.id === id)
  if (id !== 'none' && !preset) {
    return
  }
  state.value = selectNewProjectPreset(preset ?? null)
  expandedSections.value = []
  editorValid.value = true
  rawSections.value = []
  clearPlainRaw()
  aspect.value = { id: 'free', locked: false, value: 1 }
  dialogRevision.value += 1
}
function setUsed(section: PresetSectionKey, selected: boolean) {
  if (!props.busy && !props.suspended) {
    setNewProjectPresetSection(state.value, section, selected)
  }
}
function resetSection(section: PresetSectionKey) {
  if (!props.busy && !props.suspended) {
    resetNewProjectPresetSection(state.value, section)
  }
}
function resetAll() {
  if (!props.busy && !props.suspended) {
    resetNewProjectPreset(state.value)
  }
}
function close() {
  if (!props.busy && !props.suspended) {
    show.value = false
  }
}
function create() {
  if (!props.busy && !props.suspended && request.value) {
    emit('create', JSON.parse(JSON.stringify(request.value)) as ProjectCreateInput)
  }
}
function requestModels(focus: ModelManagerFocus, actionKey: string, event: MouseEvent) {
  if (!show.value || props.busy || props.suspended) {
    return
  }
  handoffTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  handoffActionKey = actionKey
  emit('manageModels', focus)
}
function afterLeave() {
  if (show.value && props.suspended) {
    emit('suspended')
  }
}
function afterEnter() {
  if (!handoffActionKey || !show.value || props.suspended) {
    return
  }
  const restored = Array.from(
    modalRoot.value?.querySelectorAll<HTMLButtonElement>('[data-new-project-model-action]') ?? [],
  ).find((button) => button.dataset.newProjectModelAction === handoffActionKey && !button.disabled)
  const target =
    handoffTrigger?.isConnected &&
    modalRoot.value?.contains(handoffTrigger) &&
    !handoffTrigger.hasAttribute('disabled') &&
    handoffTrigger.dataset.newProjectModelAction === handoffActionKey
      ? handoffTrigger
      : (restored ??
        modalRoot.value?.querySelector<HTMLInputElement>('input[aria-label="Project name"]'))
  handoffTrigger = null
  handoffActionKey = null
  target?.focus({ preventScroll: true })
}
function clearPlainRaw() {
  plainRaw.value = {}
  plainValidity.value = { height: true, width: true }
  plainFocused.value = null
}
function dimensionTarget(
  event: Event,
): { dimension: 'height' | 'width'; input: HTMLInputElement } | null {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) {
    return null
  }
  const dimension =
    input.getAttribute('aria-label') === 'Project width'
      ? 'width'
      : input.getAttribute('aria-label') === 'Project height'
        ? 'height'
        : null
  return dimension ? { dimension, input } : null
}
function formatDimension(dimension: 'height' | 'width', value: number | null) {
  const raw = plainRaw.value[dimension]
  return raw !== undefined && (plainFocused.value === dimension || !plainValidity.value[dimension])
    ? raw
    : value === null
      ? ''
      : String(value)
}
function focusDimension(event: Event) {
  plainFocused.value = dimensionTarget(event)?.dimension ?? null
}
function updateDimension(event: Event, blur = false) {
  const target = dimensionTarget(event)
  if (!target || props.busy || props.suspended || customization.value) {
    return
  }
  const { dimension, input } = target
  const limits = { integer: true, max: IGS_SAFETY_CEILINGS.rasterDimension, min: 1 }
  if (blur) {
    plainFocused.value = null
    const raw = plainRaw.value[dimension]
    if (raw !== undefined && presetNumericInputValid(raw, Number(raw), limits)) {
      delete plainRaw.value[dimension]
    }
  } else {
    plainRaw.value[dimension] = input.value
    if (!input.value.trim() || presetNumericInputValid(input.value, Number(input.value), limits)) {
      state.value.resolution = resizeDimension(
        state.value.resolution,
        dimension,
        input.value.trim() ? Number(input.value) : null,
        aspect.value,
        { ...limits, step: 8 },
      )
    }
  }
  const inspect = () => {
    if (!input.isConnected || customization.value) {
      return
    }
    const raw = plainRaw.value[dimension]
    plainValidity.value[dimension] = presetNumericInputValid(
      raw !== undefined && !plainValidity.value[dimension] ? raw : input.value,
      state.value.resolution[dimension],
      limits,
    )
  }
  if (!blur) {
    inspect()
  }
  void nextTick().then(inspect)
}
function sectionSummary(section: PresetSectionKey) {
  const value = customization.value?.payload[section]
  if (
    section === 'size' &&
    value &&
    typeof value === 'object' &&
    'width' in value &&
    'height' in value
  ) {
    return `${value.width ?? '—'} × ${value.height ?? '—'}`
  }
  return section === 'seed' && !customization.value?.selectedSections.includes('seed')
    ? 'Not used by default'
    : customization.value?.selectedSections.includes(section)
      ? 'Used for this project'
      : 'Keep project defaults'
}
</script>

<template>
  <NModal
    :closeOnEsc="!busy && !suspended"
    displayDirective="show"
    :maskClosable="false"
    :show="show && !suspended"
    :zIndex="AppLayer.dialog"
    @afterEnter="afterEnter"
    @afterLeave="afterLeave"
    @update:show="!$event && close()"
  >
    <div
      ref="modalRoot"
      aria-label="New Project"
      aria-modal="true"
      class="home-modal"
      :class="{ 'home-modal--preset': customization !== null }"
      role="dialog"
    >
      <header class="modal-header"><h2>New Project</h2></header>
      <NScrollbar class="modal-scroll">
        <NForm
          :id="formId"
          :disabled="busy || suspended"
          labelPlacement="top"
          @submit.prevent="create"
        >
          <div class="modal-form">
            <NAlert
              v-if="createError"
              aria-label="Project creation failed"
              role="alert"
              type="error"
            >
              {{ createError }}
            </NAlert>
            <NFormItem
              class="project-name-field"
              :feedback="nameProblem"
              label="Project name"
              :validationStatus="nameProblem ? 'error' : undefined"
            >
              <NInput
                v-model:value="title"
                autofocus
                :inputProps="{ 'aria-label': 'Project name' }"
                maxlength="256"
                placeholder="Untitled Project"
              />
            </NFormItem>
            <NFormItem
              :feedback="workspaceProblem ?? undefined"
              label="Workspace"
              :validationStatus="workspaceProblem ? 'error' : undefined"
            >
              <NSelect
                v-model:value="workspaceId"
                aria-label="Project workspace"
                :disabled="busy || workspacesLoading"
                :loading="workspacesLoading"
                :options="workspaceOptions"
                placeholder="Choose a writable workspace"
              />
            </NFormItem>
            <NButton
              v-if="workspaceProblem"
              :disabled="busy || workspacesLoading"
              size="tiny"
              tertiary
              @click="emit('refreshWorkspaces')"
            >
              Refresh workspaces
            </NButton>
            <NFormItem label="Generation preset">
              <NSelect
                aria-label="Generation preset"
                :disabled="busy || presetsLoading"
                :loading="presetsLoading"
                :options="presetOptions"
                :value="customization?.source.id ?? 'none'"
                @update:value="selectPreset"
              />
            </NFormItem>
            <NAlert
              v-if="presetsError"
              key="n-alert-2"
              aria-label="Generation presets unavailable"
              role="alert"
              type="warning"
            >
              {{ presetsError }}
              <NButton
                :disabled="busy || presetsLoading"
                size="tiny"
                tertiary
                @click="emit('refreshPresets')"
              >
                Retry loading presets
              </NButton>
            </NAlert>

            <template v-if="customization">
              <NAlert aria-label="Temporary preset copy" type="default">
                Customize a temporary copy of
                <strong>{{ customization.source.name }}</strong>
                for this project. The saved preset will not change.
              </NAlert>
              <NAlert
                v-if="!catalogReady || resourceModelRows.length"
                :aria-label="
                  catalogReady
                    ? 'New Project preset resources need attention'
                    : 'New Project resource catalog unavailable'
                "
                role="alert"
                type="warning"
              >
                <template v-if="catalogReady">
                  Selected settings reference an unavailable or incompatible resource. You can
                  create this project and repair the settings before generating.
                </template>
                <template v-else>
                  Resource catalog is unavailable. Selected references remain unchanged.
                </template>
                <div aria-label="New Project resource diagnostics">
                  <div v-for="row of resourceModelRows" :key="row.actionKey" class="resource-row">
                    <span>
                      {{ sectionLabels[row.section] }}: {{ row.focus.resource?.resourceName }} ·
                      {{ row.focus.resource?.versionName }}
                    </span>
                    <NButton
                      :aria-label="`Open ${row.focus.resource?.resourceName} in Models`"
                      class="resource-action"
                      :data-new-project-model-action="row.actionKey"
                      :disabled="busy || suspended"
                      size="small"
                      text
                      @click="requestModels(row.focus, row.actionKey, $event)"
                    >
                      Open in Models
                    </NButton>
                  </div>
                </div>
              </NAlert>
              <div class="preset-toolbar">
                <NText class="toolbar-summary" depth="3">
                  {{ customization.selectedSections.length }} of {{ sections.length }} settings used
                </NText>
                <NButton
                  :disabled="busy"
                  size="tiny"
                  tertiary
                  @click="expandedSections = allExpanded ? [] : [...sections]"
                >
                  {{ allExpanded ? 'Collapse all' : 'Expand all' }}
                </NButton>
                <NButton
                  :disabled="busy || (!changedSections.length && !rawSections.length)"
                  size="tiny"
                  tertiary
                  @click="resetAll"
                >
                  Reset all
                </NButton>
              </div>
              <PresetPayloadEditor
                :key="`${customization.source.id}:${dialogRevision}`"
                v-model="customization.payload"
                v-model:expandedSections="expandedSections"
                :catalog
                :catalogReady
                :disabled="busy"
                :fallbackModelFamily="null"
                :sectionRevisions="customization.sectionRevisions"
                :sections
                :selectedSections="customization.selectedSections"
                workflow="textToImage"
                @rawSections="rawSections = $event"
                @validity="editorValid = $event"
              >
                <template v-slot:section-context="{ section }">
                  <NText depth="3">Project: {{ sectionSummary(section) }}</NText>
                </template>
                <template v-slot:section-actions="{ section }">
                  <NButton
                    v-if="changedSections.includes(section) || rawSections.includes(section)"
                    :aria-label="`Reset ${sectionLabels[section]}`"
                    :disabled="busy"
                    size="tiny"
                    tertiary
                    @click="resetSection(section)"
                  >
                    Reset
                  </NButton>
                </template>
                <template v-slot:section-control="{ section }">
                  <NText v-if="section === 'size'" depth="3">Generation area</NText>
                  <NCheckbox
                    v-else
                    :aria-label="`Use ${sectionLabels[section]}`"
                    :aria-labelledby="undefined"
                    :checked="customization.selectedSections.includes(section)"
                    :disabled="busy"
                    @update:checked="setUsed(section, $event)"
                  >
                    Use
                  </NCheckbox>
                </template>
              </PresetPayloadEditor>
              <NText v-if="!editorValid" depth="3">
                Complete the used fields or turn off Use for their sections.
              </NText>
            </template>
            <section v-else aria-label="Initial generation area" class="create-dimensions">
              <h3>Generation area</h3>
              <ResolutionControl
                :key="dialogRevision"
                v-model="state.resolution"
                v-model:aspectRatio="aspect"
                :disabled="busy"
                :heightFormat="(value) => formatDimension('height', value)"
                heightLabel="Project height"
                :max="IGS_SAFETY_CEILINGS.rasterDimension"
                :widthFormat="(value) => formatDimension('width', value)"
                widthLabel="Project width"
                @blur.capture="updateDimension($event, true)"
                @commit="clearPlainRaw"
                @focus.capture="focusDimension"
                @input="updateDimension($event)"
              />
              <NText v-if="!plainValidity.width || !plainValidity.height" depth="3">
                Enter valid whole-number dimensions before creating the project.
              </NText>
              <p>Sets the first generation area. The canvas is unbounded.</p>
            </section>
          </div>
        </NForm>
      </NScrollbar>
      <footer aria-label="New Project actions" class="modal-actions">
        <NButton :disabled="busy" tertiary @click="close">Cancel</NButton>
        <NButton
          attrType="submit"
          :disabled="busy || request === null"
          :form="formId"
          :loading="busy"
          type="primary"
        >
          Create Project
        </NButton>
      </footer>
    </div>
  </NModal>
</template>

<style scoped>
.resource-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}
.resource-row > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.resource-action {
  flex-shrink: 0;
}
.home-modal {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(680px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}
.home-modal--preset {
  width: min(820px, calc(100vw - 48px));
  height: min(760px, calc(100vh - 80px));
}
.modal-header {
  padding: 14px 18px;
  border-bottom: 1px solid var(--app-border);
}
.modal-scroll {
  min-height: 0;
}
.modal-form {
  display: grid;
  gap: 12px;
  padding: 14px 18px;
}
.preset-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.toolbar-summary {
  margin-right: auto;
}
.create-dimensions {
  display: grid;
  gap: 10px;
}
.create-dimensions p {
  margin: 0;
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--app-border);
}
h2,
h3 {
  margin: 0;
}
h2 {
  font-size: 18px;
}
h3 {
  font-size: var(--app-font-size);
}
</style>
