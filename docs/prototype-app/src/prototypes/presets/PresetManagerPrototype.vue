<script setup lang="ts">
import { NButton, NCard, NModal, NText, useDialog, useMessage } from 'naive-ui';
import { computed, ref } from 'vue';

import type { PresetRecord, PresetWorkflow } from './presets.types';

import PresetEditor from './PresetEditor.vue';
import PresetList from './PresetList.vue';
import PresetManagerHeader from './PresetManagerHeader.vue';
import PresetManagerNavigation from './PresetManagerNavigation.vue';
import { defaultPresetId, presetResources } from './presets.mock';
import {
  clonePreset,
  isPresetEqual,
  presetHasMissingResources,
  presetSearchText,
} from './presets.utils';

type WorkflowFilter = 'all' | PresetWorkflow;
type PendingNavigation = { id: string; type: 'select' } | { type: 'close' };

const dialog = useDialog();
const message = useMessage();
const presets = ref(presetResources.map((preset) => clonePreset(preset)));
const selectedId = ref(defaultPresetId);
const draft = ref(getSelectedPreset());
const managerOpen = ref(true);
const workflowFilter = ref<WorkflowFilter>('all');
const searchFilter = ref('');
const sortValue = ref<'name' | 'recent'>('name');
const favoritesOnly = ref(false);
const attentionOnly = ref(false);
const pendingNavigation = ref<PendingNavigation | null>(null);
const showUnsavedDialog = ref(false);

const selectedPreset = computed(() => getSelectedPreset());
const dirty = computed(() => !isPresetEqual(draft.value, selectedPreset.value));
const hasActiveFilters = computed(
  () =>
    workflowFilter.value !== 'all' ||
    searchFilter.value.trim() !== '' ||
    favoritesOnly.value ||
    attentionOnly.value,
);
const visiblePresets = computed(() => {
  const query = searchFilter.value.trim().toLocaleLowerCase();
  const filtered = presets.value.filter(
    (preset) =>
      (workflowFilter.value === 'all' || preset.workflow === workflowFilter.value) &&
      (!favoritesOnly.value || preset.favorite) &&
      (!attentionOnly.value || presetHasMissingResources(preset)) &&
      (query === '' || presetSearchText(preset).includes(query)),
  );

  return filtered.toSorted((left, right) =>
    sortValue.value === 'name'
      ? left.name.localeCompare(right.name)
      : Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
});

function getSelectedPreset(): PresetRecord {
  const preset = presets.value.find((candidate) => candidate.id === selectedId.value);
  const fallbackPreset = presets.value[0];

  if (preset) {
    return clonePreset(preset);
  }

  if (fallbackPreset) {
    return clonePreset(fallbackPreset);
  }

  throw new Error('Preset Manager prototype requires at least one mock preset.');
}

function resetFilters() {
  workflowFilter.value = 'all';
  searchFilter.value = '';
  favoritesOnly.value = false;
  attentionOnly.value = false;
}

function selectPreset(id: string) {
  selectedId.value = id;
  draft.value = getSelectedPreset();
}

function requestSelection(id: string) {
  if (id === selectedId.value) {
    return;
  }

  if (!dirty.value) {
    selectPreset(id);
    return;
  }

  pendingNavigation.value = { id, type: 'select' };
  showUnsavedDialog.value = true;
}

function requestClose() {
  if (!dirty.value) {
    managerOpen.value = false;
    return;
  }

  pendingNavigation.value = { type: 'close' };
  showUnsavedDialog.value = true;
}

function saveDraft(showMessage = true) {
  const index = presets.value.findIndex((preset) => preset.id === selectedId.value);

  if (
    index < 0 ||
    draft.value.name.trim() === '' ||
    Object.keys(draft.value.payload).length === 0
  ) {
    return;
  }

  draft.value.updatedAt = new Date().toISOString();
  presets.value[index] = clonePreset(draft.value);
  draft.value = getSelectedPreset();

  if (showMessage) {
    message.success('Preset saved');
  }
}

function completePendingNavigation() {
  const pending = pendingNavigation.value;
  pendingNavigation.value = null;
  showUnsavedDialog.value = false;

  if (!pending) {
    return;
  }

  if (pending.type === 'select') {
    selectPreset(pending.id);
  } else {
    managerOpen.value = false;
  }
}

function saveAndContinue() {
  saveDraft(false);
  completePendingNavigation();
}

function discardAndContinue() {
  draft.value = getSelectedPreset();
  completePendingNavigation();
}

function duplicatePreset() {
  const copy = clonePreset(draft.value);
  const selectedIndex = presets.value.findIndex((preset) => preset.id === selectedId.value);
  copy.id = `${copy.id}-copy-${Date.now()}`;
  copy.name = `${copy.name} Copy`;
  copy.updatedAt = new Date().toISOString();
  presets.value.splice(selectedIndex + 1, 0, copy);
  selectPreset(copy.id);
  message.success('Preset duplicated');
}

function deletePreset() {
  dialog.warning({
    content: 'Delete this preset? Projects that already used it will not be changed.',
    negativeText: 'Cancel',
    onPositiveClick: () => {
      const selectedIndex = presets.value.findIndex((preset) => preset.id === selectedId.value);
      presets.value.splice(selectedIndex, 1);
      const nextPreset = presets.value[Math.min(selectedIndex, presets.value.length - 1)];

      if (nextPreset) {
        selectPreset(nextPreset.id);
      }

      message.success('Preset deleted');
    },
    positiveButtonProps: { type: 'error' },
    positiveText: 'Delete',
    title: 'Delete preset',
  });
}
</script>

<template>
  <section v-if="managerOpen" aria-label="Preset Manager prototype" class="manager-backdrop">
    <section class="manager-shell">
      <PresetManagerHeader @close="requestClose" />
      <div class="manager-body">
        <aside class="manager-column manager-column--navigation">
          <PresetManagerNavigation v-model:workflow="workflowFilter" :presets />
        </aside>
        <main class="preset-content">
          <PresetList
            v-model:attentionOnly="attentionOnly"
            v-model:favoritesOnly="favoritesOnly"
            v-model:search="searchFilter"
            v-model:sort="sortValue"
            :hasActiveFilters
            :presets="visiblePresets"
            :selectedId
            @resetFilters="resetFilters"
            @select="requestSelection"
          />
        </main>
        <aside class="manager-column manager-column--editor">
          <PresetEditor
            v-model="draft"
            :dirty
            @delete="deletePreset"
            @duplicate="duplicatePreset"
            @save="saveDraft"
          />
        </aside>
      </div>
    </section>

    <NModal v-model:show="showUnsavedDialog" :maskClosable="false">
      <NCard aria-label="Unsaved preset changes" class="unsaved-card" role="dialog" size="small">
        <h2>Unsaved changes</h2>
        <NText depth="3">Save your changes before leaving this preset?</NText>
        <div class="unsaved-actions">
          <NButton tertiary @click="showUnsavedDialog = false">Cancel</NButton>
          <NButton secondary type="error" @click="discardAndContinue">Discard</NButton>
          <NButton type="primary" @click="saveAndContinue">Save</NButton>
        </div>
      </NCard>
    </NModal>
  </section>
</template>

<style scoped>
.manager-backdrop {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 36px 48px;
  background: var(--app-overlay-backdrop);
  backdrop-filter: blur(7px);
}

.manager-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(1500px, 100%);
  height: min(890px, 100%);
  min-height: 620px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}

.manager-body {
  display: grid;
  grid-template-columns:
    clamp(200px, 15%, 220px)
    minmax(420px, 1fr)
    clamp(460px, 38%, 560px);
  min-width: 0;
  min-height: 0;
}

.manager-column,
.preset-content {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.manager-column--navigation,
.preset-content {
  border-right: 1px solid var(--app-border);
}

.unsaved-card {
  width: min(440px, calc(100vw - 48px));
}

.unsaved-card h2 {
  margin: 0 0 4px;
  font-size: 18px;
}

.unsaved-actions {
  display: flex;
  justify-content: end;
  gap: 8px;
  margin-top: 20px;
}
</style>
