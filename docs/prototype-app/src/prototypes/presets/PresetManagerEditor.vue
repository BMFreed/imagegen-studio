<script setup lang="ts">
import {
  AlertTriangle as AlertIcon,
  X as CancelIcon,
  Copy as CopyIcon,
  DeviceFloppy as SaveIcon,
  Settings as SettingsIcon,
  Trash as TrashIcon,
} from '@vicons/tabler';
import { NAlert, NButton, NCheckbox, NIcon, NScrollbar, NText } from 'naive-ui';
import { computed, ref } from 'vue';

import type {
  PresetCreateIntent,
  PresetDefinition,
  PresetEditorResources,
  PresetSectionKey,
} from './presets.types';

import PresetMetadataForm from './PresetMetadataForm.vue';
import PresetPayloadEditor from './PresetPayloadEditor.vue';
import {
  isPresetDefinitionValid,
  presetHasMissingResources,
  sectionOrder,
  setPresetSectionIncluded,
} from './presets.utils';

const props = defineProps<{
  createIntent?: PresetCreateIntent;
  creating: boolean;
  dirty: boolean;
  resources: PresetEditorResources;
}>();

const emit = defineEmits<{
  cancel: [];
  create: [];
  delete: [];
  duplicate: [];
  save: [];
}>();

const definition = defineModel<PresetDefinition>({ required: true });
const expandedSections = ref<PresetSectionKey[]>(['prompt', 'model', 'loras']);
const isValid = computed(() => isPresetDefinitionValid(definition.value));
const hasMissingResources = computed(() => presetHasMissingResources(definition.value));
const projectSource = computed(() =>
  props.createIntent?.kind === 'project' ? props.createIntent : undefined,
);

function sectionIncluded(section: PresetSectionKey): boolean {
  return definition.value.payload[section] !== undefined;
}

function setSectionIncluded(section: PresetSectionKey, included: boolean) {
  setPresetSectionIncluded(definition.value.payload, section, included, definition.value.workflow);
}
</script>

<template>
  <section class="preset-editor">
    <NScrollbar class="editor-scroll">
      <div class="editor-content">
        <NAlert
          v-if="projectSource"
          key="source"
          class="source-banner"
          title="Source project"
          type="info"
        >
          <strong>{{ projectSource.projectName }}</strong>
          <span> · {{ projectSource.projectSummary }}</span>
          <p>Seed is not included by default to avoid accidentally repeating generations.</p>
        </NAlert>

        <PresetMetadataForm v-model="definition" />

        <NAlert v-if="hasMissingResources" key="missing" title="Missing resource" type="warning">
          <div class="missing-alert-content">
            <span>One or more resources used by this preset are not installed.</span>
            <NButton size="small" tertiary type="warning">
              <template v-slot:icon><NIcon :component="SettingsIcon" /></template>
              Open in Models
            </NButton>
          </div>
        </NAlert>

        <PresetPayloadEditor
          v-model="definition.payload"
          v-model:expandedSections="expandedSections"
          :resources
          :sections="[...sectionOrder]"
          :workflow="definition.workflow"
        >
          <template v-slot:section-control="{ section }">
            <NCheckbox
              :checked="sectionIncluded(section)"
              @update:checked="setSectionIncluded(section, $event)"
            >
              Included
            </NCheckbox>
          </template>
          <template v-slot:section-empty="{ section }">
            <NText depth="3">
              <template v-if="section === 'seed' && projectSource">
                Seed is excluded by default to avoid repeating the same image.
              </template>
              <template v-else>This section will not be saved in the preset.</template>
            </NText>
          </template>
        </PresetPayloadEditor>
      </div>
    </NScrollbar>

    <footer class="editor-actions" :class="{ 'editor-actions--creating': creating }">
      <template v-if="creating">
        <NButton size="small" tertiary @click="emit('cancel')">
          <template v-slot:icon><NIcon :component="CancelIcon" /></template>
          Cancel
        </NButton>
        <span class="save-status-slot">
          <NText class="save-status" type="warning">
            <NIcon :component="AlertIcon" />
            Not saved
          </NText>
        </span>
        <NButton :disabled="!isValid" size="small" type="primary" @click="emit('create')">
          <template v-slot:icon><NIcon :component="SaveIcon" /></template>
          Create Preset
        </NButton>
      </template>
      <template v-else>
        <NButton size="small" tertiary type="error" @click="emit('delete')">
          <template v-slot:icon><NIcon :component="TrashIcon" /></template>
          Delete
        </NButton>
        <NButton secondary size="small" @click="emit('duplicate')">
          <template v-slot:icon><NIcon :component="CopyIcon" /></template>
          Duplicate
        </NButton>
        <span class="save-status-slot">
          <NText v-if="dirty" class="save-status" type="warning">
            <NIcon :component="AlertIcon" />
            Unsaved changes
          </NText>
        </span>
        <NButton :disabled="!dirty || !isValid" size="small" type="primary" @click="emit('save')">
          <template v-slot:icon><NIcon :component="SaveIcon" /></template>
          Save Changes
        </NButton>
      </template>
    </footer>
  </section>
</template>

<style scoped>
.preset-editor {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.editor-scroll {
  min-height: 0;
  height: 100%;
}

.editor-content {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.source-banner p {
  margin: 4px 0 0;
}

.missing-alert-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-actions {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 54px;
  padding: 9px 14px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
}

.editor-actions--creating {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.save-status-slot,
.save-status {
  display: inline-flex;
  align-items: center;
}

.save-status-slot {
  justify-self: end;
}

.save-status {
  gap: 5px;
  white-space: nowrap;
}

@media (max-width: 1350px) {
  .editor-actions:not(.editor-actions--creating) {
    grid-template-columns: auto auto minmax(0, 1fr);
  }

  .editor-actions:not(.editor-actions--creating) .save-status-slot {
    display: none;
  }
}
</style>
