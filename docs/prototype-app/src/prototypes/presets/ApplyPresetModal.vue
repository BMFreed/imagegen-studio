<script setup lang="ts">
import { ArrowsMaximize, Refresh } from '@vicons/tabler'
import { NAlert, NButton, NCard, NCheckbox, NIcon, NModal, NText } from 'naive-ui'
import { computed, ref, watch } from 'vue'

import type { PresetPayload, PresetRecord, PresetSectionKey } from './presets.types'

import PresetPayloadEditor from './PresetPayloadEditor.vue'
import { presetEditorResources } from './presets.mock'
import {
  clonePreset,
  createApplicationDraft,
  includedSections,
  presetSectionHasMissingResources,
  sectionLabels,
  summarizePresetSection,
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
            <h2>Apply Preset: {{ sourcePreset.name }}</h2>
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
              <NButton size="small" tertiary @click="draft = createApplicationDraft(sourcePreset)">
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
          <NButton tertiary @click="editOriginalConfirm = true">Edit original</NButton>
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
  margin: 0 0 3px;
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
