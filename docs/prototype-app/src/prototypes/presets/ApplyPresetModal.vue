<script setup lang="ts">
import { ArrowsMaximize, Edit as EditIcon, InfoCircle as InfoIcon, Refresh } from '@vicons/tabler'
import { NAlert, NButton, NCard, NCheckbox, NIcon, NModal, NTag, NText, NTooltip } from 'naive-ui'
import { computed, ref, watch } from 'vue'

import type { PresetPayload, PresetRecord, PresetSectionKey } from './presets.types'

import PresetPayloadEditor from './PresetPayloadEditor.vue'
import { presetEditorResources } from './presets.mock'
import {
  clonePreset,
  createApplicationDraft,
  includedSections,
  isPresetSectionEqual,
  presetSectionHasMissingResources,
  sectionLabels,
  summarizePresetSection,
  workflowLabels,
} from './presets.utils'

const props = defineProps<{
  currentPayload: PresetPayload
  excludeSize?: boolean
  projectName: string
  sourcePreset: PresetRecord
  targetLabel?: string
}>()
const emit = defineEmits<{
  apply: [value: { payload: PresetPayload; selectedSections: PresetSectionKey[] }]
  editOriginal: [id: string]
}>()
const show = defineModel<boolean>('show', { required: true })
const draft = ref(createApplicationDraft(props.sourcePreset))
const editOriginalConfirm = ref(false)
const expanded = ref<PresetSectionKey[]>([])
const sections = computed(() =>
  includedSections(props.sourcePreset.payload).filter(
    (section) => !props.excludeSize || section !== 'size',
  ),
)
const missingSections = computed(() =>
  draft.value.selectedSections.filter((section) =>
    presetSectionHasMissingResources(
      draft.value.payload,
      section,
      presetEditorResources.embeddings,
    ),
  ),
)
const allSelected = computed(() => draft.value.selectedSections.length === sections.value.length)
const changedSections = computed(() =>
  sections.value.filter(
    (section) => !isPresetSectionEqual(draft.value.payload, props.sourcePreset.payload, section),
  ),
)
const initialSelectedSections = computed(
  () => createApplicationDraft(props.sourcePreset).selectedSections,
)
const selectionChanged = computed(() =>
  sections.value.some(
    (section) =>
      draft.value.selectedSections.includes(section) !==
      initialSelectedSections.value.includes(section),
  ),
)
const applicationDraftDirty = computed(
  () => changedSections.value.length > 0 || selectionChanged.value,
)
const applyDisabled = computed(
  () =>
    draft.value.selectedSections.length === 0 ||
    draft.value.selectedSections.some((section) =>
      presetSectionHasMissingResources(
        draft.value.payload,
        section,
        presetEditorResources.embeddings,
      ),
    ),
)
watch(
  () => [props.sourcePreset.id, show.value],
  () => {
    draft.value = createApplicationDraft(props.sourcePreset)
    expanded.value = []
  },
)
function setSelected(section: PresetSectionKey, selected: boolean) {
  draft.value.selectedSections = selected
    ? [...new Set([...draft.value.selectedSections, section])]
    : draft.value.selectedSections.filter((item) => item !== section)
}
function resetSection(section: PresetSectionKey) {
  const nextPayload = clonePreset(draft.value.payload)
  const sourceValue = props.sourcePreset.payload[section]

  if (sourceValue === undefined) {
    Reflect.deleteProperty(nextPayload, section)
  } else {
    Reflect.set(nextPayload, section, clonePreset(sourceValue))
  }

  draft.value.payload = nextPayload
}
function resetAll() {
  draft.value.payload = clonePreset(props.sourcePreset.payload)
}
function requestEditOriginal() {
  if (applicationDraftDirty.value) {
    editOriginalConfirm.value = true
    return
  }

  openOriginal()
}
function apply() {
  emit('apply', {
    payload: clonePreset(draft.value.payload),
    selectedSections: [...draft.value.selectedSections],
  })
  show.value = false
}
function openOriginal() {
  editOriginalConfirm.value = false
  show.value = false
  emit('editOriginal', props.sourcePreset.id)
}
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false">
    <NCard
      :aria-label="`Apply Preset: ${sourcePreset.name}`"
      class="apply-modal"
      role="dialog"
      size="small"
    >
      <template v-slot:header>
        <header>
          <div>
            <div class="title-line">
              <h2>Apply Preset: {{ sourcePreset.name }}</h2>
              <NTooltip trigger="hover">
                <template v-slot:trigger>
                  <NButton aria-label="About Apply Preset" circle quaternary size="tiny">
                    <template v-slot:icon><NIcon :component="InfoIcon" /></template>
                  </NButton>
                </template>
                <div class="apply-help">
                  <strong>Apply copies selected settings into the current project.</strong>
                  <span>Changes made here do not update the saved preset.</span>
                  <span>The project does not stay linked to the preset after applying.</span>
                </div>
              </NTooltip>
            </div>
            <NText class="application-context" depth="3">
              Customize a temporary copy for
              <strong>{{ projectName }}{{ targetLabel ? ` · ${targetLabel}` : '' }}</strong>
              . The saved preset will not change.
            </NText>
          </div>
          <NButton aria-label="Close Apply Preset" circle quaternary @click="show = false">
            ×
          </NButton>
        </header>
      </template>
      <div class="modal-scroll">
        <div class="modal-content">
          <div class="preset-meta">
            <NTag type="info">{{ workflowLabels[sourcePreset.workflow] }}</NTag>
            <NButton size="small" tertiary @click="requestEditOriginal">
              <template v-slot:icon><NIcon :component="EditIcon" /></template>
              Edit original
            </NButton>
          </div>
          <p v-if="sourcePreset.description.trim()" class="preset-description">
            {{ sourcePreset.description }}
          </p>
          <NAlert v-if="missingSections.length" title="Selected resource is missing" type="warning">
            <p v-for="section of missingSections" :key="section">
              {{ sectionLabels[section] }}: {{ summarizePresetSection(draft.payload, section) }}
            </p>
            Replace the resource in its section, or deselect the section to keep your current
            settings.
          </NAlert>
          <div class="modal-toolbar">
            <NCheckbox
              :checked="allSelected"
              :indeterminate="draft.selectedSections.length > 0 && !allSelected"
              @update:checked="draft.selectedSections = $event ? [...sections] : []"
            >
              Select all sections
            </NCheckbox>
            <span>
              <NButton
                size="small"
                tertiary
                @click="expanded = expanded.length === sections.length ? [] : [...sections]"
              >
                <template v-slot:icon><NIcon :component="ArrowsMaximize" /></template>
                {{ expanded.length === sections.length ? 'Collapse all' : 'Expand all' }}
              </NButton>
              <NButton
                :disabled="changedSections.length === 0"
                size="small"
                tertiary
                @click="resetAll"
              >
                <template v-slot:icon><NIcon :component="Refresh" /></template>
                Reset all
              </NButton>
            </span>
          </div>
          <PresetPayloadEditor
            v-model="draft.payload"
            v-model:expandedSections="expanded"
            :disabledSections="
              sections.filter((section) => !draft.selectedSections.includes(section))
            "
            :resources="presetEditorResources"
            :sections
            :workflow="sourcePreset.workflow"
          >
            <template v-slot:section-context="{ section }">
              <span class="comparison">
                <NText depth="3">
                  Current: {{ summarizePresetSection(currentPayload, section) }}
                </NText>
                <NText depth="3">Apply: {{ summarizePresetSection(draft.payload, section) }}</NText>
              </span>
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
              <NCheckbox
                :checked="draft.selectedSections.includes(section)"
                @update:checked="setSelected(section, $event)"
              >
                Apply
                <span class="sr-only">{{ sectionLabels[section] }}</span>
              </NCheckbox>
            </template>
          </PresetPayloadEditor>
        </div>
      </div>
      <template v-slot:footer>
        <footer>
          <span>
            <NButton tertiary @click="show = false">Cancel</NButton>
            <NButton :disabled="applyDisabled" type="primary" @click="apply">Apply</NButton>
          </span>
        </footer>
      </template>
    </NCard>
  </NModal>
  <NModal v-model:show="editOriginalConfirm">
    <NCard
      aria-label="Edit saved preset"
      class="edit-confirm"
      role="dialog"
      size="small"
      title="Edit the saved preset?"
    >
      Changes in this temporary application will be discarded. The Preset Manager will open the
      saved original.
      <template v-slot:footer>
        <footer>
          <NButton @click="editOriginalConfirm = false">Keep editing here</NButton>
          <NButton type="primary" @click="openOriginal">Open original</NButton>
        </footer>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.application-context {
  font-size: 13px;
  font-weight: 400;
}
.title-line,
.preset-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}
.preset-meta {
  justify-content: space-between;
}
.apply-help {
  display: grid;
  gap: 4px;
  max-width: 380px;
}
.preset-description {
  margin: 0;
  padding: 10px 12px;
  border-left: 2px solid var(--workspace-blue);
  background: var(--app-elevated);
}
.edit-confirm {
  width: min(460px, calc(100vw - 48px));
}
.apply-modal {
  width: min(980px, calc(100vw - 80px));
  max-height: calc(100vh - 48px);
}
header,
footer,
.modal-toolbar,
.modal-toolbar span,
footer span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
h2 {
  margin: 0;
  font-size: 18px;
}
.modal-scroll {
  overflow: auto;
  max-height: calc(100vh - 230px);
}
.modal-content p {
  margin: 4px 0;
}
.modal-content {
  display: grid;
  gap: 10px;
  padding: 10px 0;
}
.comparison {
  display: grid;
  min-width: 0;
}
.comparison .n-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
footer {
  padding-top: 10px;
  border-top: 1px solid var(--app-border);
}
</style>
