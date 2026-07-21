<script setup lang="ts">
import { ArrowsMaximize, Refresh } from '@vicons/tabler'
import { NButton, NCard, NCheckbox, NIcon, NModal, NScrollbar, NText } from 'naive-ui'
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
  projectName: string
  sourcePreset: PresetRecord
}>()
const emit = defineEmits<{
  apply: [value: { payload: PresetPayload; selectedSections: PresetSectionKey[] }]
  editOriginal: [id: string]
}>()
const show = defineModel<boolean>('show', { required: true })
const draft = ref(createApplicationDraft(props.sourcePreset))
const expanded = ref<PresetSectionKey[]>([])
const sections = computed(() => includedSections(props.sourcePreset.payload))
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
  () => props.sourcePreset.id,
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
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false">
    <NCard
      :aria-label="`Apply Preset: ${sourcePreset.name}`"
      class="apply-modal"
      role="dialog"
      size="small"
    >
      <header>
        <div>
          <h2>Apply Preset: {{ sourcePreset.name }}</h2>
          <NText depth="3">
            Customize a temporary copy for
            <strong>{{ projectName }}</strong>
            . The saved preset will not change.
          </NText>
        </div>
        <NButton aria-label="Close Apply Preset" circle quaternary @click="show = false">×</NButton>
      </header>
      <NScrollbar class="modal-scroll">
        <div class="modal-content">
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
      </NScrollbar>
      <footer>
        <NButton tertiary @click="emit('editOriginal', sourcePreset.id)">Edit original</NButton>
        <span>
          <NButton tertiary @click="show = false">Cancel</NButton>
          <NButton :disabled="applyDisabled" type="primary" @click="apply">Apply</NButton>
        </span>
      </footer>
    </NCard>
  </NModal>
</template>

<style scoped>
.apply-modal {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(980px, calc(100vw - 80px));
  max-height: calc(100vh - 72px);
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
  min-height: 0;
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
