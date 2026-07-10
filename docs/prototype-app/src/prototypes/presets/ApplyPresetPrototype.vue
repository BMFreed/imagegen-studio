<script setup lang="ts">
import {
  Wand as ApplyIcon,
  Refresh as ResetIcon,
  Settings as SettingsIcon,
  X as XIcon,
} from '@vicons/tabler';
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NIcon,
  NModal,
  NScrollbar,
  NTag,
  NText,
  useMessage,
} from 'naive-ui';
import { computed, ref } from 'vue';

import type { PresetPayload, PresetSectionKey } from './presets.types';

import PresetPayloadEditor from './PresetPayloadEditor.vue';
import { currentProjectPresetSource, presetEditorResources, presetResources } from './presets.mock';
import {
  applicationDraftIsValid,
  clonePreset,
  createApplicationDraft,
  includedSections,
  isPresetSectionEqual,
  presetSectionHasMissingResources,
  sectionLabels,
  summarizePresetSection,
  workflowLabels,
} from './presets.utils';

const message = useMessage();
const show = ref(true);
const sourcePreset = presetResources.find((preset) => preset.id === 'cinematic-img2img-pass')!;
const sourcePayload = clonePreset(sourcePreset.payload);
const projectPayload = ref<PresetPayload>(
  clonePreset(currentProjectPresetSource.definition.payload),
);
const draft = ref(createApplicationDraft(sourcePreset));
const sections = includedSections(sourcePayload);

const selectedCount = computed(() => draft.value.selectedSections.length);
const allSelected = computed(() => selectedCount.value === sections.length);
const partiallySelected = computed(
  () => selectedCount.value > 0 && selectedCount.value < sections.length,
);
const disabledSections = computed(() =>
  sections.filter((section) => !draft.value.selectedSections.includes(section)),
);
const changedSections = computed(() =>
  sections.filter((section) => !isPresetSectionEqual(draft.value.payload, sourcePayload, section)),
);
const selectedMissingResource = computed(() =>
  draft.value.selectedSections.some((section) =>
    presetSectionHasMissingResources(draft.value.payload, section),
  ),
);
const applyDisabled = computed(() => !applicationDraftIsValid(draft.value));

function sectionSelected(section: PresetSectionKey): boolean {
  return draft.value.selectedSections.includes(section);
}

function setSectionSelected(section: PresetSectionKey, selected: boolean) {
  if (selected && !sectionSelected(section)) {
    draft.value.selectedSections.push(section);
  } else if (!selected) {
    draft.value.selectedSections = draft.value.selectedSections.filter(
      (candidate) => candidate !== section,
    );
  }
}

function setAllSections(selected: boolean) {
  draft.value.selectedSections = selected ? [...sections] : [];
}

function resetSection(section: PresetSectionKey) {
  const nextPayload = clonePreset(draft.value.payload);
  const sourceValue = sourcePayload[section];

  if (sourceValue === undefined) {
    Reflect.deleteProperty(nextPayload, section);
  } else {
    Reflect.set(nextPayload, section, clonePreset(sourceValue));
  }

  draft.value.payload = nextPayload;
}

function resetAll() {
  draft.value.payload = clonePreset(sourcePayload);
}

function applyPreset() {
  if (applyDisabled.value) {
    return;
  }

  const nextProjectPayload = clonePreset(projectPayload.value);

  for (const section of draft.value.selectedSections) {
    const value = draft.value.payload[section];

    if (value === undefined) {
      Reflect.deleteProperty(nextProjectPayload, section);
    } else {
      Reflect.set(nextProjectPayload, section, clonePreset(value));
    }
  }

  projectPayload.value = nextProjectPayload;
  show.value = false;
  message.success('Preset applied');
}
</script>

<template>
  <NModal v-model:show="show" :maskClosable="false">
    <NCard
      :aria-label="`Apply Preset: ${sourcePreset.name}`"
      class="apply-card"
      role="dialog"
      size="small"
    >
      <header class="dialog-header">
        <div>
          <h1>Apply Preset: {{ sourcePreset.name }}</h1>
          <NText depth="3">
            Edit what will be copied into
            <strong>{{ currentProjectPresetSource.projectName }}</strong
            >.
          </NText>
        </div>
        <NButton aria-label="Close Apply Preset" circle quaternary @click="show = false">
          <template v-slot:icon><NIcon :component="XIcon" /></template>
        </NButton>
      </header>

      <NScrollbar class="dialog-scroll">
        <div class="dialog-content">
          <div class="preset-tags">
            <NTag type="info">{{ workflowLabels[sourcePreset.workflow] }}</NTag>
            <NTag v-if="sourcePreset.favorite" :bordered="false">Favorite</NTag>
          </div>
          <p class="preset-description">{{ sourcePreset.description }}</p>

          <div class="apply-toolbar">
            <NCheckbox
              :checked="allSelected"
              :indeterminate="partiallySelected"
              @update:checked="setAllSections"
            >
              Select all sections
            </NCheckbox>
            <NButton
              :disabled="changedSections.length === 0"
              size="small"
              tertiary
              @click="resetAll"
            >
              <template v-slot:icon><NIcon :component="ResetIcon" /></template>
              Reset all
            </NButton>
          </div>

          <NAlert
            v-if="selectedMissingResource"
            title="Selected resource is missing"
            type="warning"
          >
            <div class="missing-alert-content">
              <span>
                Resolve the resource, replace it in the expanded section, or deselect the section.
              </span>
              <NButton size="small" tertiary type="warning">
                <template v-slot:icon><NIcon :component="SettingsIcon" /></template>
                Open in Models
              </NButton>
            </div>
          </NAlert>

          <PresetPayloadEditor
            v-model="draft.payload"
            :disabledSections
            :initialExpandedSections="[]"
            :resources="presetEditorResources"
            :sections
            :workflow="sourcePreset.workflow"
          >
            <template v-slot:section-context="{ section }">
              <span class="section-comparison">
                <NText depth="3"
                  >Current: {{ summarizePresetSection(projectPayload, section) }}</NText
                >
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
                :checked="sectionSelected(section)"
                @update:checked="setSectionSelected(section, $event)"
              >
                <span>Apply</span><span class="sr-only"> {{ sectionLabels[section] }}</span>
              </NCheckbox>
            </template>
          </PresetPayloadEditor>
        </div>
      </NScrollbar>

      <footer class="dialog-actions">
        <NText v-if="selectedMissingResource" key="blocked" class="blocked-note">
          Resolve or deselect missing resources to apply.
        </NText>
        <NText v-else key="selection" depth="3"
          >{{ selectedCount }} of {{ sections.length }} sections selected</NText
        >
        <NButton tertiary @click="show = false">Cancel</NButton>
        <NButton :disabled="applyDisabled" type="primary" @click="applyPreset">
          <template v-slot:icon><NIcon :component="ApplyIcon" /></template>
          Apply
        </NButton>
      </footer>
    </NCard>
  </NModal>
</template>

<style scoped>
.apply-card {
  width: min(820px, calc(100vw - 48px));
  height: min(900px, calc(100vh - 80px));
  max-height: calc(100vh - 80px);
  overflow: hidden;
}

.apply-card :deep(.n-card-content) {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
}

.dialog-header,
.dialog-actions,
.preset-tags,
.apply-toolbar {
  display: flex;
  align-items: center;
}

.missing-alert-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dialog-header {
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 14px;
}

h1 {
  margin: 0 0 3px;
  font-size: 18px;
}

.dialog-scroll {
  min-height: 0;
}

.dialog-content {
  display: grid;
  gap: 14px;
  padding-right: 8px;
}

.preset-tags {
  gap: 6px;
}

.preset-description {
  margin: 0;
  padding: 12px;
  border-left: 2px solid var(--workspace-blue);
  background: var(--app-elevated);
}

.apply-toolbar {
  justify-content: space-between;
  gap: 12px;
}

.section-comparison {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
}

.section-comparison .n-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dialog-actions {
  justify-content: end;
  gap: 8px;
  padding-top: 14px;
}

.dialog-actions > :first-child {
  margin-right: auto;
}

.blocked-note {
  color: var(--status-warning);
  font-size: 12px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
