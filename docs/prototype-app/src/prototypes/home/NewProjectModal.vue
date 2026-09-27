<script setup lang="ts">
import type { FormInst, FormRules } from 'naive-ui'

import { AlertTriangle as AlertIcon } from '@vicons/tabler'
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NScrollbar,
  NSelect,
  NText,
} from 'naive-ui'
import { computed, nextTick, reactive, ref, watch } from 'vue'

import type {
  AspectRatioState,
  ResolutionSize,
} from '../../../../../src/renderer/components/resolution-control'
import type {
  PresetApplicationDraft,
  PresetPayload,
  PresetSectionKey,
} from '../presets/presets.types'
import type { HomeProjectRecord, HomeWorkspace, NewProjectDraft } from './home.types'

import ResolutionControl from '../../../../../src/renderer/components/ResolutionControl.vue'
import PresetPayloadEditor from '../presets/PresetPayloadEditor.vue'
import { presetCatalog } from '../presets/presets.catalog'
import { presetEditorResources } from '../presets/presets.mock'
import {
  clonePreset,
  includedSections,
  isPresetSectionEqual,
  presetSectionHasMissingResources,
  sectionLabels,
  summarizePresetSection,
} from '../presets/presets.utils'
import { validateProjectName } from './home.utils'

const props = defineProps<{
  defaultWorkspaceId: string
  projects: HomeProjectRecord[]
  workspaces: HomeWorkspace[]
}>()

const emit = defineEmits<{
  create: [draft: NewProjectDraft]
}>()

const show = defineModel<boolean>('show', { required: true })

const draft = reactive<Omit<NewProjectDraft, 'height' | 'width'>>({
  name: '',
  workspaceId: props.defaultWorkspaceId,
})
const presetDraft = ref<PresetApplicationDraft>()
const sourcePayload = ref<PresetPayload>()
const expandedSections = ref<PresetSectionKey[]>([])
const formRef = ref<FormInst>()
const aspect = ref<AspectRatioState>({ id: 'free', locked: false, value: 1 })
const resolution = ref<ResolutionSize>({ height: 1024, width: 1024 })

const textToImagePresets = computed(() =>
  presetCatalog.value.filter((preset) => preset.workflow === 'textToImage'),
)
const presetOptions = computed(() => [
  { label: 'No preset', value: 'none' },
  ...textToImagePresets.value.map((preset) => ({ label: preset.name, value: preset.id })),
])
const workspaceOptions = computed(() =>
  props.workspaces
    .filter((workspace) => workspace.availability === 'available')
    .map((workspace) => ({ label: workspace.name, value: workspace.id })),
)
const selectedPreset = computed(() =>
  textToImagePresets.value.find((preset) => preset.id === draft.generationPresetId),
)
const sections = computed(() =>
  presetDraft.value ? includedSections(presetDraft.value.payload) : [],
)
const disabledSections = computed(() =>
  sections.value.filter((section) => !presetDraft.value?.selectedSections.includes(section)),
)
const changedSections = computed(() =>
  sourcePayload.value && presetDraft.value
    ? sections.value.filter(
        (section) =>
          !isPresetSectionEqual(presetDraft.value!.payload, sourcePayload.value!, section),
      )
    : [],
)
const selectedPresetHasMissingResource = computed(() =>
  Boolean(
    presetDraft.value?.selectedSections.some((section) =>
      presetSectionHasMissingResources(
        presetDraft.value!.payload,
        section,
        presetEditorResources.embeddings,
      ),
    ),
  ),
)
const canvasSize = computed(() => presetDraft.value?.payload.size ?? resolution.value)
const nameError = computed(() => validateProjectName(draft.name, draft.workspaceId, props.projects))
const formRules: FormRules = {
  name: {
    trigger: 'input',
    validator: () => {
      const error = nameError.value
      return error ? new Error(error) : undefined
    },
  },
}
const valid = computed(
  () =>
    !nameError.value &&
    canvasSize.value.width !== null &&
    canvasSize.value.height !== null &&
    canvasSize.value.width >= 256 &&
    canvasSize.value.height >= 256 &&
    canvasSize.value.width <= 4096 &&
    canvasSize.value.height <= 4096,
)
const allSectionsExpanded = computed(
  () =>
    sections.value.length > 0 &&
    sections.value.every((section) => expandedSections.value.includes(section)),
)

watch(show, (visible) => {
  if (!visible) {
    return
  }
  Object.assign(draft, {
    generationPresetId: undefined,
    name: '',
    workspaceId: props.defaultWorkspaceId,
  })
  presetDraft.value = undefined
  sourcePayload.value = undefined
  expandedSections.value = []
  aspect.value = { id: 'free', locked: false, value: 1 }
  resolution.value = { height: 1024, width: 1024 }
  void nextTick(() => formRef.value?.restoreValidation())
})

function selectPreset(presetId: string) {
  if (presetId === 'none') {
    draft.generationPresetId = undefined
    resolution.value = { height: 1024, width: 1024 }
    aspect.value = { id: 'free', locked: false, value: 1 }
    presetDraft.value = undefined
    sourcePayload.value = undefined
    expandedSections.value = []
    return
  }

  const preset = textToImagePresets.value.find((candidate) => candidate.id === presetId)
  if (!preset) {
    return
  }

  const payload = clonePreset(preset.payload)
  payload.size ??= { height: 1024, width: 1024 }
  const nextSections = includedSections(payload)
  draft.generationPresetId = preset.id
  sourcePayload.value = clonePreset(payload)
  presetDraft.value = {
    payload,
    selectedSections: nextSections.filter((section) => section !== 'seed'),
    sourcePresetId: preset.id,
  }
  expandedSections.value = []
}

function sectionSelected(section: PresetSectionKey) {
  return presetDraft.value?.selectedSections.includes(section) ?? false
}

function setSectionSelected(section: PresetSectionKey, selected: boolean) {
  const current = presetDraft.value
  if (!current || section === 'size') {
    return
  }
  if (selected && !current.selectedSections.includes(section)) {
    current.selectedSections.push(section)
  } else if (!selected) {
    current.selectedSections = current.selectedSections.filter((candidate) => candidate !== section)
  }
}

function resetSection(section: PresetSectionKey) {
  if (!presetDraft.value || !sourcePayload.value) {
    return
  }
  const sourceValue = sourcePayload.value[section]
  if (sourceValue !== undefined) {
    Reflect.set(presetDraft.value.payload, section, clonePreset(sourceValue))
  }
}

function resetAll() {
  if (presetDraft.value && sourcePayload.value) {
    presetDraft.value.payload = clonePreset(sourcePayload.value)
  }
}

function toggleAllSectionsExpanded() {
  expandedSections.value = allSectionsExpanded.value ? [] : [...sections.value]
}

function selectedPayload(): PresetPayload | undefined {
  const current = presetDraft.value
  if (!current) {
    return undefined
  }
  const payload: PresetPayload = {}
  for (const section of current.selectedSections) {
    const value = current.payload[section]
    if (value !== undefined) {
      Reflect.set(payload, section, clonePreset(value))
    }
  }
  return payload
}

function submitProject() {
  const { height, width } = canvasSize.value
  if (!valid.value || height === null || width === null) {
    return
  }
  emit('create', {
    generationPayload: selectedPayload(),
    generationPresetId: draft.generationPresetId,
    height,
    name: draft.name,
    width,
    workspaceId: draft.workspaceId,
  })
  show.value = false
}

function createProject() {
  void formRef.value?.validate((errors) => {
    if (!errors) {
      submitProject()
    }
  })
}
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false">
    <NCard
      aria-label="New Project"
      class="home-modal"
      :class="{ 'home-modal--preset': presetDraft !== undefined }"
      role="dialog"
      size="small"
      title="New Project"
    >
      <NScrollbar
        class="modal-scroll"
        :class="{ 'modal-scroll--preset': presetDraft !== undefined }"
      >
        <NForm ref="formRef" :model="draft" :rules="formRules" @submit.prevent="createProject">
          <div class="modal-form">
            <div class="project-fields">
              <NFormItem class="project-name-field" label="Project name" path="name">
                <NInput
                  v-model:value="draft.name"
                  autofocus
                  :inputProps="{ 'aria-label': 'Project name' }"
                  placeholder="Untitled project"
                />
              </NFormItem>
              <NFormItem label="Workspace">
                <NSelect
                  v-model:value="draft.workspaceId"
                  aria-label="Workspace"
                  :options="workspaceOptions"
                />
              </NFormItem>
              <NFormItem label="Generation preset">
                <NSelect
                  aria-label="Generation preset"
                  :options="presetOptions"
                  :value="draft.generationPresetId ?? 'none'"
                  @update:value="selectPreset"
                />
              </NFormItem>
            </div>

            <template v-if="presetDraft && selectedPreset">
              <NAlert type="default">
                Customize a temporary copy for this project. The saved preset will not change.
              </NAlert>
              <NAlert v-if="selectedPresetHasMissingResource" type="warning">
                <template v-slot:icon><NIcon :component="AlertIcon" /></template>
                Selected settings reference a missing resource. The project can still be created,
                but generation requires replacing it.
              </NAlert>
              <div class="preset-toolbar">
                <NText depth="3">
                  {{ presetDraft.selectedSections.length }} of {{ sections.length }} settings used
                </NText>
                <NButton size="tiny" tertiary @click="toggleAllSectionsExpanded">
                  {{ allSectionsExpanded ? 'Collapse all' : 'Expand all' }}
                </NButton>
                <NButton
                  :disabled="changedSections.length === 0"
                  size="tiny"
                  tertiary
                  @click="resetAll"
                >
                  Reset all
                </NButton>
              </div>
              <PresetPayloadEditor
                v-model="presetDraft.payload"
                v-model:expandedSections="expandedSections"
                :disabledSections
                :resources="presetEditorResources"
                :sections
                :workflow="selectedPreset.workflow"
              >
                <template v-slot:section-context="{ section }">
                  <NText depth="3">
                    Project: {{ summarizePresetSection(presetDraft.payload, section) }}
                  </NText>
                </template>
                <template v-slot:section-actions="{ section }">
                  <NButton
                    v-if="changedSections.includes(section)"
                    :aria-label="`Reset ${sectionLabels[section]}`"
                    size="tiny"
                    tertiary
                    @click="resetSection(section)"
                  >
                    Reset
                  </NButton>
                </template>
                <template v-slot:section-control="{ section }">
                  <NText v-if="section === 'size'" depth="3">Canvas</NText>
                  <NCheckbox
                    v-else
                    :checked="sectionSelected(section)"
                    @update:checked="setSectionSelected(section, $event)"
                  >
                    Use
                    <span class="sr-only">{{ sectionLabels[section] }}</span>
                  </NCheckbox>
                </template>
              </PresetPayloadEditor>
            </template>

            <ResolutionControl
              v-else
              v-model="resolution"
              v-model:aspectRatio="aspect"
              heightLabel="Canvas height"
              :max="4096"
              :min="256"
              widthLabel="Canvas width"
            />
          </div>
        </NForm>
      </NScrollbar>
      <template v-slot:footer>
        <div class="modal-actions">
          <NButton @click="show = false">Cancel</NButton>
          <NButton :disabled="!valid" type="primary" @click="createProject">Create Project</NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.home-modal {
  width: min(680px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
  overflow: visible;
}

.home-modal--preset {
  width: min(820px, calc(100vw - 48px));
  height: min(760px, calc(100vh - 80px));
}

.home-modal--preset :deep(.n-card__content) {
  display: flex;
  min-height: 0;
  overflow: hidden;
}

:deep(.modal-scroll) {
  max-height: calc(100vh - 210px);
}

:deep(.modal-scroll--preset) {
  height: min(620px, calc(100vh - 220px));
  min-height: 0;
  max-height: none;
}

.modal-form {
  display: grid;
  gap: 12px;
  padding-right: 10px;
}

.project-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.project-name-field {
  grid-column: 1 / -1;
}

.preset-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.preset-toolbar .n-text {
  margin-right: auto;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  clip-path: inset(50%);
}
</style>
